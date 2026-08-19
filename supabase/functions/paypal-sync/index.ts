// paypal-sync
//
// Pulls completed payments from the user's connected PayPal account into
// public.imported_sales. Read-only against PayPal; the only thing it writes is
// our own table.
//
// Called by the browser with the user's JWT. Safe to call repeatedly: the unique
// index on (user_id, source, external_id) makes every run idempotent, which is
// the single most important property here. A double-counted sync would corrupt
// every revenue figure in the app and there would be no way to tell.
//
// --- How this differs from stripe-sync, and why -------------------------------
//
// The two functions do the same job against very different APIs. Four things
// had to be designed rather than copied:
//
//   1. THE 31-DAY CEILING. PayPal's transaction search refuses any range wider
//      than 31 days, so a 120-day first sync is four requests minimum. The
//      import walks the period in windows instead of paging one long range.
//   2. THE THREE-HOUR SETTLEMENT DELAY. PayPal states a transaction can take up
//      to three hours to appear in the search results. Stripe's 60-minute
//      overlap would step straight over sales that were simply not visible yet,
//      and they would never be picked up again. The overlap here is six hours.
//   3. REFUNDS ARE THEIR OWN TRANSACTIONS. Stripe updates the charge. PayPal
//      writes a separate negative row that names the original through
//      `paypal_reference_id`. So refunds are collected in the same pass and used
//      to flag the original, which lands on the same `refunded` boolean the rest
//      of the app already reads.
//   4. NO BACKFILL PASS IS NEEDED. Stripe hides the product name behind up to
//      three extra calls per sale, which is the whole reason that function has a
//      second phase. PayPal returns the basket inline with `fields=all`, so the
//      name arrives with the money and there is nothing to resolve afterwards.
//
// What is NOT different, deliberately: the shape of the row written. Everything
// downstream reads `imported_sales` without caring which processor filled it.

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

// How far back a first sync reaches. Matches stripe-sync for the same reason: a
// brand new connection pulling three years of history would rewrite the user's
// quarter figures with sales from before they ever used the app.
const FIRST_SYNC_DAYS = 120

// Re-examine six hours before the last sync. PayPal documents a settlement delay
// of up to three hours, so anything less than that guarantees permanently missed
// sales rather than merely late ones. Doubling the documented figure costs one
// extra window at most and covers a slow day at PayPal's end.
const OVERLAP_HOURS = 6

// PayPal's hard limit on the width of one search. Not a tuning knob.
const WINDOW_DAYS = 31

const PAGE_SIZE = 500
const MAX_PAGES_PER_WINDOW = 20
// Eight windows is roughly 248 days, comfortably more than FIRST_SYNC_DAYS needs
// while still bounding how long one invocation can run.
const MAX_WINDOWS = 8

// Transaction event code families, confirmed against PayPal's own reference.
// Getting this wrong is the expensive mistake in this file: counting a bank
// withdrawal or a currency conversion as income would inflate every revenue
// figure in the app, and nothing downstream could detect it.
//
//   T00xx  customer payments .......... income, import these
//   T11xx  reversals and refunds ...... use to flag the original
//   T01xx  PayPal's own fees
//   T02xx  currency conversion and internal transfers
//   T03xx–T05xx  bank deposits, withdrawals, card funding
//   T15xx, T21xx  holds, releases, reserves
//
// Everything outside the first two families is ignored on purpose. A payout to
// the user's own bank account is their money moving, not their money arriving.
const SALE_PREFIX = 'T00'
const REFUND_PREFIX = 'T11'

// PayPal wants RFC 3339 with an explicit offset and rejects the trailing `Z`
// that toISOString() produces.
function paypalDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, '-0000')
}

// PayPal reports amounts as decimal strings already in major units: "47.00"
// means forty-seven pounds. There is no minor-unit conversion here and no
// zero-decimal currency table, both of which stripe-sync needs. Do not add one.
function toAmount(value: unknown): number {
  const n = parseFloat(String(value ?? '0'))
  return Number.isFinite(n) ? n : 0
}

// The product name, in the order the answer is most likely to be useful.
//
// The basket is the real answer, and it is the reason `fields=all` is worth the
// extra payload: without it every imported sale reads as whatever the payer
// happened to type. Multiple line items are joined rather than truncated to the
// first, because a two-item order labelled with only one of them reads as a
// wrong figure rather than a partial label.
function productNameFrom(detail: Record<string, any>): string | null {
  const items = detail?.cart_info?.item_details
  if (Array.isArray(items) && items.length) {
    const names = items
      .map((i: Record<string, any>) => (typeof i?.item_name === 'string' ? i.item_name.trim() : ''))
      .filter(Boolean)
    if (names.length) return names.join(', ').slice(0, 300)
  }

  const info = detail?.transaction_info ?? {}
  const subject = typeof info.transaction_subject === 'string' ? info.transaction_subject.trim() : ''
  if (subject) return subject.slice(0, 300)

  const note = typeof info.transaction_note === 'string' ? info.transaction_note.trim() : ''
  if (note) return note.slice(0, 300)

  return null
}

function customerEmailFrom(detail: Record<string, any>): string | null {
  const email = detail?.payer_info?.email_address
  return typeof email === 'string' && email ? email : null
}

async function mintToken(clientId: string, clientSecret: string, host: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${host}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) return null
    const body = await res.json()
    return typeof body?.access_token === 'string' ? body.access_token : null
  } catch (_err) {
    return null
  }
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
      .from('paypal_connections')
      .select('paypal_account_id, last_synced_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!conn) return json({ error: 'No PayPal account is connected.' }, 400)

    // The user's own credentials, read from the service-role-only table. They
    // are never sent to the browser and never leave this function.
    const { data: credentials } = await supabaseAdmin
      .from('paypal_credentials')
      .select('client_id, client_secret, environment')
      .eq('user_id', user.id)
      .maybeSingle()

    const clientId = (credentials?.client_id ?? '').trim()
    const clientSecret = (credentials?.client_secret ?? '').trim()
    if (!clientId || !clientSecret) return json({ error: 'No PayPal account is connected.' }, 400)

    const host = credentials?.environment === 'sandbox'
      ? 'api-m.sandbox.paypal.com'
      : 'api-m.paypal.com'

    // Minted once and reused for the whole run. A token is good for hours, and
    // a first sync is up to eight windows of requests.
    const accessToken = await mintToken(clientId, clientSecret, host)
    if (!accessToken) {
      const message = 'PayPal would not accept the saved credentials. They may have been revoked or regenerated.'
      await supabaseAdmin
        .from('paypal_connections')
        .update({ last_sync_error: message })
        .eq('user_id', user.id)
      return json({ error: `${message} Reconnect PayPal on the Account screen.` }, 502)
    }

    const now = new Date()
    const since = conn.last_synced_at
      ? new Date(new Date(conn.last_synced_at).getTime() - OVERLAP_HOURS * 3600 * 1000)
      : new Date(now.getTime() - FIRST_SYNC_DAYS * 86400 * 1000)

    let imported = 0
    let scanned = 0
    let windows = 0
    let truncated = false

    // Refunds seen anywhere in this run, keyed by the transaction they reverse.
    // Applied once at the end rather than per window, because a refund and the
    // sale it reverses routinely fall in different windows and the update has to
    // be able to reach backwards.
    const refundedIds = new Set<string>()

    let windowStart = new Date(since)

    while (windowStart < now && windows < MAX_WINDOWS) {
      windows++

      const windowEnd = new Date(
        Math.min(windowStart.getTime() + WINDOW_DAYS * 86400 * 1000, now.getTime())
      )

      let page = 1
      while (page <= MAX_PAGES_PER_WINDOW) {
        const params = new URLSearchParams({
          start_date: paypalDate(windowStart),
          end_date: paypalDate(windowEnd),
          // `all` is what carries the basket, and the basket is what makes a
          // sale say what it was for. See productNameFrom().
          fields: 'all',
          page_size: String(PAGE_SIZE),
          page: String(page),
        })

        const res = await fetch(`https://${host}/v1/reporting/transactions?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        const body = await res.json().catch(() => ({}))

        if (!res.ok) {
          // PayPal returns a structured error with `name` and `message`; the
          // detail array carries the useful part when a parameter is at fault.
          const message = body?.message ?? body?.error_description ?? 'PayPal rejected the request.'
          console.error('PayPal transaction search failed:', res.status, message)
          await supabaseAdmin
            .from('paypal_connections')
            .update({ last_sync_error: message })
            .eq('user_id', user.id)
          return json({ error: `Could not read your PayPal account: ${message}` }, 502)
        }

        const details = Array.isArray(body?.transaction_details) ? body.transaction_details : []
        scanned += details.length

        const rows: Record<string, unknown>[] = []

        for (const detail of details) {
          const info = detail?.transaction_info ?? {}
          const code = String(info.transaction_event_code ?? '')
          const externalId = typeof info.transaction_id === 'string' ? info.transaction_id : ''
          if (!externalId) continue

          // A reversal names the sale it undoes. Record the reference and move
          // on: the negative row is not itself a sale and must never be written
          // as one, or the feed would show a minus figure alongside the original.
          if (code.startsWith(REFUND_PREFIX)) {
            const original = info.paypal_reference_id
            if (typeof original === 'string' && original) refundedIds.add(original)
            continue
          }

          if (!code.startsWith(SALE_PREFIX)) continue

          // Only money that actually arrived. 'S' is PayPal's success status;
          // 'P' pending and 'D' denied are not sales, and counting them would
          // flatter every figure in the app.
          if (String(info.transaction_status ?? '') !== 'S') continue

          const amount = toAmount(info.transaction_amount?.value)
          // A T00xx code with a negative value is money leaving on a payment
          // the user themselves made. Not income.
          if (amount <= 0) continue

          // `occurred_at` is NOT NULL, and an unparseable date would throw on
          // toISOString() and take down the whole run — including the sales
          // already read in this page but not yet written. One malformed
          // transaction must cost one transaction, not the import.
          const occurredAt = new Date(info.transaction_initiation_date)
          if (Number.isNaN(occurredAt.getTime())) {
            console.warn('Skipping PayPal transaction with an unreadable date:', externalId)
            continue
          }

          rows.push({
            user_id: user.id,
            source: 'paypal',
            external_id: externalId,
            amount,
            currency: String(info.transaction_amount?.currency_code ?? 'USD').toUpperCase(),
            occurred_at: occurredAt.toISOString(),
            description: typeof info.transaction_subject === 'string' ? info.transaction_subject : null,
            customer_email: customerEmailFrom(detail),
            // Set from this pass, unlike Stripe where a later backfill owns it.
            // Safe to include in the upsert precisely because it is resolved
            // here: re-reading a transaction in the overlap window recomputes
            // the same name rather than overwriting it with null.
            product_name: productNameFrom(detail),
            // Attribution. PayPal's `custom_field` is the closest thing it has
            // to Stripe's client_reference_id, and it survives checkout, so a
            // landing page passing ?utm_source through lands here. Captured from
            // day one for the same reason Stripe's was: starting later would
            // leave a permanent blind spot over everything imported before.
            client_reference_id: typeof info.custom_field === 'string' ? info.custom_field : null,
            invoice_id: typeof info.invoice_id === 'string' ? info.invoice_id : null,
            // Refunds are applied in their own pass below. DO NOT set `refunded`
            // here: the overlap window deliberately re-reads transactions we
            // already have, so writing false on every pass would undo a refund
            // flag set by an earlier run.
          })
        }

        if (rows.length) {
          const { error: upsertError } = await supabaseAdmin
            .from('imported_sales')
            .upsert(rows, { onConflict: 'user_id,source,external_id' })

          if (upsertError) {
            console.error('Could not save imported sales:', upsertError.message)
            return json({ error: 'Could not save the imported sales. Please try again.' }, 503)
          }
          imported += rows.length
        }

        const totalPages = Number(body?.total_pages ?? 1)
        if (!Number.isFinite(totalPages) || page >= totalPages || details.length === 0) break
        page++
        if (page > MAX_PAGES_PER_WINDOW) truncated = true
      }

      // Windows are half-open by one millisecond so a transaction sitting exactly
      // on a boundary is not imported twice. The unique index would forgive it,
      // but a needless upsert on every sync is still waste.
      windowStart = new Date(windowEnd.getTime() + 1)
    }

    if (windowStart < now) truncated = true

    // ------------------------------------------------------ refunds applied --
    // Runs after the import so a refund whose original arrived in this same run
    // still finds its row. Scoped to source 'paypal' so a PayPal reference can
    // never flag a Stripe charge that happens to share an id.
    let refunded = 0
    if (refundedIds.size) {
      const { data: flagged, error: refundError } = await supabaseAdmin
        .from('imported_sales')
        .update({ refunded: true })
        .eq('user_id', user.id)
        .eq('source', 'paypal')
        .in('external_id', Array.from(refundedIds))
        .select('id')

      if (refundError) {
        // Not fatal. The sales are imported and correct; one of them is showing
        // as revenue when it should not be, and the next sync retries the flag
        // because the reversal stays inside the search window.
        console.error('Could not apply PayPal refunds:', refundError.message)
      } else {
        refunded = flagged?.length ?? 0
      }
    }

    await supabaseAdmin
      .from('paypal_connections')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('user_id', user.id)

    return json({
      ok: true,
      imported,
      scanned,
      refunded,
      // True when we stopped because of a ceiling rather than because PayPal ran
      // out. The next run picks up from the new watermark.
      truncated,
    })
  } catch (err) {
    console.error('paypal-sync failed:', err.message)
    return json({ error: 'Something went wrong syncing your sales. Please try again.' }, 500)
  }
})
