// paypal-connect
//
// Links a user's OWN PayPal account to their planner, read-only, so their sales
// can be imported. The second processor for Pro item 1; the sibling of
// stripe-connect and deliberately shaped like it.
//
//   POST ?action=connect     (user JWT, body { clientId, clientSecret }) -> { ok, ... }
//   POST ?action=disconnect  (user JWT)                                  -> { ok }
//
// Required environment variables: none beyond the Supabase defaults. This
// function never touches OUR PayPal or Stripe credentials, only the user's own.
//
// --- The credential question, answered 19 Aug 2026 ---------------------------
//
// UPGRADE_PLAN.md held item 10 back on one unverified point: "verify whether
// PayPal offers a genuinely read-only permission before designing anything".
// It does, with one important difference from Stripe.
//
//   * The scope exists and is real: `.../services/reporting/search/read`, granted
//     by ticking "Transaction Search" on a REST app. That is the only permission
//     the import needs.
//   * But PayPal's credential does NOT announce itself. Stripe's whole design
//     rests on `rk_` vs `sk_` being visible in the string, so stripe-connect can
//     refuse a dangerous key before it is ever used. A PayPal client id and
//     secret look identical whatever the app can do.
//   * What replaces that check: the OAuth token response carries a `scope` field
//     listing every granted scope. So the credential still gets inspected before
//     it is stored, just one round trip later, against PayPal rather than
//     against a prefix.
//
// That is a weaker guarantee than Stripe's and it is recorded as such rather
// than papered over: `granted_scopes` is stored verbatim and the Account card
// tells the user what their own credential can do.

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

// The one scope the import cannot work without.
const SEARCH_SCOPE = 'https://uri.paypal.com/services/reporting/search/read'

// Whether a REST app carrying MORE than read-only permissions is refused or
// merely reported.
//
// Deliberately false, and this is a judgement call worth understanding before
// anyone flips it. Refusing outright is what stripe-connect does to `sk_`, and
// it is the safer instinct. The reason it is not the default here: a PayPal
// business account's REST app has "Accept payments" enabled out of the box, and
// whether every live app is obliged to keep it is NOT verified. If it is, strict
// refusal means nobody can ever connect and the feature is dead the day it
// ships, with an error message blaming the user for something they cannot change.
//
// So the first release reports rather than refuses, and stores the real scope
// list. Once a handful of live connections exist, look at `granted_scopes` in
// the database: if read-only apps are genuinely creatable, flip this to true and
// the check tightens with no other change.
const REFUSE_WRITE_SCOPES = false

// Scopes that cannot move money, change an account, or read anything private
// beyond the transaction history we are here for. Everything else is treated as
// a write scope, which is conservative in the right direction: the consequence
// of a false positive is a sentence of explanation, not a refusal.
const HARMLESS_SCOPES = new Set([
  'openid',
  'email',
  'profile',
  'address',
  'phone',
  'https://uri.paypal.com/services/applications/webhooks',
])

function isReadOnlyScope(scope: string): boolean {
  if (HARMLESS_SCOPES.has(scope)) return true
  return scope.endsWith('/read')
}

// PayPal wants its dates as RFC 3339 with an offset, and rejects the trailing
// `Z` that toISOString() produces. Shared with paypal-sync in spirit; kept
// duplicated rather than extracted because edge functions do not share modules.
function paypalDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, '-0000')
}

// Ask PayPal for an access token.
//
// Tried live first, then sandbox. Nothing in a client id says which environment
// it belongs to, and asking the user to tell us would be asking them to explain
// our own plumbing, so it is worked out once, here, and recorded.
async function mintToken(clientId: string, clientSecret: string, host: string) {
  const res = await fetch(`https://${host}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, body }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

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

    // -------------------------------------------------------------- connect --
    if (action === 'connect') {
      const payload = await req.json().catch(() => ({}))
      // trim(), always. Both halves are copied out of the PayPal dashboard by
      // hand and routinely pick up whitespace, and the secret in particular is a
      // long opaque string nobody proof-reads.
      const clientId = String(payload?.clientId ?? '').trim()
      const clientSecret = String(payload?.clientSecret ?? '').trim()

      if (!clientId) return json({ error: 'Please paste your PayPal client ID.' }, 400)
      if (!clientSecret) return json({ error: 'Please paste your PayPal secret.' }, 400)

      // Catch the commonest paste mistake before spending a round trip on it:
      // the two fields sit next to each other in the PayPal dashboard and are
      // easy to swap. A client ID begins 'A'; a secret begins 'E'.
      if (clientId.startsWith('E') && !clientSecret.startsWith('E')) {
        return json({
          error: 'Those look the wrong way round. The client ID is the one starting with A, and the secret is the one starting with E.',
        }, 400)
      }

      let environment: 'live' | 'sandbox' = 'live'
      let auth = await mintToken(clientId, clientSecret, 'api-m.paypal.com')

      if (!auth.ok) {
        const sandbox = await mintToken(clientId, clientSecret, 'api-m.sandbox.paypal.com')
        if (sandbox.ok) {
          auth = sandbox
          environment = 'sandbox'
        }
      }

      if (!auth.ok) {
        // PayPal answers a bad credential with invalid_client and nothing more
        // useful, so the message says what is actually likely rather than
        // repeating PayPal's word back at someone.
        return json({
          error: 'PayPal did not accept those credentials. Check you copied the client ID and secret from the same app, and that you were on the Live tab rather than Sandbox.',
        }, 400)
      }

      const scopes = String(auth.body?.scope ?? '').split(/\s+/).filter(Boolean)

      if (!scopes.includes(SEARCH_SCOPE)) {
        // The single most confusing failure in this whole flow, and worth every
        // word: PayPal caches issued tokens for up to nine hours, so ticking
        // "Transaction Search" does NOT take effect immediately on an app that
        // has been used before. Without this sentence the user reads "your app
        // cannot read transactions", goes back, finds the box already ticked,
        // and concludes our app is broken.
        return json({
          error: 'Those credentials work, but the app cannot read your transaction history. In the PayPal Developer dashboard open your app, tick Transaction Search and save. If it is already ticked, PayPal can take up to 9 hours to apply it, so try again later today.',
        }, 400)
      }

      const writeScopes = scopes.filter((s) => !isReadOnlyScope(s))

      if (writeScopes.length && REFUSE_WRITE_SCOPES) {
        return json({
          error: 'That app can do more than read your transactions. Create a REST app with only Transaction Search enabled, and paste that one instead.',
        }, 400)
      }

      // Whose account is it? Best effort only, exactly as with Stripe: the
      // merchant account number is only readable off a transaction search
      // response, so an account with no transactions in the last month cannot
      // report one. That is a display detail and must not block a working
      // connection, so it records 'unknown' and moves on.
      const host = environment === 'live' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com'
      const end = new Date()
      const start = new Date(end.getTime() - 30 * 86400 * 1000)
      const probeParams = new URLSearchParams({
        start_date: paypalDate(start),
        end_date: paypalDate(end),
        fields: 'transaction_info',
        page_size: '1',
      })

      let accountId = 'unknown'
      try {
        const probe = await fetch(`https://${host}/v1/reporting/transactions?${probeParams}`, {
          headers: { Authorization: `Bearer ${auth.body.access_token}` },
        })
        if (probe.ok) {
          const probeBody = await probe.json()
          if (typeof probeBody?.account_number === 'string') accountId = probeBody.account_number
        } else {
          // A 403 here, after the scope check has already passed, means the
          // permission is granted on the app but not yet live on the account:
          // the nine hour window again. Worth naming, because it is otherwise
          // indistinguishable from "you have no sales".
          const probeBody = await probe.json().catch(() => ({}))
          if (probe.status === 403 || probeBody?.name === 'NOT_AUTHORIZED') {
            return json({
              error: 'PayPal accepted the app but is not serving transactions for it yet. This usually means Transaction Search was enabled recently, and PayPal can take up to 9 hours to apply it. Try again later today.',
            }, 400)
          }
        }
      } catch (_err) {
        // A network wobble on a nice-to-have. The connection is still good.
      }

      const { error: keyError } = await supabaseAdmin
        .from('paypal_credentials')
        .upsert({
          user_id: user.id,
          client_id: clientId,
          client_secret: clientSecret,
          environment,
          client_id_last4: clientId.slice(-4),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (keyError) {
        console.error('Could not save PayPal credentials:', keyError.message)
        return json({ error: 'Could not save the connection. Please try again.' }, 503)
      }

      // The browser-readable half. Deliberately holds no credential.
      const { error: connError } = await supabaseAdmin
        .from('paypal_connections')
        .upsert({
          user_id: user.id,
          paypal_account_id: accountId,
          granted_scopes: scopes.join(' '),
          read_only: writeScopes.length === 0,
          livemode: environment === 'live',
          connected_at: new Date().toISOString(),
          last_sync_error: null,
        }, { onConflict: 'user_id' })

      if (connError) {
        console.error('Could not save PayPal connection:', connError.message)
        return json({ error: 'Could not save the connection. Please try again.' }, 503)
      }

      // Never echo the secret back, not even partially.
      return json({
        ok: true,
        accountId,
        livemode: environment === 'live',
        readOnly: writeScopes.length === 0,
      })
    }

    // ----------------------------------------------------------- disconnect --
    if (action === 'disconnect') {
      await supabaseAdmin.from('paypal_credentials').delete().eq('user_id', user.id)
      await supabaseAdmin.from('paypal_connections').delete().eq('user_id', user.id)
      // Imported sales are deliberately KEPT, for the same reason Stripe's are:
      // they are part of the user's revenue history, and silently deleting
      // months of figures because someone disconnected an integration would be
      // indefensible.
      return json({ ok: true })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (err) {
    console.error('paypal-connect failed:', err.message)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})
