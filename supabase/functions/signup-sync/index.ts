// signup-sync
//
// Card-free trial users never touch Stripe, so the Stripe webhook is no longer
// the thing that puts a new signup into Loops. The app calls this function right
// after signup so trial users land in Loops and can receive the welcome and
// "trial ending" sequences.
//
// The Loops API key stays here on the server. The caller only proves who they
// are with their own token, and can only ever sync themselves.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()

    if (!token) {
      return new Response(JSON.stringify({ error: 'Not signed in.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    const user = userData?.user

    if (userError || !user || !user.email) {
      return new Response(JSON.stringify({ error: 'Not signed in.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('subscription_status, trial_ends_at')
      .eq('id', user.id)
      .maybeSingle()

    const apiKey = Deno.env.get('LOOPS_API_KEY')
    if (!apiKey) {
      console.warn('LOOPS_API_KEY is not set. Skipping Loops sync.')
      return new Response(JSON.stringify({ synced: false, reason: 'no_api_key' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Name comes from the signup form, stored on the auth user's metadata
    const fullName = (user.user_metadata?.name ?? '').trim()
    const parts = fullName ? fullName.split(/\s+/) : []
    const firstName = parts[0] ?? ''
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : ''

    const payload: Record<string, unknown> = {
      email: user.email.toLowerCase().trim(),
      source: 'app-free-trial',
      userGroup: 'Trial',
      subscriptionStatus: profile?.subscription_status ?? 'trialing',
    }
    if (firstName) payload.firstName = firstName
    if (lastName) payload.lastName = lastName
    if (profile?.trial_ends_at) payload.trialEndsAt = profile.trial_ends_at

    const response = await fetch('https://app.loops.so/api/v1/contacts/update', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      console.error(`Loops sync failed: ${response.status} - ${JSON.stringify(detail)}`)
      return new Response(JSON.stringify({ synced: false, reason: 'loops_error' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Synced trial signup ${user.email} to Loops.`)
    return new Response(JSON.stringify({ synced: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('signup-sync error:', error.message)
    // Never block signup on this. The account already exists either way.
    return new Response(JSON.stringify({ synced: false, reason: 'exception' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
