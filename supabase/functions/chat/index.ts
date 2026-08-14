import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- Access check -------------------------------------------------------
    // This runs on the server, where the user cannot reach it. Without this,
    // anyone holding the public anon key could call this endpoint and run up
    // the OpenAI bill, and any expired trial could keep using the AI by
    // editing their own browser storage.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Please sign in to use the AI coach.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Resolve the caller. The anon key is a valid JWT but carries no user, so
    // this also rejects a bare anon-key call.
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    const user = userData?.user

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Please sign in to use the AI coach.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Trial still running, or a paying subscriber? And do they have AI calls
    // left today? consume_ai_quota answers both in one atomic call, so access
    // and usage can never drift apart.
    const { data: quotaRows, error: quotaError } = await supabaseAdmin
      .rpc('consume_ai_quota', { p_user_id: user.id })

    if (quotaError) {
      console.error('Access check failed:', quotaError.message)
      return new Response(
        JSON.stringify({ error: 'Could not verify your subscription. Please try again.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // The RPC returns a table, so the result arrives as an array.
    const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows

    if (!quota) {
      console.error('Access check returned no rows for user', user.id)
      return new Response(
        JSON.stringify({ error: 'Could not verify your subscription. Please try again.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!quota.allowed) {
      console.log(`Blocked AI request from user ${user.id}: ${quota.reason}.`)

      if (quota.reason === 'no_profile') {
        return new Response(
          JSON.stringify({ error: 'Account not fully set up. Contact support.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (quota.reason === 'rate_limited') {
        return new Response(
          JSON.stringify({
            error: `You've used your AI allowance for today (${quota.used} of ${quota.quota}). It resets at midnight UTC.`,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Your free trial has ended. Choose a plan to carry on using your AI coach.' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // --- End access check ---------------------------------------------------

    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      throw new Error("Invalid or missing 'messages' array in request body.");
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error("OpenAI API key is missing from Supabase Vault secrets.");
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI Error:', data);
      throw new Error(data.error?.message || 'Failed to fetch AI response');
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Function Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
