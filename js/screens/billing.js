// billing.js
import { showToast, rerenderScreen } from '../components/toast.js';

// Checkout happens on Stripe's own page and the account is upgraded by a webhook
// firing somewhere else entirely, so there is a window of a few seconds where the
// customer is back in the app and the database has not caught up. That window
// lands at the worst possible moment: she has just paid and the app is still
// saying "your 14 days are up". These two constants govern how long we wait it
// out before giving her the manual escape hatch instead.
const CONFIRM_POLL_MS = 2000;
const CONFIRM_TIMEOUT_MS = 30000;

// Set once the confirming screen has given up, so re-rendering the route doesn't
// restart the wait forever.
let confirmAbandoned = false;
let confirmTimer = null;

// Stripe sends people back to a success URL we control. Accept the marker in the
// query string or inside the hash, because a payment link can be configured
// either way and getting it wrong would silently disable the whole flow.
function hasCheckoutMarker() {
    if (/[?&]checkout=success/.test(window.location.search)) return true;
    const hash = window.location.hash || '';
    const q = hash.indexOf('?');
    return q !== -1 && /[?&]checkout=success/.test(hash.slice(q));
}

function clearCheckoutMarker() {
    const hash = (window.location.hash || '').split('?')[0];
    const url = window.location.pathname + (hash || '#/billing');
    window.history.replaceState({}, '', url);
}

export function renderBilling() {
    window.setScreenModule({ attachEvents: billingAttachEvents });

    const status = localStorage.getItem('ceo_sub_status');

    // Just back from Stripe. Wait for the webhook rather than telling someone who
    // has this second paid us that their trial is over.
    if (hasCheckoutMarker() && !confirmAbandoned && status !== 'active') {
        return renderConfirmingPayment();
    }

    // Still inside the trial and choosing to subscribe early
    if (status === 'trialing') return renderTrialEnded(true);

    // Trial ran out, or the account was never provisioned
    if (status === 'trial_expired' || status === 'incomplete') return renderTrialEnded(false);

    // An existing customer whose card failed
    return renderPaymentProblem();
}

// The few seconds between paying and the webhook landing. Deliberately calm and
// certain: the payment has gone through, this is only bookkeeping.
function renderConfirmingPayment() {
    return `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-bg-main) 100%); padding: 1.5rem;">
            <div id="confirm-payment-card" class="card fade-up" style="width: 100%; max-width: 460px; padding: 3rem 2.5rem; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(10px);">

                <div class="spinner" style="width: 32px; height: 32px; border: 3px solid var(--color-primary-light); border-top: 3px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem;"></div>

                <h2 style="font-size: 1.5rem; color: var(--color-black); margin-bottom: 1rem; letter-spacing: -0.02em;">Confirming your payment</h2>

                <p style="color: var(--color-text-muted); font-size: 1rem; line-height: 1.6; margin-bottom: 0;">
                    Thank you. Your payment has gone through and we're just waiting for it
                    to reach your account. This usually takes a few seconds.
                </p>
            </div>
        </div>
    `;
}

// Every screen in this file gets this. Whatever else goes wrong — a webhook that
// never fires, a checkout finished in another tab, an email that didn't match —
// there is always one thing the customer can press herself.
function renderRefreshLink() {
    return `
        <p style="margin-top: 1.25rem; margin-bottom: 0; font-size: 0.8rem; color: var(--color-text-muted);">
            Already paid?
            <a href="#" id="btn-refresh-account" style="color: var(--color-primary-dark); text-decoration: underline;">Refresh my account</a>
        </p>
    `;
}

// The card-free trial ran out, or they're subscribing early. Nothing has gone
// wrong in either case, so the tone here is an invitation rather than a warning.
function renderTrialEnded(stillInTrial) {
    const trialEndsAtStr = localStorage.getItem('ceo_trial_ends_at');
    let daysLeft = null;
    if (stillInTrial && trialEndsAtStr) {
        daysLeft = Math.max(0, Math.ceil((new Date(trialEndsAtStr).getTime() - Date.now()) / 86400000));
    }

    const heading = stillInTrial ? 'Ready to make it official?' : 'Your 14 days are up';
    const blurb = stillInTrial
        ? `You've still got ${daysLeft !== null ? daysLeft : 'a few'} ${daysLeft === 1 ? 'day' : 'days'} left, so there's no rush.
           Pick a plan whenever you're ready and nothing will be interrupted.`
        : `Your plans, streaks and revenue history are all still here, safe and waiting.
           Pick a plan below and you'll pick up exactly where you left off.`;

    const backLink = stillInTrial
        ? `<a href="#/dashboard" style="color: var(--color-text-muted); font-size: 0.875rem; text-decoration: underline;">Back to my dashboard</a>`
        : `<a href="#" id="btn-signout" style="color: var(--color-text-muted); font-size: 0.875rem; text-decoration: underline;">Sign out</a>`;

    return `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-bg-main) 100%); padding: 1.5rem;">
            <div class="card fade-up" style="width: 100%; max-width: 520px; padding: 3rem 2.5rem; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(10px);">

                <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: var(--color-primary-light); color: var(--color-primary-dark); border-radius: 16px; margin-bottom: 1.5rem;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </div>

                <h2 style="font-size: 1.75rem; color: var(--color-black); margin-bottom: 1rem; letter-spacing: -0.02em;">${heading}</h2>

                <p style="color: var(--color-text-muted); font-size: 1.05rem; margin-bottom: 2rem; line-height: 1.6;">
                    ${blurb}
                </p>

                <button id="btn-annual" class="btn btn-primary" style="width: 100%; padding: 1rem; font-size: 1.05rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(78, 14, 255, 0.2); margin-bottom: 0.75rem;">
                    Continue yearly, best value
                </button>

                <button id="btn-monthly" class="btn btn-secondary" style="width: 100%; padding: 1rem; font-size: 1.05rem; border-radius: 12px; margin-bottom: 1.5rem;">
                    Continue monthly
                </button>

                <p style="color: var(--color-text-muted); font-size: 0.8rem; margin-bottom: 1.5rem; line-height: 1.5;">
                    Please check out with the same email address you signed up with,
                    otherwise we won't be able to match your account.
                </p>

                ${backLink}
                ${renderRefreshLink()}
            </div>
        </div>
    `;
}

// An existing paying customer whose card has failed. They already have a Stripe
// record, so the customer portal is the right destination.
function renderPaymentProblem() {
    return `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-bg-main) 100%); padding: 1.5rem;">
            <div class="card fade-up" style="width: 100%; max-width: 480px; padding: 3rem 2.5rem; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(10px);">

                <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: rgba(252, 165, 165, 0.2); color: #DC2626; border-radius: 16px; margin-bottom: 1.5rem;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>

                <h2 style="font-size: 1.75rem; color: var(--color-black); margin-bottom: 1rem; letter-spacing: -0.02em;">There's a problem with your payment</h2>

                <p style="color: var(--color-text-muted); font-size: 1.05rem; margin-bottom: 2rem; line-height: 1.6;">
                    Your last payment didn't go through, so your Command Center is paused.
                    Update your card and everything comes straight back.
                </p>

                <button id="btn-portal" class="btn btn-primary" style="width: 100%; padding: 1rem; font-size: 1.1rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(78, 14, 255, 0.2); margin-bottom: 1rem;">
                    Update Payment Method
                </button>

                <a href="#" id="btn-signout" style="color: var(--color-text-muted); font-size: 0.875rem; text-decoration: underline;">Sign out</a>
                ${renderRefreshLink()}
            </div>
        </div>
    `;
}

// Ask the database whether this account has access yet. Returns true if it does,
// and takes the user through to the app when it does.
async function checkAccessNow() {
    const access = await window.refreshAccessState();
    if (!access) return null; // Couldn't reach the server

    if (!window.isLockedOut(access.status)) {
        clearCheckoutMarker();
        window.location.hash = '#/dashboard';
        // Full reload on purpose: the whole app was rendered for a locked-out or
        // base account, so every gate and every screen needs rebuilding.
        window.location.reload();
        return true;
    }
    return false;
}

function billingAttachEvents() {
    // Poll while the "confirming your payment" card is on screen.
    if (document.getElementById('confirm-payment-card') && hasCheckoutMarker() && !confirmAbandoned) {
        const startedAt = Date.now();
        if (confirmTimer) clearInterval(confirmTimer);

        confirmTimer = setInterval(async () => {
            const done = await checkAccessNow();
            if (done) {
                clearInterval(confirmTimer);
                confirmTimer = null;
                return;
            }

            if (Date.now() - startedAt >= CONFIRM_TIMEOUT_MS) {
                clearInterval(confirmTimer);
                confirmTimer = null;
                // Give up gracefully and fall back to the normal screen, which
                // carries the manual refresh link. Never leave someone watching a
                // spinner that is never going to stop.
                confirmAbandoned = true;
                showToast("Your payment went through, but it hasn't reached your account yet. Give it a minute and press 'Refresh my account', or contact support and we'll sort it.", 'error');
                rerenderScreen();
            }
        }, CONFIRM_POLL_MS);
    }

    const btnRefresh = document.getElementById('btn-refresh-account');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', async (e) => {
            e.preventDefault();
            const original = btnRefresh.textContent;
            btnRefresh.textContent = 'Checking…';
            btnRefresh.style.pointerEvents = 'none';

            const result = await checkAccessNow();

            btnRefresh.textContent = original;
            btnRefresh.style.pointerEvents = '';

            if (result === null) {
                showToast("We couldn't reach the server. Check your connection and try again.", 'error');
            } else if (result === false) {
                showToast("We can't see a payment on this account yet. If you've just paid, give it a minute. If you checked out with a different email address, contact support and we'll link it up.", 'error');
            }
            // On success checkAccessNow has already navigated away.
        });
    }

    // Send them to Stripe with their email already filled in, so the webhook can
    // match the payment back to the account they already have.
    const checkout = async (baseUrl) => {
        let url = baseUrl;
        try {
            const { data: { session } } = await window.db.auth.getSession();
            const email = session && session.user ? session.user.email : null;
            if (email) {
                url += (baseUrl.includes('?') ? '&' : '?') + 'prefilled_email=' + encodeURIComponent(email);
            }
        } catch (err) {
            console.warn('Could not read email for checkout prefill:', err.message);
        }
        window.location.href = url;
    };

    const btnAnnual = document.getElementById('btn-annual');
    if (btnAnnual) {
        btnAnnual.addEventListener('click', () => checkout(window.CEO_CHECKOUT_ANNUAL));
    }

    const btnMonthly = document.getElementById('btn-monthly');
    if (btnMonthly) {
        btnMonthly.addEventListener('click', () => checkout(window.CEO_CHECKOUT_MONTHLY));
    }

    const btnPortal = document.getElementById('btn-portal');
    if (btnPortal) {
        btnPortal.addEventListener('click', () => {
            window.location.href = window.CEO_BILLING_PORTAL;
        });
    }

    const btnSignout = document.getElementById('btn-signout');
    if (btnSignout) {
        btnSignout.addEventListener('click', async (e) => {
            e.preventDefault();
            try { await window.db.auth.signOut(); } catch (err) { /* sign out locally regardless */ }
            localStorage.removeItem('ceo_auth');
            localStorage.removeItem('ceo_sub_status');
            localStorage.removeItem('ceo_trial_ends_at');
            localStorage.removeItem('ceo_plan_tier');
            localStorage.removeItem('ceoPlanner_store');
            window.location.hash = '#/login';
            window.location.reload();
        });
    }
}
