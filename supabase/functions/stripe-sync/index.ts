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

// Stripe reports minor units for most currencies, but not for all of them. These
// have no minor unit at all, so 1000 means 1000 yen, not 10.00.
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
])

function toMajorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100
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
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('subscription_status, plan_tier')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) return json({ error: 'Account not fully set up. Contact support.' }, 403)

    const onTrial = profile.subscription_status === 'trialing'
    const isPro = profile.subscription_status === 'active' && profile.plan_tier === 'pro'
    if (!onTrial && !isPro) {
      return json({ error: 'Importing sales is part of Pro.' }, 402)
    }

    const { data: conn } = await supabaseAdmin
      .from('stripe_connections')
      .select('stripe_account_id, last_synced_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!conn) return json({ error: 'No Stripe account is connected.' }, 400)

    const secretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
    if (!secretKey) return json({ error: 'Stripe is not configured.' }, 503)

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

      const res = await fetch(`https://api.stripe.com/v1/charges?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          // This header is what makes the call read the CONNECTED account rather
          // than our own. Without it we would silently import Jen's sales into
          // every user's planner.
          'Stripe-Account': conn.stripe_account_id,
        },
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
          // Kept for the next step: the real product name lives on the invoice
          // line items, not on the charge (charge.description reads "Subscription
          // update" for every subscription payment).
          invoice_id: typeof c.invoice === 'string' ? c.invoice : (c.invoice?.id ?? null),
          payment_intent_id: typeof c.payment_intent === 'string' ? c.payment_intent : (c.payment_intent?.id ?? null),
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

    await supabaseAdmin
      .from('stripe_connections')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('user_id', user.id)

    return json({
      ok: true,
      imported,
      scanned,
      // True when we stopped because of the page ceiling rather than because
      // Stripe ran out. The next run picks up from the new watermark.
      truncated: pages >= MAX_PAGES,
    })
  } catch (err) {
    console.error('stripe-sync failed:', err.message)
    return json({ error: 'Something went wrong syncing your sales. Please try again.' }, 500)
  }
})
