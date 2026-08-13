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

// Reads the user's real subscription state from the database and caches it locally.
// The cached copy is only ever used to render the UI. The database is the source
// of truth, and the chat function checks it server side.
window.refreshAccessState = async function refreshAccessState() {
    try {
        const { data: { session } } = await window.db.auth.getSession();
        if (!session || !session.user) return null;

        const { data: profile, error } = await window.db
            .from('profiles')
            .select('subscription_status, trial_ends_at')
            .eq('id', session.user.id)
            .maybeSingle();

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
            return { status: 'incomplete', daysLeft: 0, trialEndsAt: null };
        }

        const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
        let status = profile.subscription_status || 'incomplete';
        let daysLeft = null;

        if (status === 'trialing' && trialEndsAt) {
            const msLeft = trialEndsAt.getTime() - Date.now();
            daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
            if (msLeft <= 0) status = 'trial_expired';
        }

        localStorage.setItem('ceo_sub_status', status);
        if (trialEndsAt) {
            localStorage.setItem('ceo_trial_ends_at', trialEndsAt.toISOString());
        } else {
            localStorage.removeItem('ceo_trial_ends_at');
        }

        return { status, daysLeft, trialEndsAt };
    } catch (err) {
        console.warn('Could not refresh access state:', err.message);
        return null;
    }
};

// The statuses that lock someone out of the app.
window.CEO_LOCKED_STATUSES = ['incomplete', 'past_due', 'canceled', 'unpaid', 'trial_expired'];
window.isLockedOut = function isLockedOut(status) {
    return window.CEO_LOCKED_STATUSES.includes(status);
};
