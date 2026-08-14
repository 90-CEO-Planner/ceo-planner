// supabaseClient.js

const SUPABASE_URL = 'https://ekzpbpoadiktlflcrrwm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrenBicG9hZGlrdGxmbGNycndtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDk3NDAsImV4cCI6MjA5MDEyNTc0MH0.Wy0Pq-ZFVEP8evzgGHQUnqUoLLIA_lSEHiQWY1kvQ_w';

// Initialize the Supabase client attached to the global window
window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Stripe checkout links for when the free trial runs out.
// These deliberately have NO Stripe trial period on them. The 14 free days are
// served by the app, so a trial period here would hand people a second fortnight
// free before they were ever charged.
window.CEO_CHECKOUT_MONTHLY = 'https://buy.stripe.com/7sY28q2DXgrp6H67VM18c08';
window.CEO_CHECKOUT_ANNUAL = 'https://buy.stripe.com/28E8wO92l6QP1mM3Fw18c09';
// Existing customers whose card failed manage themselves here
window.CEO_BILLING_PORTAL = 'https://billing.stripe.com/p/login/eVq3cucex8YXc1q0tk18c00';

// Pro tier checkout. Deliberately null: Pro is being built and has no price in
// Stripe yet, so the locked-feature modal explains the feature and stops there
// rather than selling something that cannot be delivered. Set this to the Pro
// payment link when the tier ships and the modal grows an upgrade button.
window.CEO_CHECKOUT_PRO = null;

// Reads the user's real subscription state from the database and caches it locally.
// The cached copy is only ever used to render the UI. The database is the source
// of truth, and the chat function checks it server side.
window.refreshAccessState = async function refreshAccessState() {
    try {
        const { data: { session } } = await window.db.auth.getSession();
        if (!session || !session.user) return null;

        let { data: profile, error } = await window.db
            .from('profiles')
            .select('subscription_status, trial_ends_at, plan_tier')
            .eq('id', session.user.id)
            .maybeSingle();

        // `plan_tier` is newer than some deployed databases. Postgres answers
        // 42703 (undefined_column) if the migration hasn't been run yet. Without
        // this retry, shipping the bundle before the migration would make every
        // access check fail and nothing would ever revalidate a trial again.
        if (error && (error.code === '42703' || /plan_tier/.test(error.message || ''))) {
            console.warn('profiles.plan_tier is missing — run the plan_tier migration. Treating this account as base.');
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
            return { status: 'incomplete', daysLeft: 0, trialEndsAt: null, tier: 'base' };
        }

        const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
        let status = profile.subscription_status || 'incomplete';
        let daysLeft = null;

        if (status === 'trialing' && trialEndsAt) {
            const msLeft = trialEndsAt.getTime() - Date.now();
            daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
            if (msLeft <= 0) status = 'trial_expired';
        }

        // Which feature set they get. The 14-day trial deliberately runs on Pro:
        // nobody upgrades to a tier they have never seen, and the locked-feature
        // teasers only do their job as a reminder of something the user has
        // already had. This grants Pro *features* — the AI allowance stays at the
        // trial rate, because consume_ai_quota keys off subscription_status, not
        // off this. Anyone locked out resolves to base; they see the paywall
        // rather than any of this.
        let tier = 'base';
        if (status === 'trialing') {
            tier = 'pro';
        } else if (status === 'active') {
            tier = profile.plan_tier === 'pro' ? 'pro' : 'base';
        }

        localStorage.setItem('ceo_sub_status', status);
        localStorage.setItem('ceo_plan_tier', tier);
        if (trialEndsAt) {
            localStorage.setItem('ceo_trial_ends_at', trialEndsAt.toISOString());
        } else {
            localStorage.removeItem('ceo_trial_ends_at');
        }

        return { status, daysLeft, trialEndsAt, tier };
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
            if (body && body.error) return body.error;
        }
    } catch (err) {
        // Body wasn't readable, fall back to the generic message below
    }
    return (error && error.message) || 'Something went wrong. Please try again.';
};

// The statuses that lock someone out of the app.
window.CEO_LOCKED_STATUSES = ['incomplete', 'past_due', 'canceled', 'unpaid', 'trial_expired'];
window.isLockedOut = function isLockedOut(status) {
    return window.CEO_LOCKED_STATUSES.includes(status);
};
