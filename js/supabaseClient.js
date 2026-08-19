// supabaseClient.js

const SUPABASE_URL = 'https://ekzpbpoadiktlflcrrwm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrenBicG9hZGlrdGxmbGNycndtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDk3NDAsImV4cCI6MjA5MDEyNTc0MH0.Wy0Pq-ZFVEP8evzgGHQUnqUoLLIA_lSEHiQWY1kvQ_w';

// Initialize the Supabase client attached to the global window
window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Stripe checkout links for when the free trial runs out.
// These deliberately have NO Stripe trial period on them. The 14 free days are
// served by the app, so a trial period here would hand people a second fortnight
// free before they were ever charged. Checked on all four links, 19 Aug 2026.
window.CEO_CHECKOUT_MONTHLY = 'https://buy.stripe.com/7sY28q2DXgrp6H67VM18c08';
window.CEO_CHECKOUT_ANNUAL = 'https://buy.stripe.com/28E8wO92l6QP1mM3Fw18c09';
// Existing customers whose card failed manage themselves here
window.CEO_BILLING_PORTAL = 'https://billing.stripe.com/p/login/eVq3cucex8YXc1q0tk18c00';

// Cloudflare Turnstile site key, for the bot protection on the auth forms.
// Public by design — the matching secret key lives in Supabase, which is what
// actually verifies the token.
//
// Set 17 Aug 2026, together with the matching secret in Supabase
// (Authentication -> Attack Protection). The two must stay switched on
// together: clearing this while the Supabase secret is still saved makes
// Supabase reject every signup AND every login for a missing captcha token, so
// never blank it as a quick "turn the captcha off" — clear the Supabase side
// first.
window.CEO_TURNSTILE_SITE_KEY = '0x4AAAAAAESsYq8ysZijiBEz';

// Pro tier checkout. Live since 19 Aug 2026 — until then these were null,
// because Pro had no price in Stripe and the app refused to sell something it
// could not deliver.
//
// $37/month and $327/year, Jen's pricing. Product `prod_V6LjD07AtJG5o4`,
// prices `price_1U691jAnrDOsqkV3F04IF3eU` (monthly) and
// `price_1U691oAnrDOsqkV3INISfwNm` (annual).
//
// ⚠️ Both Pro prices carry `metadata.tier = 'pro'` in Stripe, and both Base
// prices carry `metadata.tier = 'base'`. That metadata is what `stripe-webhook`
// reads to set `profiles.plan_tier`. **A new price with no tier metadata is
// treated as Base**, so anyone buying it would pay Pro money for Base features.
// If you add a price in the Stripe dashboard, set the metadata at the same time.
window.CEO_CHECKOUT_PRO_MONTHLY = 'https://buy.stripe.com/00w6oG2DXcb99Ti6RI18c0a';
window.CEO_CHECKOUT_PRO_ANNUAL = 'https://buy.stripe.com/14A7sK6Ud4IH9Tifoe18c0b';

// What each plan costs, kept next to the links so the price on screen and the
// price actually charged cannot drift apart.
//
// These are deliberately hardcoded in dollars and do NOT read
// store.settings.currency. That setting is for displaying the user's OWN
// revenue; these are what Stripe will charge, and Stripe charges USD.
window.CEO_PLAN_PRICING = {
    base: { monthly: '$17', annual: '$147' },
    pro: { monthly: '$37', annual: '$327' }
};

// Reads the user's real subscription state from the database and caches it locally.
// The cached copy is only ever used to render the UI. The database is the source
// of truth, and the chat function checks it server side.
window.refreshAccessState = async function refreshAccessState() {
    try {
        const { data: { session } } = await window.db.auth.getSession();
        if (!session || !session.user) return null;

        let { data: profile, error } = await window.db
            .from('profiles')
            .select('subscription_status, trial_ends_at, plan_tier, comp_pro')
            .eq('id', session.user.id)
            .maybeSingle();

        // `plan_tier` and `comp_pro` are newer than some deployed databases.
        // Postgres answers 42703 (undefined_column) if the migration hasn't been
        // run yet. Without this retry, shipping the bundle before the migration
        // would make every access check fail and nothing would ever revalidate a
        // trial again.
        if (error && (error.code === '42703' || /plan_tier|comp_pro/.test(error.message || ''))) {
            console.warn('profiles.plan_tier / comp_pro are missing — run the migrations. Treating this account as base.');
            ({ data: profile, error } = await window.db
                .from('profiles')
                .select('subscription_status, trial_ends_at')
                .eq('id', session.user.id)
                .maybeSingle());
        }

        // Couldn't reach the server. Leave the cached value alone rather than
        // locking someone out over a dropped connection.
        if (error) {
            console.warn('Could not refresh access state:', error.message);
            return null;
        }

        // No profile row means the account was never provisioned properly.
        if (!profile) {
            localStorage.setItem('ceo_sub_status', 'incomplete');
            localStorage.removeItem('ceo_trial_ends_at');
            localStorage.removeItem('ceo_plan_tier');
            localStorage.removeItem('ceo_comp_pro');
            return { status: 'incomplete', daysLeft: 0, trialEndsAt: null, tier: 'base', compPro: false };
        }

        const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
        const compPro = profile.comp_pro === true;
        let status = profile.subscription_status || 'incomplete';
        let daysLeft = null;

        // A trial with no end date used to skip this check entirely, which is how
        // every account ended up on a free trial that never expired. A missing
        // clock now means the trial is over, not that it runs forever — the
        // migration on 19 Aug 2026 backfilled every real one, and nothing writes
        // a NULL onto a trialing row any more.
        if (status === 'trialing') {
            if (!trialEndsAt) {
                status = 'trial_expired';
                daysLeft = 0;
            } else {
                const msLeft = trialEndsAt.getTime() - Date.now();
                daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
                if (msLeft <= 0) status = 'trial_expired';
            }
        }

        // Which feature set they get. The 14-day trial deliberately runs on Pro:
        // nobody upgrades to a tier they have never seen, and the locked-feature
        // teasers only do their job as a reminder of something the user has
        // already had. This grants Pro *features* — the AI allowance stays at the
        // trial rate, because consume_ai_quota keys off subscription_status, not
        // off this. Anyone locked out resolves to base; they see the paywall
        // rather than any of this.
        let tier = 'base';
        if (compPro) {
            // A comp is Pro whatever the subscription says, and whatever they
            // pay for. Jen sets it by hand; nothing in the Stripe or PayPal path
            // writes this column, which is the whole reason it isn't plan_tier —
            // the webhook would overwrite that the moment they bought Base.
            tier = 'pro';
        } else if (status === 'trialing') {
            tier = 'pro';
        } else if (status === 'active') {
            tier = profile.plan_tier === 'pro' ? 'pro' : 'base';
        }

        localStorage.setItem('ceo_sub_status', status);
        localStorage.setItem('ceo_plan_tier', tier);
        // Read by isLockedOut(), so a comped account never meets the paywall
        // even once its trial clock has run out. Mirrors account_access() in the
        // database, which is what actually enforces this server side.
        if (compPro) {
            localStorage.setItem('ceo_comp_pro', 'true');
        } else {
            localStorage.removeItem('ceo_comp_pro');
        }
        if (trialEndsAt) {
            localStorage.setItem('ceo_trial_ends_at', trialEndsAt.toISOString());
        } else {
            localStorage.removeItem('ceo_trial_ends_at');
        }

        return { status, daysLeft, trialEndsAt, tier, compPro };
    } catch (err) {
        console.warn('Could not refresh access state:', err.message);
        return null;
    }
};

// supabase-js collapses any non-2xx from an edge function into a generic
// "non-2xx status code" error, which would hide the actual explanation. The real
// message is in the response body, so dig it out. Without this, someone who hits
// their daily AI limit or whose trial has ended just sees gibberish.
window.readFunctionError = async function readFunctionError(error) {
    try {
        if (error && error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            // Our own functions answer with { error }. The Supabase gateway
            // rejects a bad JWT before the function runs and answers with
            // { message } instead, which used to fall through to the generic
            // "non-2xx status code" text.
            if (body && body.error) return body.error;
            if (body && body.message) return body.message;
        }
    } catch (err) {
        // Body wasn't readable, fall back to the generic message below
    }

    // A transport failure has no response to read. supabase-js words this as
    // "Failed to send a request to the Edge Function", which tells a customer
    // nothing and reads like the app is broken rather than the connection.
    if (error && error.name === 'FunctionsFetchError') {
        return 'Could not reach the AI coach. Check your connection and try again.';
    }

    return (error && error.message) || 'Something went wrong. Please try again.';
};

// Reads the session supabase-js persisted, without going through the SDK.
//
// Needed because `auth.getSession()` is not reliable enough on its own to
// declare somebody signed out. It serialises through a navigator lock shared by
// every tab of the app, so with two tabs open — each running its own hourly
// token refresh — a call can come back empty while a perfectly good session is
// sitting in storage. Trusting that empty answer is what told a signed-in user
// her session had expired.
// Every localStorage key that looks like a supabase-js auth session. Found by
// shape rather than by asking the SDK for `storageKey`, because the CDN tag in
// index.html is an unpinned `@2` — the exact build, and what it chooses to
// expose, can change without this app shipping anything.
function findAuthStorageKeys() {
    const keys = [];
    try {
        const declared = window.db && window.db.auth && window.db.auth.storageKey;
        if (declared) keys.push(declared);

        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('sb-') && k.endsWith('-auth-token') && keys.indexOf(k) === -1) {
                keys.push(k);
            }
        }
    } catch (err) {
        // Storage unavailable (private mode, blocked cookies). Nothing to find.
    }
    return keys;
}

function tokenFromStorage(trace) {
    const keys = findAuthStorageKeys();
    if (keys.length === 0) {
        trace.push('storage: no sb-*-auth-token key present');
        return null;
    }

    for (const key of keys) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;

            // v2 stores the session at the top level; older releases nested it
            // under currentSession. Read both so a returning user is not signed
            // out by a storage shape we did not expect.
            const parsed = JSON.parse(raw);
            const session = (parsed && parsed.currentSession) || parsed;
            if (!session || !session.access_token) {
                trace.push(`storage(${key}): no access_token in the stored value`);
                continue;
            }

            // An expired token is worse than none: the function rejects it and
            // the customer is told to sign in for a session that only needed
            // refreshing.
            if (session.expires_at && (session.expires_at * 1000) <= Date.now()) {
                trace.push(`storage(${key}): token expired`);
                continue;
            }

            return session.access_token;
        } catch (err) {
            trace.push(`storage(${key}): unreadable (${err.message})`);
        }
    }
    return null;
}

// Asks for a brand new access token. Kept separate because it rotates the
// refresh token, so it is a last resort rather than a routine step — two tabs
// racing to rotate the same token is one of the ways a healthy session starts
// looking broken.
async function forceRefreshToken(trace) {
    try {
        const { data, error } = await window.db.auth.refreshSession();
        if (data && data.session && data.session.access_token) {
            return data.session.access_token;
        }
        if (trace) trace.push('refreshSession: ' + (error ? error.message : 'returned no session'));
    } catch (err) {
        if (trace) trace.push('refreshSession threw: ' + err.message);
    }
    return null;
}

// Resolves the signed-in user's access token.
//
// Passing this explicitly matters because supabase-js will not tell you when it
// has no session: `_getAccessToken()` ends with `?? this.supabaseKey`, so it
// quietly sends the public anon key instead. The anon key is a valid JWT with
// no `sub` claim, so the chat function rejects it as a bad token.
//
// The order below is deliberate — ask the SDK, fall back to what it stored, and
// only then rotate the token.
// Telling a signed-in user to sign in is a dead end for her and a mystery for
// whoever has to fix it, so when all three routes fail the reason each one gave
// is written to the console. Names of storage keys and error text only — never
// a token.
async function getAccessToken() {
    const trace = [];

    try {
        const { data, error } = await window.db.auth.getSession();
        if (data && data.session && data.session.access_token) {
            return data.session.access_token;
        }
        trace.push('getSession: ' + (error ? error.message : 'returned no session'));
    } catch (err) {
        trace.push('getSession threw: ' + err.message);
    }

    const stored = tokenFromStorage(trace);
    if (stored) return stored;

    const refreshed = await forceRefreshToken(trace);
    if (refreshed) return refreshed;

    console.warn(
        '[CEO Planner] No access token for the AI request.\n' +
        trace.map(t => '  - ' + t).join('\n') +
        '\n  - localStorage keys: ' + Object.keys(localStorage).join(', ')
    );
    return null;
}

// Brings the app's idea of being logged in back in line with reality.
//
// The login gate is a localStorage flag, `ceo_auth`, written at sign-in and
// never checked against the actual Supabase session again (js/app.js:35). The
// two drift apart easily: clearing site data, a refresh token that expired or
// was rotated away by another device, or signing in on a different port during
// development. The flag still says "true", so every screen renders happily from
// cached data and the app looks completely signed in — until the first thing
// that genuinely needs the server, the AI coach, fails. That mismatch is the
// whole story behind being told your session expired while looking at a screen
// full of your own numbers.
//
// Deliberately hard to trigger. A session that is merely slow, held by another
// tab's lock, or briefly unreadable still leaves a usable token for
// getAccessToken to find, and returns here as signed in. Offline is excluded
// outright: a failed refresh with no network says nothing about the session.
// Only a browser that is online and has no Supabase session anywhere is treated
// as signed out.
//
// The planner data in localStorage is left alone. It may hold work that never
// reached the server, and it is restored on the next sign-in.
window.reconcileAuthState = async function reconcileAuthState() {
    if (localStorage.getItem('ceo_auth') !== 'true') return true;
    if (navigator.onLine === false) return true;

    const token = await getAccessToken();
    if (token) return true;

    console.warn('[CEO Planner] Locally signed in, but this browser has no Supabase session. Sending you to sign in again.');

    ['ceo_auth', 'ceo_sub_status', 'ceo_plan_tier', 'ceo_comp_pro', 'ceo_trial_ends_at']
        .forEach(key => localStorage.removeItem(key));

    window.location.hash = '#/login';
    return false;
};

// The single way the app talks to the `chat` edge function.
//
// Every AI feature used to call window.db.functions.invoke directly, which left
// two failure modes reaching customers as raw SDK text:
//
//   1. The function is invoked rarely enough to be cold almost every time, and
//      a cold worker occasionally fails to boot. The preflight then answers 502
//      and supabase-js reports "Failed to send a request to the Edge Function".
//      One retry clears it — the second attempt boots in around 20ms.
//   2. No session meant the anon key went out and came back 401 (see above).
//
// Both are recovered from here rather than shown to the customer. Telling
// somebody to sign in is the last thing this does, not the first: every route
// to a fresh token is tried before the request is given up on.
//
// `options` is passed straight through to the function body alongside the
// messages. All of it is optional, and omitting it behaves exactly as before:
//
//   feature    a Pro feature key, e.g. 'live-ai'. The function refuses the
//              request unless the account really is on Pro. Leave it off for
//              anything every plan gets, like the chat coach itself.
//   json       true to make OpenAI guarantee valid JSON. Set this on every
//              caller that runs JSON.parse on the answer.
//   maxTokens  a ceiling on the reply length. Clamped server side.
//   background true for a call the user did not ask for. Kept on the client —
//              it only decides whether an allowance warning may interrupt.
//
// Returns the OpenAI response body, or throws an Error whose message is safe to
// show the customer.
window.invokeChat = async function invokeChat(messages, options = {}) {
    // `background` is ours, not the function's. Stripping it here means the
    // server contract stays exactly the three fields it documents.
    const { background = false, ...serverOptions } = options;
    let token = await getAccessToken();
    if (!token) {
        throw new Error('Your session has expired. Please sign in again to use the AI coach.');
    }

    let lastError = null;
    let transportRetries = 0;
    let tokenRefreshed = false;

    // At most three: the first, one for a cold worker, one for a stale token.
    for (let attempt = 0; attempt < 3; attempt++) {
        // Passing the token explicitly rather than trusting the SDK to attach
        // it, so this can never fall back to the anon key behind our backs.
        const { data, error } = await window.db.functions.invoke('chat', {
            body: { messages, ...serverOptions },
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!error) {
            if (data && data.error) {
                throw new Error(data.error.message || data.error);
            }

            // Every successful call reports where today's allowance stands, so
            // this is the one place that has to notice. Recording is silent;
            // warning is not, which is why it is limited to requests the user
            // actually made.
            if (data && data.ceo_allowance) {
                recordAiAllowance(data.ceo_allowance);
                if (!background) warnIfAllowanceLow(data.ceo_allowance);
            }

            return data;
        }

        lastError = error;

        // A transport failure never reached the server, so nothing was charged
        // against the daily AI allowance and the cold-boot case is worth one
        // more go.
        if (error.name === 'FunctionsFetchError' && transportRetries === 0) {
            transportRetries++;
            await new Promise(resolve => setTimeout(resolve, 1200));
            continue;
        }

        // 401 means the token was not accepted. Reading .status does not consume
        // the response body, so readFunctionError can still report the real
        // message if the retry fails too. Rotating the token and trying once
        // more beats telling a plainly signed-in user to sign in.
        const status = error.context && error.context.status;
        if (status === 401 && !tokenRefreshed) {
            tokenRefreshed = true;
            const fresh = await forceRefreshToken();
            if (fresh) {
                token = fresh;
                continue;
            }
        }

        // Any other response — 402, 429, 503 — is a real decision from the
        // server. Repeating it would burn a second call off the quota for the
        // same refusal.
        break;
    }

    throw new Error(await window.readFunctionError(lastError));
};

// The statuses that lock someone out of the app.
window.CEO_LOCKED_STATUSES = ['incomplete', 'past_due', 'canceled', 'unpaid', 'trial_expired'];
window.isLockedOut = function isLockedOut(status) {
    // A comped account is never locked out, whatever its subscription says.
    // The flag is set by hand in the database and cached by refreshAccessState;
    // account_access() enforces the same rule server side, so a tampered local
    // value buys nothing but the shape of a screen.
    //
    // Deliberately NOT done by rewriting the status to 'active': a comped
    // account whose trial has lapsed should still be able to open #/billing and
    // subscribe, and app.js sends 'active' accounts away from that screen.
    if (localStorage.getItem('ceo_comp_pro') === 'true') return false;
    return window.CEO_LOCKED_STATUSES.includes(status);
};
