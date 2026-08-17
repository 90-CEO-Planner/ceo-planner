import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Features that only exist on the Pro plan. A request naming one of these is
// refused unless the account really is on Pro — checked here against the
// database, never against what the browser claims.
//
// Be honest about what this does and does not buy. It is not a spend ceiling:
// a caller could simply omit the `feature` field and get the ordinary chat
// treatment, which every account already has. The real ceiling is the daily
// quota in consume_ai_quota, which is per tier and cannot be talked out of.
// What this stops is the honest client path handing Pro output to a base
// account — the server half of the rule that every Pro feature is gated in
// both places.
const PRO_ONLY_FEATURES = new Set([
  'live-ai',
]);

// Enough for a 12-week plan; anything larger is a runaway, not a request.
const MAX_OUTPUT_TOKENS = 8000;

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

    // Read the request BEFORE consuming quota.
    //
    // This used to happen after, so a body the function was never going to act
    // on still spent one of the day's AI calls. Parsing costs nothing and
    // touches neither OpenAI nor the database, so there is no reason to charge
    // for it. (The Pro tier check further down deliberately does still cost a
    // call — see the note there.)
    const body = await req.json().catch(() => null);

    if (!body || !body.messages || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing 'messages' array in request body." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const messages = body.messages;
    const feature = typeof body.feature === 'string' ? body.feature : null;
    const wantsJson = body.json === true;
    const requestedTokens = Number.isFinite(body.maxTokens) ? Math.floor(body.maxTokens) : null;

    // Trial still running, or a paying subscriber? And do they have AI calls
    // left today? consume_ai_quota answers both in one atomic call, so access
    // and usage can never drift apart. It also reports the caller's tier, which
    // is what the Pro check below reads — one round trip, not two.
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

    // --- Tier check ---------------------------------------------------------
    // The tier comes back from consume_ai_quota rather than a second query, so
    // there is exactly one place that decides what "pro" means — including the
    // rule that a trial counts as Pro for features but not for spend. A second
    // copy of that rule here would eventually disagree with the first.
    //
    // The cost of reading it from there is that a refused Pro request has
    // already spent one of the caller's own AI calls. That is deliberate: this
    // only fires for a client that asked for something its plan does not have,
    // which the app itself never does, so the one thing it rate-limits is
    // somebody poking at the endpoint.
    if (feature && PRO_ONLY_FEATURES.has(feature) && quota.tier !== 'pro') {
      console.log(`Blocked Pro feature '${feature}' for ${quota.tier} user ${user.id}.`)
      return new Response(
        JSON.stringify({ error: "That one is part of Pro. Your plan doesn't include it yet." }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // --- End access check ---------------------------------------------------

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error("OpenAI API key is missing from Supabase Vault secrets.");
    }

    const payload: Record<string, unknown> = {
      model: 'gpt-4o-mini',
      messages: messages,
    };

    // Ask OpenAI to guarantee valid JSON rather than parsing whatever comes
    // back and hoping. Every caller that wants structured data — the 90-day
    // plan, the Monday plan drafted from the Friday Review, and the three live
    // planning surfaces — sets this. Without it the model wraps its answer in
    // ```json fences often enough that callers strip them by hand, and the
    // failure when it does something else is a screen that silently gives up.
    //
    // The API rejects the request outright if the word "json" appears nowhere
    // in the messages, so that is checked here rather than trusted. A prompt
    // that forgot to say it degrades to ordinary text, which the callers can
    // still cope with — a 400 would lose the whole request.
    if (wantsJson) {
      const mentionsJson = messages.some((m: { content?: unknown }) =>
        typeof m?.content === 'string' && m.content.toLowerCase().includes('json')
      );
      if (mentionsJson) {
        payload.response_format = { type: 'json_object' };
      } else {
        console.warn('JSON mode requested but no message mentions JSON; sending without response_format.');
      }
    }

    // A ceiling on the answer, so a caller asking for three short suggestions
    // cannot be charged for three thousand words. Clamped rather than trusted:
    // maxTokens arrives from the browser.
    if (requestedTokens && requestedTokens > 0) {
      payload.max_tokens = Math.min(requestedTokens, MAX_OUTPUT_TOKENS);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI Error:', data);
      throw new Error(data.error?.message || 'Failed to fetch AI response');
    }

    // Tell the client where it now stands on today's allowance.
    //
    // consume_ai_quota has always returned `used` and `quota`, but they were
    // thrown away except when refusing — so the first a customer heard about a
    // daily limit was hitting it mid-conversation. Passing them back on success
    // costs nothing (no extra query, the numbers are already in hand) and lets
    // the app warn before the wall rather than at it.
    //
    // NOT called `usage`: OpenAI's own response body already has a `usage`
    // object of token counts, and this body is returned wholesale.
    data.ceo_allowance = {
      used: quota.used,
      quota: quota.quota,
      tier: quota.tier,
    };

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
