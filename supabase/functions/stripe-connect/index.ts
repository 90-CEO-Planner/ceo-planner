// stripe-connect
//
// Links a user's OWN Stripe account to their planner, read-only, so their sales
// can be imported. Not to be confused with stripe-webhook, which is about people
// paying US.
//
// This used to be a Connect OAuth handshake. It is not any more. Stripe has
// retired the Standard/OAuth path for new platforms - there is no client_id to be
// had on a platform created today, and the Connect settings pages simply do not
// offer one. Instead the user creates a RESTRICTED, READ-ONLY key in their own
// Stripe dashboard and pastes it in. No platform status, no client_id, no
// redirect, and nothing for Stripe to deprecate underneath us.
//
//   POST ?action=connect     (user JWT, body { apiKey })  -> { ok, accountId }
//   POST ?action=disconnect  (user JWT)                   -> { ok }
//
// verify_jwt can be TRUE here, unlike the OAuth version: every request now comes
// from our own browser code carrying a real session, never from a Stripe redirect.
//
// Required environment variables: none beyond the Supabase defaults. STRIPE_SECRET_KEY
// and STRIPE_CONNECT_CLIENT_ID are deliberately NOT used - this function never
// touches our platform credentials, only the user's own key.

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

// Read against the USER's Stripe account using the USER's key.
async function stripeGet(path: string, apiKey: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  return { ok: res.ok, body: await res.json() }
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
      // trim(), always. A key pasted out of the Stripe dashboard routinely picks
      // up a trailing newline, and an APP_URL with exactly that problem cost an
      // afternoon earlier in this build.
      const apiKey = String(payload?.apiKey ?? '').trim()

      if (!apiKey) return json({ error: 'Please paste your Stripe key.' }, 400)

      // Refuse a full secret key outright. sk_ can move money, issue refunds and
      // change the account; we only ever need to read. Someone pasting sk_ has
      // misunderstood the instructions, and quietly accepting it would mean
      // holding a credential far more dangerous than the feature requires.
      if (apiKey.startsWith('sk_')) {
        return json({
          error: 'That is a full secret key, which can move money. Please create a RESTRICTED key with read-only access instead. It starts with rk_.',
        }, 400)
      }

      if (!apiKey.startsWith('rk_')) {
        return json({
          error: 'That does not look like a Stripe restricted key. It should start with rk_.',
        }, 400)
      }

      // Charges first, because this is the one permission the import cannot work
      // without, and because it doubles as "is this key real at all". A restricted
      // key can be perfectly valid but scoped to something else entirely, and
      // finding that out here beats an empty import the user cannot explain.
      const charges = await stripeGet('charges?limit=1', apiKey)
      if (!charges.ok) {
        const message = charges.body?.error?.message ?? 'it cannot read payments.'
        // A wrong or revoked key fails here too, so distinguish the two: telling
        // someone to add a permission when they actually mistyped the key sends
        // them back to Stripe to fix something that was never wrong.
        const code = charges.body?.error?.type
        if (code === 'invalid_request_error' && /api key/i.test(message)) {
          return json({ error: `Stripe did not accept that key: ${message}` }, 400)
        }
        // "Charges and Refunds" is Stripe's own label for the resource, verified
        // against the live dashboard. Naming it anything shorter sends someone
        // hunting for a row that does not exist.
        return json({
          error: `That key works, but it cannot read your payments. Edit it in Stripe, set "Charges and Refunds" to Read, and try again. (${message})`,
        }, 400)
      }

      // Whose account is it? Best effort only. Reading the account object needs
      // its own permission, and a key scoped to exactly the five resources we ask
      // for can read every sale correctly while failing here. Refusing it over a
      // display detail would be a dead end for someone who followed the
      // instructions to the letter - so we record 'unknown' and move on. The
      // Account screen omits the account line when it sees that.
      const account = await stripeGet('account', apiKey)
      const accountId = account.ok && typeof account.body?.id === 'string' ? account.body.id : 'unknown'

      const { error: keyError } = await supabaseAdmin
        .from('stripe_credentials')
        .upsert({
          user_id: user.id,
          api_key: apiKey,
          key_last4: apiKey.slice(-4),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (keyError) {
        console.error('Could not save Stripe credentials:', keyError.message)
        return json({ error: 'Could not save the connection. Please try again.' }, 503)
      }

      // The browser-readable half. Deliberately holds no credential.
      const { error: connError } = await supabaseAdmin
        .from('stripe_connections')
        .upsert({
          user_id: user.id,
          stripe_account_id: accountId,
          scope: 'read_only',
          livemode: apiKey.startsWith('rk_live_'),
          connected_at: new Date().toISOString(),
          last_sync_error: null,
        }, { onConflict: 'user_id' })

      if (connError) {
        console.error('Could not save Stripe connection:', connError.message)
        return json({ error: 'Could not save the connection. Please try again.' }, 503)
      }

      // Never echo the key back, not even partially beyond the last four.
      return json({
        ok: true,
        accountId,
        accountName: account.body?.business_profile?.name ?? account.body?.settings?.dashboard?.display_name ?? null,
        livemode: apiKey.startsWith('rk_live_'),
      })
    }

    // ----------------------------------------------------------- disconnect --
    if (action === 'disconnect') {
      await supabaseAdmin.from('stripe_credentials').delete().eq('user_id', user.id)
      await supabaseAdmin.from('stripe_connections').delete().eq('user_id', user.id)
      // Imported sales are deliberately KEPT. They are part of the user's revenue
      // history, and silently deleting months of figures because someone
      // disconnected an integration would be indefensible.
      return json({ ok: true })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (err) {
    console.error('stripe-connect failed:', err.message)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})
