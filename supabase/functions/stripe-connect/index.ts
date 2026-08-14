// stripe-connect
//
// The OAuth handshake that links a user's OWN Stripe account to their planner,
// read-only, so their sales can be imported. Not to be confused with
// stripe-webhook, which is about people paying US.
//
// Two actions on one function:
//
//   POST ?action=start      (user JWT)  -> { url } to send the browser to
//   GET  ?action=callback   (from Stripe) -> 302 back into the app
//
// The redirect_uri registered with Stripe points at THIS function, not at the
// app, so the authorization code is exchanged server side and never lands in a
// browser URL where an extension or the history could pick it up.
//
// Required environment variables:
//   STRIPE_SECRET_KEY          already set for stripe-webhook
//   STRIPE_CONNECT_CLIENT_ID   ca_... from Dashboard > Connect > Settings
//   APP_URL                    e.g. https://app.thewomensentrepreneurialnetwork.com

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

function appUrl(): string {
  return (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')
}

// Send the browser back into the app with a short outcome code. The app turns
// these into human sentences; keeping them as codes means no user-facing copy
// lives in the edge function, where nobody would think to look for it.
function backToApp(outcome: string) {
  const target = `${appUrl()}/?stripe=${encodeURIComponent(outcome)}#/account`
  return new Response(null, { status: 302, headers: { Location: target } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  const clientId = Deno.env.get('STRIPE_CONNECT_CLIENT_ID') ?? ''
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // ---------------------------------------------------------------- start --
    if (action === 'start') {
      if (!clientId) {
        // Deliberately explicit: this is the one setup step that cannot be done
        // from the repo, and a vague error here would waste an hour.
        return json({ error: 'Stripe Connect is not configured yet. Set STRIPE_CONNECT_CLIENT_ID on this function.' }, 503)
      }

      const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
      if (!token) return json({ error: 'Please sign in first.' }, 401)

      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
      const user = userData?.user
      if (userError || !user) return json({ error: 'Please sign in first.' }, 401)

      // CSRF token. Stripe hands this back to the callback, and it is the only
      // thing tying the returning browser to a user. Random, single use, and
      // checked for age on the way back.
      const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')

      const { error: stateError } = await supabaseAdmin
        .from('stripe_oauth_states')
        .insert({ state, user_id: user.id })

      if (stateError) {
        console.error('Could not store OAuth state:', stateError.message)
        return json({ error: 'Could not start the connection. Please try again.' }, 503)
      }

      const authorize = new URL('https://connect.stripe.com/oauth/authorize')
      authorize.searchParams.set('response_type', 'code')
      authorize.searchParams.set('client_id', clientId)
      // read_only is the whole point. This integration can never move money,
      // issue a refund, or change anything in the user's Stripe account.
      authorize.searchParams.set('scope', 'read_only')
      authorize.searchParams.set('state', state)

      return json({ url: authorize.toString() })
    }

    // ------------------------------------------------------------- callback --
    if (action === 'callback') {
      // The user declined on Stripe's screen, or Stripe reported a problem.
      const oauthError = url.searchParams.get('error')
      if (oauthError) return backToApp('cancelled')

      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      if (!code || !state) return backToApp('failed')

      const { data: stateRow } = await supabaseAdmin
        .from('stripe_oauth_states')
        .select('user_id, created_at')
        .eq('state', state)
        .maybeSingle()

      // Unknown state means this callback was not started by us.
      if (!stateRow) return backToApp('failed')

      // Single use, whatever happens next.
      await supabaseAdmin.from('stripe_oauth_states').delete().eq('state', state)

      // Ten minutes is generous for a redirect the user is sitting through.
      const ageMs = Date.now() - new Date(stateRow.created_at).getTime()
      if (ageMs > 10 * 60 * 1000) return backToApp('expired')

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
      })

      const tokenRes = await fetch('https://connect.stripe.com/oauth/token', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })

      const tokenJson = await tokenRes.json()

      if (!tokenRes.ok || !tokenJson.stripe_user_id) {
        console.error('Stripe OAuth exchange failed:', JSON.stringify(tokenJson))
        return backToApp('failed')
      }

      // Store the account id, never the access token. Requests are made with the
      // platform key plus a Stripe-Account header, so this row holds nothing that
      // could be used as a credential if it ever leaked.
      const { error: saveError } = await supabaseAdmin
        .from('stripe_connections')
        .upsert({
          user_id: stateRow.user_id,
          stripe_account_id: tokenJson.stripe_user_id,
          scope: tokenJson.scope ?? 'read_only',
          livemode: tokenJson.livemode ?? true,
          connected_at: new Date().toISOString(),
          last_sync_error: null,
        }, { onConflict: 'user_id' })

      if (saveError) {
        console.error('Could not save Stripe connection:', saveError.message)
        return backToApp('failed')
      }

      return backToApp('connected')
    }

    // ----------------------------------------------------------- disconnect --
    if (action === 'disconnect') {
      const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
      if (!token) return json({ error: 'Please sign in first.' }, 401)

      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
      const user = userData?.user
      if (userError || !user) return json({ error: 'Please sign in first.' }, 401)

      const { data: conn } = await supabaseAdmin
        .from('stripe_connections')
        .select('stripe_account_id')
        .eq('user_id', user.id)
        .maybeSingle()

      // Tell Stripe as well as forgetting locally, so the connection disappears
      // from the user's own Stripe dashboard too. If this fails we still drop our
      // side: leaving a row we have told the user is gone would be worse.
      if (conn?.stripe_account_id && clientId) {
        try {
          await fetch('https://connect.stripe.com/oauth/deauthorize', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${secretKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              client_id: clientId,
              stripe_user_id: conn.stripe_account_id,
            }),
          })
        } catch (err) {
          console.warn('Stripe deauthorize failed, dropping local connection anyway:', err.message)
        }
      }

      await supabaseAdmin.from('stripe_connections').delete().eq('user_id', user.id)
      // Imported sales are deliberately KEPT. They are part of the user's revenue
      // history, and silently deleting months of figures because someone
      // disconnected an integration would be indefensible.
      return json({ ok: true })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (err) {
    console.error('stripe-connect failed:', err.message)
    // A thrown error during the callback must still land the user somewhere sane
    // rather than showing them raw JSON on a Supabase domain.
    if (action === 'callback') return backToApp('failed')
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})
