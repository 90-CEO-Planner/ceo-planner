// billing.js

export function renderBilling() {
    window.setScreenModule({ attachEvents: billingAttachEvents });

    const status = localStorage.getItem('ceo_sub_status');

    // Still inside the trial and choosing to subscribe early
    if (status === 'trialing') return renderTrialEnded(true);

    // Trial ran out, or the account was never provisioned
    if (status === 'trial_expired' || status === 'incomplete') return renderTrialEnded(false);

    // An existing customer whose card failed
    return renderPaymentProblem();
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
            </div>
        </div>
    `;
}

function billingAttachEvents() {
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
            localStorage.removeItem('ceoPlanner_store');
            window.location.hash = '#/login';
            window.location.reload();
        });
    }
}
