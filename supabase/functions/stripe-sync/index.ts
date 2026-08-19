// stripe-sync
//
// Pulls succeeded charges from the user's connected Stripe account into
// public.imported_sales. Read-only against Stripe; the only thing it writes is
// our own table.
//
// Called by the browser with the user's JWT. Safe to call repeatedly: the unique
// index on (user_id, source, external_id) makes every run idempotent, which is
// the single most important property here — a double-counted sync would corrupt
// every revenue figure in the app and there would be no way to tell.
//
// Two phases per run:
//   1. Import charges into imported_sales (the money).
//   2. Backfill product_name / product_id for any rows lacking them (the labels),
//      bounded per run and self-healing across runs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// How far back a first sync reaches. A brand new connection pulling five years of
// history would rewrite the user's quarter figures with sales from before they
// ever used the app.
const FIRST_SYNC_DAYS = 120
// Re-examine a window before the last sync, because a charge can settle slightly
// after it is created and would otherwise fall through the gap.
const OVERLAP_MINUTES = 60
const PAGE_SIZE = 100
const MAX_PAGES = 10

// Product-name resolution costs up to three extra Stripe calls per sale (payment
// intent, invoice, product), so it is bounded per run and self-heals: anything
// left unnamed is picked up by the next sync. The product lookup is cached, so
// the third call amortises to roughly nothing across repeat sales of one offer.
// See resolveProduct() for why the name is not read off the charge.
const NAME_LOOKUP_BUDGET = 150
const NAME_LOOKUP_CONCURRENCY = 6

// Stripe reports minor units for most currencies, but not for all of them. These
// have no minor unit at all, so 1000 means 1000 yen, not 10.00.
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
])

function toMajorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100
}

// A read against the user's own Stripe account, using the user's own restricted
// key. There is no Stripe-Account header any more: with Connect OAuth we borrowed
// the platform key and named the account, but the key IS the account now.
//
// Returns null rather than throwing: a product name is a nice-to-have, and one
// unreadable invoice must not fail a sync that is otherwise importing money
// correctly.
async function stripeGet(path: string, apiKey: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return null
    return await res.json()
  } catch (_err) {
    return null
  }
}

// The product id on a line item. Verified against Jen's live account: on the
// current API version an invoice line has NO `price` object, it has
// `pricing.price_details.product`. The older `price.product` shape is still
// accepted because checkout session line items use it and older accounts may too.
// Getting this wrong is silent - the field is simply undefined and every sale
// falls through to its description.
function lineProductId(line: any): string | null {
  const modern = line?.pricing?.price_details?.product
  if (typeof modern === 'string') return modern

  const legacy = line?.price?.product
  if (typeof legacy === 'string') return legacy
  if (legacy && typeof legacy === 'object' && typeof legacy.id === 'string') return legacy.id

  return null
}

// Product names are fetched rather than expanded, because the expand path
// (`lines.data.price.product`) does not resolve on the current API version and
// fails silently. Cached per run: a user with three offers and ninety sales
// costs three lookups, not ninety.
async function productName(
  productId: string,
  cache: Map<string, string | null>,
  apiKey: string
): Promise<string | null> {
  if (cache.has(productId)) return cache.get(productId) ?? null
  const product = await stripeGet(`products/${productId}`, apiKey)
  const name = typeof product?.name === 'string' ? product.name : null
  cache.set(productId, name)
  return name
}

// Finding the invoice is its own problem. On Jen's account `charge.invoice` does
// not exist at all, and neither does `payment_intent.invoice` - the link is at
// `payment_intent.payment_details.order_reference`. Both older shapes are still
// checked first so this keeps working on accounts pinned to older versions.
async function resolveInvoiceId(
  row: { invoice_id: string | null; payment_intent_id: string | null },
  apiKey: string
): Promise<string | null> {
  if (row.invoice_id) return row.invoice_id
  if (!row.payment_intent_id) return null

  const intent = await stripeGet(`payment_intents/${row.payment_intent_id}`, apiKey)
  if (!intent) return null

  if (typeof intent.invoice === 'string') return intent.invoice
  if (intent.invoice?.id) return intent.invoice.id

  const reference = intent.payment_details?.order_reference
  return typeof reference === 'string' && reference.startsWith('in_') ? reference : null
}

// Why this exists: NO charge on a real account names the product. Every
// subscription payment reads "Subscription update" and one-off payments read
// "Payment to <business>". Mapping revenue by charge.description would produce a
// by-offer chart reading "Subscription update - 68%", which is worse than no
// chart because it looks like data.
//
// The real name lives on the invoice line items (subscriptions) or the checkout
// session line items (payment links), which is what invoice_id and
// payment_intent_id were captured for.
//
// Always returns a name. Leaving a row null would mean re-attempting the same
// unresolvable sale on every future sync, burning the budget forever.
async function resolveProduct(
  row: { description: string | null; invoice_id: string | null; payment_intent_id: string | null },
  cache: Map<string, string | null>,
  apiKey: string
): Promise<{ product_id: string | null; product_name: string }> {
  // Subscriptions and anything else Stripe invoiced.
  const invoiceId = await resolveInvoiceId(row, apiKey)
  if (invoiceId) {
    const invoice = await stripeGet(`invoices/${invoiceId}`, apiKey)
    const line = invoice?.lines?.data?.[0]
    if (line) {
      const productId = lineProductId(line)
      const name = productId ? await productName(productId, cache, apiKey) : null
      // line.description reads "1 × CEOPlanner (at $17.00 / month)" - worse than
      // the bare product name, but far better than "Subscription update".
      const label = name ?? (typeof line.description === 'string' ? line.description : null)
      if (label) return { product_id: productId, product_name: label }
    }
  }

  // One-off payments through a Stripe checkout session or payment link.
  if (row.payment_intent_id) {
    // Sessions are not retrievable by payment intent directly, so list first.
    const sessions = await stripeGet(
      `checkout/sessions?payment_intent=${encodeURIComponent(row.payment_intent_id)}&limit=1`,
      apiKey
    )
    const sessionId = sessions?.data?.[0]?.id
    if (sessionId) {
      // Line items are a sub-resource here, not an expandable field on the list.
      const items = await stripeGet(`checkout/sessions/${sessionId}/line_items?limit=1`, apiKey)
      const item = items?.data?.[0]
      if (item) {
        const productId = lineProductId(item)
        const name = productId ? await productName(productId, cache, apiKey) : null
        const label = name ?? (typeof item.description === 'string' ? item.description : null)
        if (label) return { product_id: productId, product_name: label }
      }
    }
  }

  // Charges created by a third-party platform (Jen has several from an app
  // called "Your store") have neither an invoice nor a session we can read.
  // Their description is all there is.
  return { product_id: null, product_name: row.description || 'Stripe sale' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Please sign in first.' }, 401)

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    const user = userData?.user
    if (userError || !user) return json({ error: 'Please sign in first.' }, 401)

    // Importing is a Pro feature, and this is where that is actually enforced.
    // The client-side gate is presentation only.
    //
    // This used to compute the rule inline, which made it the THIRD definition
    // of "is this account Pro" and the only one that disagreed: it read
    // 'trialing' as Pro without ever looking at trial_ends_at, so a lapsed trial
    // could still import, and it knew nothing about comp_pro, so a comped
    // account got Pro everywhere except here. is_pro_account() is the one
    // definition; it wraps account_access(). Never re-inline it.
    const { data: profileRow } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profileRow) return json({ error: 'Account not fully set up. Contact support.' }, 403)

    const { data: isPro, error: proError } = await supabaseAdmin
      .rpc('is_pro_account', { p_user_id: user.id })

    if (proError) {
      console.error(`is_pro_account failed for ${user.id}: ${proError.message}`)
      return json({ error: 'Could not check your plan. Try again in a moment.' }, 503)
    }

    if (!isPro) {
      return json({ error: 'Importing sales is part of Pro.' }, 402)
    }

    const { data: conn } = await supabaseAdmin
      .from('stripe_connections')
      .select('stripe_account_id, last_synced_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!conn) return json({ error: 'No Stripe account is connected.' }, 400)

    // The user's own restricted key, read from the service-role-only table. It is
    // never sent to the browser and never leaves this function. Note this is NOT
    // STRIPE_SECRET_KEY: our platform key has no business reading a user's account.
    const { data: credentials } = await supabaseAdmin
      .from('stripe_credentials')
      .select('api_key')
      .eq('user_id', user.id)
      .maybeSingle()

    const apiKey = (credentials?.api_key ?? '').trim()
    if (!apiKey) return json({ error: 'No Stripe account is connected.' }, 400)

    const since = conn.last_synced_at
      ? Math.floor(new Date(conn.last_synced_at).getTime() / 1000) - OVERLAP_MINUTES * 60
      : Math.floor(Date.now() / 1000) - FIRST_SYNC_DAYS * 86400

    let startingAfter: string | null = null
    let imported = 0
    let scanned = 0
    let pages = 0

    while (pages < MAX_PAGES) {
      pages++

      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('created[gte]', String(since))
      if (startingAfter) params.set('starting_after', startingAfter)

      // The key belongs to the user, so it reads their account and only theirs.
      // Under the old Connect design this used our platform key plus a
      // Stripe-Account header, and forgetting that header would have imported
      // Jen's sales into every user's planner. That whole class of mistake is
      // gone: there is no platform key here to reach the wrong account with.
      const res = await fetch(`https://api.stripe.com/v1/charges?${params.toString()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })

      const page = await res.json()

      if (!res.ok) {
        const message = page?.error?.message ?? 'Stripe rejected the request.'
        console.error('Stripe charges fetch failed:', message)
        await supabaseAdmin
          .from('stripe_connections')
          .update({ last_sync_error: message })
          .eq('user_id', user.id)
        return json({ error: `Could not read your Stripe account: ${message}` }, 502)
      }

      const charges = Array.isArray(page.data) ? page.data : []
      scanned += charges.length

      const rows = charges
        // Only money that actually arrived. Failed and pending charges are not
        // sales, and counting them would flatter every figure in the app.
        .filter((c: Record<string, unknown>) => c.status === 'succeeded' && c.paid === true)
        .map((c: Record<string, any>) => ({
          user_id: user.id,
          source: 'stripe',
          external_id: c.id,
          // amount_captured, not amount: a partially captured charge is worth
          // what was taken, not what was authorised.
          amount: toMajorUnits(c.amount_captured ?? c.amount ?? 0, c.currency ?? 'usd'),
          currency: (c.currency ?? 'usd').toUpperCase(),
          occurred_at: new Date((c.created ?? 0) * 1000).toISOString(),
          description: c.description ?? c.calculated_statement_descriptor ?? null,
          customer_email: c.billing_details?.email ?? c.receipt_email ?? null,
          refunded: c.refunded === true || (c.amount_refunded ?? 0) > 0,
          // Attribution, captured from day one even though nothing populates it
          // yet. Once landing pages start passing ?utm_source through to Stripe
          // as client_reference_id or metadata, the history is already here.
          // Starting to capture it later would leave a permanent blind spot over
          // every sale imported before the switch.
          client_reference_id: c.client_reference_id ?? null,
          metadata: c.metadata && Object.keys(c.metadata).length ? c.metadata : null,
          // These two are what the backfill pass resolves product names from.
          invoice_id: typeof c.invoice === 'string' ? c.invoice : (c.invoice?.id ?? null),
          payment_intent_id: typeof c.payment_intent === 'string' ? c.payment_intent : (c.payment_intent?.id ?? null),
          // DO NOT add product_name / product_id here. This upsert re-writes
          // every column it names, and the 60-minute overlap window deliberately
          // re-reads charges we already have - so including them would wipe a
          // resolved name back to null on every single sync. They are set only
          // by the backfill pass below.
        }))

      if (rows.length) {
        // Upsert rather than insert: the overlap window deliberately re-reads
        // charges we already have, and a refund that happens later has to update
        // the row rather than be dropped.
        const { error: upsertError } = await supabaseAdmin
          .from('imported_sales')
          .upsert(rows, { onConflict: 'user_id,source,external_id' })

        if (upsertError) {
          console.error('Could not save imported sales:', upsertError.message)
          return json({ error: 'Could not save the imported sales. Please try again.' }, 503)
        }
        imported += rows.length
      }

      if (!page.has_more || charges.length === 0) break
      startingAfter = charges[charges.length - 1].id
    }

    // ------------------------------------------------- product name backfill --
    // Runs after the import rather than inside it, so the money lands even if
    // Stripe is slow or rate limiting the extra lookups. Rows inserted moments
    // ago are picked up by this same pass, so a first sync still ends with names.
    // Bounded per run; whatever is left over is resolved by the next sync.
    let named = 0

    const { data: unnamed } = await supabaseAdmin
      .from('imported_sales')
      .select('id, description, invoice_id, payment_intent_id')
      .eq('user_id', user.id)
      .eq('source', 'stripe')
      .is('product_name', null)
      .order('occurred_at', { ascending: false })
      .limit(NAME_LOOKUP_BUDGET)

    if (unnamed?.length) {
      const resolved: { id: number; product_id: string | null; product_name: string }[] = []
      // Shared across the whole pass, so repeat sales of the same offer cost one
      // product lookup between them rather than one each.
      const nameCache = new Map<string, string | null>()

      // Modest concurrency. Sequential would be minutes on a first sync; wide
      // open would risk Stripe rate limiting an account we do not control.
      for (let i = 0; i < unnamed.length; i += NAME_LOOKUP_CONCURRENCY) {
        const slice = unnamed.slice(i, i + NAME_LOOKUP_CONCURRENCY)
        const names = await Promise.all(
          slice.map((row) => resolveProduct(row, nameCache, apiKey))
        )
        slice.forEach((row, n) => resolved.push({ id: row.id, ...names[n] }))
      }

      // Group by resolved product so a user with four offers costs four updates
      // rather than one per sale.
      const groups = new Map<string, { product_id: string | null; product_name: string; ids: number[] }>()
      for (const r of resolved) {
        const key = `${r.product_id ?? ''}|${r.product_name}`
        const group = groups.get(key)
        if (group) group.ids.push(r.id)
        else groups.set(key, { product_id: r.product_id, product_name: r.product_name, ids: [r.id] })
      }

      for (const group of groups.values()) {
        const { error: nameError } = await supabaseAdmin
          .from('imported_sales')
          .update({ product_id: group.product_id, product_name: group.product_name })
          .in('id', group.ids)

        if (nameError) {
          // Not fatal. The sales are already imported and correct; only the
          // labels are missing, and the next sync retries them.
          console.error('Could not save product names:', nameError.message)
        } else {
          named += group.ids.length
        }
      }
    }

    await supabaseAdmin
      .from('stripe_connections')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('user_id', user.id)

    return json({
      ok: true,
      imported,
      scanned,
      named,
      // True when we stopped because of the page ceiling rather than because
      // Stripe ran out. The next run picks up from the new watermark.
      truncated: pages >= MAX_PAGES,
      // True when sales are still waiting for a product name. Not an error.
      namesPending: (unnamed?.length ?? 0) >= NAME_LOOKUP_BUDGET,
    })
  } catch (err) {
    console.error('stripe-sync failed:', err.message)
    return json({ error: 'Something went wrong syncing your sales. Please try again.' }, 500)
  }
})
