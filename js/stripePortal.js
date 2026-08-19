// stripePortal.js
//
// The customer's way into their own billing: change card, read invoices, cancel,
// and — the thing this was actually built for — move from Base up to Pro.
//
// Why an edge function rather than the link that used to be here:
//
// `window.CEO_BILLING_PORTAL` is Stripe's *login page*. It asks for an email
// address, emails a code, and only then shows the portal. That is a reasonable
// last resort for someone whose card has failed, and a poor front door for
// somebody who is already signed in — they have just proved who they are, and
// we are asking them to go and check their email. Worse, it runs on the account's
// DEFAULT portal configuration, which is shared with WEN Business Club and
// everything else Jen sells, and which offers no plan switching for the planner.
//
// The function creates a session against a CEO Planner-specific configuration
// instead, so the plan list is the four planner prices and nothing else, and it
// can drop the customer straight onto the plan-switch step.
//
// The login link is kept as the fallback for when the function cannot be reached
// at all. Somebody whose payment has failed must always have a route to fixing
// it, even on the day our own backend is having a bad time.
import { showToast } from './components/toast.js';
import { anyProFeatureLive } from './components/proGate.js';

// Both of these mean "there is nothing to manage yet, go and buy a plan". They
// are separate codes because they are separate situations — no Stripe customer
// at all, versus a customer whose planner subscription has ended — and if this
// ever needs different wording per case, the information is already here.
const NO_BILLING_CODES = ['no_customer', 'no_subscription'];

// Pull both the message and the machine-readable code off a function error.
// `window.readFunctionError` reads the message only, and the code is the half
// that decides where the customer goes next.
async function readPortalError(error) {
    let code = null;
    let message = null;

    try {
        if (error && error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body) {
                code = body.code || null;
                message = body.error || body.message || null;
            }
        }
    } catch (err) {
        // Unreadable body. The generic path below still says something useful.
    }

    if (!message) message = await window.readFunctionError(error);
    return { code, message };
}

// Open the portal. `intent` is either 'upgrade', which lands on the plan switch
// for their live subscription, or nothing, which lands on the portal home.
//
// Returns null on success — though "success" here means the browser is already
// on its way to Stripe — and an error string if the caller wants to say
// something itself. It has already shown a toast either way.
export async function openBillingPortal(intent) {
    try {
        const { data, error } = await window.db.functions.invoke('stripe-portal', {
            method: 'POST',
            body: intent ? { intent } : {}
        });

        if (error) {
            const { code, message } = await readPortalError(error);

            if (NO_BILLING_CODES.includes(code)) {
                // Not a failure from where the customer is sitting: they simply
                // have no subscription to manage. Send them to the one screen
                // that can give them one.
                showToast("You don't have a subscription on this account yet. Here are the plans.", 'info');
                window.location.hash = '#/billing';
                return null;
            }

            showToast(message, 'error');
            return message;
        }

        if (!data || !data.url) {
            showToast('We could not open your billing page. Please try again in a moment.', 'error');
            return 'No portal URL returned.';
        }

        window.location.href = data.url;
        return null;
    } catch (err) {
        // The function was unreachable — offline, or the whole project is down.
        // Fall back to Stripe's own login page rather than leaving somebody with
        // a failed card and no way to fix it.
        console.warn('Portal session failed, falling back to the login link:', err && err.message);
        if (window.CEO_BILLING_PORTAL) {
            window.location.href = window.CEO_BILLING_PORTAL;
            return null;
        }
        showToast('We could not open your billing page. Please try again in a moment.', 'error');
        return 'Portal unreachable.';
    }
}

// Is this account an existing subscriber who could move up to Pro?
//
// All four conditions matter:
//
//   - on Base. A Pro customer has nowhere to go, and the trial resolves to Pro
//     (see getPlanTier), so this is false during the 14 days — which is right:
//     a trial user has never paid, so there is nothing to prorate. They go
//     through #/billing and buy Pro outright.
//   - paying. `active` or `past_due` only. Without a live subscription there is
//     no proration to do, and the portal would open on nothing.
//   - not comped. Derina pays Base and holds Pro by hand. Offering her an
//     upgrade would be selling her something she already has.
//   - Pro has to actually exist to sell. If no Pro feature has shipped yet there
//     is nothing behind the upsell, which is the same rule the plan card follows.
export function canUpgradeToPro() {
    const status = localStorage.getItem('ceo_sub_status');
    if (status !== 'active' && status !== 'past_due') return false;
    if (localStorage.getItem('ceo_comp_pro') === 'true') return false;
    if (localStorage.getItem('ceo_plan_tier') === 'pro') return false;
    return anyProFeatureLive();
}

// Coming back from the portal.
//
// The plan lives in two places for a few seconds: Stripe has it immediately, and
// the app finds out when `customer.subscription.updated` reaches the webhook and
// that reaches `profiles`. Somebody who has just upgraded and lands back on an
// Account screen still rendered for a Base user would reasonably conclude they
// had paid for nothing.
//
// So on the way back in, poll until the tier actually changes, then reload —
// full reload rather than a re-render, because every gate in the app was built
// for the old tier. Same shape as the post-checkout wait in billing.js, and the
// same principle: never spin forever. If the webhook is slow, the screen stays
// as it was and the customer can press refresh, which is a small annoyance
// rather than a stuck page.
const RETURN_POLL_MS = 2000;
const RETURN_TIMEOUT_MS = 20000;

export function hasBillingReturnMarker() {
    const hash = window.location.hash || '';
    const q = hash.indexOf('?');
    const inHash = q !== -1 && /[?&]billing=updated/.test(hash.slice(q));
    return inHash || /[?&]billing=updated/.test(window.location.search);
}

export function clearBillingReturnMarker() {
    const hash = (window.location.hash || '').split('?')[0];
    window.history.replaceState({}, '', window.location.pathname + (hash || '#/account'));
}

export async function watchForPlanChange() {
    if (!hasBillingReturnMarker()) return;

    const before = localStorage.getItem('ceo_plan_tier');
    const startedAt = Date.now();

    // Cleared straight away, so a re-render of the Account screen doesn't start
    // a second watcher on top of this one.
    clearBillingReturnMarker();

    const timer = setInterval(async () => {
        const access = await window.refreshAccessState();
        const changed = access && access.tier && access.tier !== before;

        if (changed) {
            clearInterval(timer);
            showToast("You're on the new plan. Everything it unlocks is available now.", 'success');
            // Let the toast land before the page goes.
            setTimeout(() => window.location.reload(), 1200);
            return;
        }

        if (Date.now() - startedAt >= RETURN_TIMEOUT_MS) {
            clearInterval(timer);
            // Deliberately quiet. Nothing has gone wrong — a downgrade scheduled
            // for the renewal date changes nothing today, and that is the most
            // likely reason to arrive here. Shouting about it would worry
            // somebody whose change worked exactly as Stripe described it.
        }
    }, RETURN_POLL_MS);
}
