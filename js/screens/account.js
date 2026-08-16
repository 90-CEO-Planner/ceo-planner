// account.js
//
// "My account with this company", as opposed to Settings, which is "how my
// business is configured". They were one 5,000px page, which buried billing and
// cancellation at the very bottom — the two things a person needs to find fast,
// and usually when they are already a bit annoyed.
//
// This screen owns: which plan you are on, what Pro adds, billing, your login
// details, and erasing everything. Settings keeps the business profile, goals,
// strategy mode and reminders, all of which feed the AI rather than the account.
import { renderNav, signOutAndClear } from '../components/nav.js';
import { showToast, showConfirm } from '../components/toast.js';
import { PRO_FEATURES, PRO_FEATURE_KEYS, getPlanTier, isProTrial, trialDaysLeft, isFeatureLive, proBadge } from '../components/proGate.js';
import { fetchStripeConnection, connectStripeKey, disconnectStripe, syncStripeSales, canConnectStripe, STRIPE_KEY_PAGE } from '../stripeImport.js';

// Everything the base plan includes. Written out rather than derived, because
// the point of this list is to make base feel like a complete product on its
// own — a Pro list with nothing beside it reads as a list of things you lack.
const BASE_FEATURES = [
    'Your 90-day roadmap and quarterly targets',
    'Weekly planning and the Daily 3',
    'Revenue, leads and conversion tracking',
    'The Friday Review and your Monday draft',
    'The AI coach, 30 conversations a day',
    'CSV export of everything you log',
    'Executive reports on demand'
];

const TICK_SVG = `<svg class="plan-feature-mark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const LOCK_SVG = `<svg class="plan-feature-mark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
const CLOCK_SVG = `<svg class="plan-feature-mark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

export function renderAccount() {
    window.setScreenModule({ attachEvents: accountAttachEvents });

    return `
        ${renderNav()}
<div class="main-content" style="max-width: 800px;">
    <div class="flex justify-between items-center mb-6">
        <h2>Account</h2>
        <a href="#/dashboard" class="btn btn-ghost" style="font-size: 0.875rem;">← Back</a>
    </div>

    ${renderPlanCard()}
    ${renderConnectionsCard()}
    ${renderBillingCard()}
    ${renderLoginCard()}
    ${renderDangerCard()}
</div>
`;
}

// Your Plan. Shows what the account is on now and, for base users, exactly what
// Pro adds — visible and clickable rather than hidden, so nothing about the
// upgrade is a surprise later.
function renderPlanCard() {
    const tier = getPlanTier();
    const onTrial = isProTrial();
    const days = trialDaysLeft();
    const hasPro = tier === 'pro';

    let heading;
    let sub;

    if (onTrial) {
        const dayText = days === null ? 'while your trial runs' : (days === 1 ? 'for 1 more day' : `for ${days} more days`);
        heading = 'Free trial, running on Pro';
        sub = `You have the complete product ${dayText}, including every Pro feature as it lands. Nothing to pay and no card on file. When the trial finishes you'll pick a plan, and Base keeps everything in the first list below.`;
    } else if (hasPro) {
        heading = 'CEO Planner Pro';
        sub = 'You have everything. Thank you — genuinely.';
    } else {
        heading = 'CEO Planner, Base plan';
        sub = "Everything in the first list is yours. The second list is what Pro adds — click any line to read what it actually does.";
    }

    const baseRows = BASE_FEATURES.map(f => `
        <div class="plan-feature-row">${TICK_SVG}<span>${f}</span></div>
    `).join('');

    // Three states per row, and the third one matters: a Pro or trial account
    // does NOT get a tick for a feature that hasn't been built yet. Ticking all
    // nine today would be telling a trial user she has things that don't exist.
    // Flip `shipped` in PRO_FEATURES as each one lands and this fixes itself.
    const proRows = PRO_FEATURE_KEYS.map(key => {
        const feature = PRO_FEATURES[key];
        if (!feature) return '';

        const live = isFeatureLive(key);
        let mark = LOCK_SVG;
        let suffix = '';
        // `is-locked` mutes the row. It stays on for anything the account can't
        // use *today*, which includes an unbuilt feature on a Pro or trial
        // account — a clock in full-strength text would read as available.
        let muted = true;

        if (hasPro && live) {
            mark = TICK_SVG;
            muted = false;
        } else if (hasPro) {
            mark = CLOCK_SVG;
            suffix = ` <span class="plan-feature-soon">in build</span>`;
        }

        return `
            <div class="plan-feature-row${muted ? ' is-locked' : ''}" data-pro-feature="${key}" role="button" tabindex="0">
                ${mark}<span>${feature.title}${suffix}</span>
            </div>
        `;
    }).join('');

    return `
    <div class="card mb-6">
        <h3 class="mb-2" style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-black);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            Your Plan
        </h3>
        <p style="color: var(--color-text-muted); font-size: 0.9rem; line-height: 1.6; margin-bottom: 1.5rem;"><strong style="color: var(--color-black);">${heading}</strong> — ${sub}</p>

        <p class="plan-section-label">In every plan</p>
        ${baseRows}

        <p class="plan-section-label" style="color: var(--color-secondary-dark); margin-top: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">${proBadge()} adds</p>
        ${proRows}
    </div>
    `;
}

// Connected payment processors, for Pro item 1.
//
// Gated on the feature being live as well as on the tier, so the card stays
// invisible until the import is genuinely finished. The backend is live before
// the client half is, and a Connect button that leads to a half-built feature is
// worse than no button. `canConnectStripe()` in stripeImport.js owns that rule —
// the Revenue teaser links here and has to agree with it.
function renderConnectionsCard() {
    if (!canConnectStripe()) return '';

    return `
    <div class="card mb-6">
        <h3 class="mb-2" style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-black);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            Connected accounts
        </h3>
        <p style="color: var(--color-text-muted); font-size: 0.875rem; line-height: 1.6; margin-bottom: 1.25rem;">
            Connect Stripe and your sales are imported here automatically. You give this a
            <strong>read-only key</strong> that you create yourself, so it can see payments
            but can never move money, issue a refund, or change anything in your Stripe
            account. You can disconnect at any time and your imported sales stay with you.
        </p>
        <div id="stripe-connection-state" style="color: var(--color-text-muted); font-size: 0.875rem;">Checking…</div>
    </div>
    `;
}

// The paste-a-key form.
//
// Written out step by step rather than hidden behind a "how do I do this?" link:
// creating a restricted key is the hardest thing this app ever asks anyone to
// do, and it happens once, at the exact moment someone is deciding whether the
// import is worth the bother. Stripe publishes no URL parameters for
// pre-selecting the permissions, so the list has to be found and ticked by hand
// — which makes naming the exact five resources the whole job.
//
// The five are the endpoints stripe-sync actually reads. Charges and Refunds is
// the money. The other four are only ever used to work out what a sale was FOR:
// the product name lives on the invoice or checkout session line items, never on
// the charge itself, so without them every imported sale reads "Subscription
// update".
//
// ⚠️ THE ORDER OF THESE STEPS IS NOT A GUESS. It is the order Stripe actually
// puts them in, walked through on a real account on 16 Aug 2026: name the key,
// choose the permissions, and THEN Stripe interrupts with its identity check as
// you go to create it. An earlier draft put the verification first, which is
// wrong and worse than leaving it out — someone reading a step that hasn't
// happened yet assumes they have missed something. Don't reorder without walking
// it through again.
//
// Two other details from the same walk-through:
//
//   1. The resource is labelled "Charges and Refunds", not "Charges", and the
//      permissions table has TWO columns — the second is Connect permissions,
//      which is for platforms acting on other people's accounts and is not what
//      we need. Telling people to use the filter box beats telling them to scroll
//      a list of sixty resources, and it survives Stripe renaming things.
//   2. The identity check ("Verification required" — security key, or email plus
//      one more) reads like OUR app has broken, at the exact moment we are asking
//      for a credential. Naming it before it appears is the whole point.
//
// The screenshot link in step 3 is hidden until the image is actually present —
// see revealPermissionsHelp(). No broken image ever renders.
function connectFormHtml() {
    return `
    <ol style="margin: 0 0 1.25rem 0; padding-left: 1.25rem; line-height: 1.7; color: var(--color-text-muted);">
        <li style="margin-bottom: 0.5rem;">
            Open <a href="${STRIPE_KEY_PAGE}" target="_blank" rel="noopener noreferrer" style="color: var(--color-primary-dark); font-weight: 600;">Stripe's create-a-key page</a>
            (you'll need to be signed in to Stripe).
        </li>
        <li style="margin-bottom: 0.5rem;">Name the key <strong style="color: var(--color-black);">CEO Planner</strong>, so you can recognise it later.</li>
        <li style="margin-bottom: 0.5rem;">
            Use the <strong style="color: var(--color-black);">Filter resources</strong> box to find each of
            these five, and set each one to <strong style="color: var(--color-black);">Read</strong> in the
            first <strong style="color: var(--color-black);">Permissions</strong> column:
            <strong style="color: var(--color-black);">Charges and Refunds</strong>,
            <strong style="color: var(--color-black);">PaymentIntents</strong>,
            <strong style="color: var(--color-black);">Invoices</strong>,
            <strong style="color: var(--color-black);">Products</strong> and
            <strong style="color: var(--color-black);">Checkout Sessions</strong>.
            Leave everything else on <strong style="color: var(--color-black);">None</strong>
            (ignore the second <em>Connect permissions</em> column completely).
            <a href="#" id="stripe-permissions-help" style="display: none; margin-left: 0.25rem; color: var(--color-primary-dark); font-weight: 600;">See what this looks like</a>
        </li>
        <li style="margin-bottom: 0.5rem;">
            When you create the key, Stripe will ask you to
            <strong style="color: var(--color-black);">verify it's really you</strong> — a security key, or
            email plus one more check. That's Stripe protecting your account, not us.
        </li>
        <li style="margin-bottom: 0.5rem;">Copy the key it gives you. It starts with <code>rk_</code>.</li>
        <li>Paste it below.</li>
    </ol>

    <div class="form-group mb-3">
        <label class="form-label" for="stripe-key-input" style="font-weight: 600;">Your restricted key</label>
        <input type="password" id="stripe-key-input" class="form-input" placeholder="rk_live_…"
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        <p style="font-size: 0.8rem; margin-top: 0.5rem; line-height: 1.5;">
            Only the restricted key, please. If yours starts with <code>sk_</code> that is your
            full secret key, which can move money — this won't accept it.
        </p>
    </div>

    <button type="button" id="btn-stripe-connect" class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Connect Stripe</button>
    `;
}

function renderBillingCard() {
    const onTrial = localStorage.getItem('ceo_sub_status') === 'trialing';

    return `
    <div class="card mb-6">
        <h3 class="mb-4" style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-black);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
            Billing
        </h3>
        <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 1.5rem; line-height: 1.6;">
            ${onTrial
                ? "You're on the free trial, so there's nothing to pay and nothing to cancel. Whenever you're ready, you can choose a plan here."
                : 'Update your card, change your billing address, download invoices or cancel — all handled on the secure Stripe page, so your card details never touch this app.'}
        </p>
        <button type="button" id="btn-manage-subscription" class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem;">
            ${onTrial ? 'Choose Your Plan' : 'Manage billing, invoices or cancel'}
        </button>
    </div>
    `;
}

// Login details. The email is shown but not editable here: changing the address
// on a Supabase account sends a confirmation to both the old and new inbox, and
// it also has to be changed on the Stripe customer or the webhook stops matching
// payments to the account. That is a job with a support conversation attached,
// not a text field.
function renderLoginCard() {
    return `
    <div class="card mb-6">
        <h3 class="mb-4" style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-black);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            Login details
        </h3>

        <div style="margin-bottom: 1.5rem;">
            <span style="display: block; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 0.25rem;">Email address</span>
            <span id="account-email" style="color: var(--color-black); font-weight: 500;">Loading…</span>
            <p style="color: var(--color-text-muted); font-size: 0.8rem; margin-top: 0.5rem; line-height: 1.5;">
                This is the address you sign in with, and the one your billing is matched
                to. To change it, email support so both can be moved together.
            </p>
        </div>

        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <button type="button" id="btn-change-password" class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Change password</button>
            <button type="button" id="btn-account-signout" class="btn btn-ghost">Sign out</button>
        </div>
    </div>
    `;
}

function renderDangerCard() {
    return `
    <div class="card" style="border: 1px solid #FEE4E2;">
        <h3 class="mb-2" style="color: #B42318;">Danger Zone</h3>
        <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 1rem;">Permanently deletes your plans, revenue log, reviews and profile — from this device and from our servers. This cannot be undone.</p>
        <button id="btn-reset-data" class="btn btn-outline" style="border-color: #FEE4E2; color: #B42318; background: #FEF3F2;">Erase All My Data</button>
    </div>
    `;
}

// The screenshot of Stripe's permissions table, shown on request from step 3.
// Lives at the site root beside logo.png and the icons, which is where every
// other image in this app already sits.
const PERMISSIONS_HELP_IMAGE = './stripe-key-permissions.png';

// Reveal the "See what this looks like" link only once the image genuinely
// loads. The alternative — rendering the link unconditionally — means a broken
// image icon on a screen whose entire job is to look trustworthy enough to be
// handed a credential. Drop the file in and the link appears by itself; leave it
// out and the card reads exactly as it did before.
function revealPermissionsHelp() {
    const link = document.getElementById('stripe-permissions-help');
    if (!link) return;

    const probe = new Image();
    probe.onload = () => {
        link.style.display = 'inline';
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showImageModal(
                PERMISSIONS_HELP_IMAGE,
                "Stripe's Create restricted API key page, with Charges and Refunds set to Read",
                'Set each of the five to Read in the first Permissions column. Everything else stays on None.'
            );
        });
    };
    probe.src = PERMISSIONS_HELP_IMAGE;
}

// A picture in a dialog. Structure, Escape handling, click-outside and focus
// return all mirror showConfirm() in toast.js, so every dialog in this app
// behaves the same way.
function showImageModal(src, alt, caption) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-card card" role="dialog" aria-modal="true" aria-label="${alt}" style="max-width: 720px; text-align: left;">
            <img src="${src}" alt="${alt}" style="width: 100%; height: auto; border: 1px solid var(--color-border); border-radius: var(--radius-sm);">
            <p class="confirm-message" style="margin-top: 1rem;"></p>
            <div class="confirm-actions">
                <button type="button" class="btn btn-primary confirm-ok">Close</button>
            </div>
        </div>
    `;
    overlay.querySelector('.confirm-message').textContent = caption;

    const previouslyFocused = document.activeElement;

    const close = () => {
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
    };

    const onKeydown = (e) => {
        if (e.key === 'Escape') close();
    };

    overlay.querySelector('.confirm-ok').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKeydown);

    document.body.appendChild(overlay);
    overlay.querySelector('.confirm-ok').focus();
}

// Paints the connection panel and wires its buttons. Re-entrant: every action
// re-paints, so there is one place that decides what the panel says.
async function paintStripeConnection() {
    const host = document.getElementById('stripe-connection-state');
    if (!host) return;

    const conn = await fetchStripeConnection();

    if (!conn) {
        host.innerHTML = connectFormHtml();
        revealPermissionsHelp();

        const input = document.getElementById('stripe-key-input');
        const button = document.getElementById('btn-stripe-connect');

        const submit = async () => {
            button.disabled = true;
            button.textContent = 'Checking with Stripe…';

            const err = await connectStripeKey(input.value);

            if (err) {
                button.disabled = false;
                button.textContent = 'Connect Stripe';
                showToast(err, 'error');
                input.focus();
                return;
            }

            // Clear the field before anything else. The key is not stored in the
            // browser at all, and leaving it sitting in a DOM node after it has
            // been accepted serves no purpose.
            input.value = '';
            showToast('Stripe connected. Import your sales whenever you are ready.', 'success');
            paintStripeConnection();
        };

        button.addEventListener('click', submit);
        // Enter submits. This is one field and one button; making someone reach
        // for the mouse after pasting would be gratuitous.
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            }
        });
        return;
    }

    const lastSynced = conn.last_synced_at
        ? new Date(conn.last_synced_at).toLocaleString()
        : 'not yet';

    // 'unknown' is what stripe-connect stores when a key can read charges but not
    // the account object — a perfectly usable key, so it connects anyway and this
    // simply doesn't name the account.
    const accountLine = conn.stripe_account_id && conn.stripe_account_id !== 'unknown'
        ? ` — account ${conn.stripe_account_id}`
        : '';
    const modeNote = conn.livemode === false
        ? ` <span style="color: #B54708;">(test mode key, so this will only ever import test payments)</span>`
        : '';

    host.innerHTML = `
        <p style="margin: 0 0 0.5rem 0;"><strong style="color: var(--color-black);">Stripe connected</strong>${accountLine}${modeNote}</p>
        <p style="margin: 0 0 1rem 0;">Last import: ${lastSynced}</p>
        ${conn.last_sync_error ? `<p style="margin: 0 0 1rem 0; color: #B42318;">Last attempt failed: ${conn.last_sync_error}</p>` : ''}
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <button type="button" id="btn-stripe-sync" class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Import sales now</button>
            <button type="button" id="btn-stripe-disconnect" class="btn btn-ghost">Disconnect</button>
        </div>
    `;

    document.getElementById('btn-stripe-sync').addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Importing…';
        const result = await syncStripeSales();
        if (result.error) {
            showToast(result.error, 'error');
        } else if (!result.imported) {
            showToast('Up to date, nothing new to import.', 'success');
        } else {
            const sales = `${result.imported} ${result.imported === 1 ? 'sale' : 'sales'}`;
            // `truncated` means we stopped at the page ceiling, not that Stripe
            // ran out. Saying so beats leaving someone to wonder why a long
            // history arrived in pieces.
            showToast(
                result.truncated
                    ? `Imported ${sales} so far. There are more to come — run it again to carry on.`
                    : `Imported ${sales} from Stripe.`,
                'success'
            );
        }
        paintStripeConnection();
    });

    document.getElementById('btn-stripe-disconnect').addEventListener('click', async () => {
        const confirmed = await showConfirm(
            'Your imported sales stay in your revenue history. This only stops new ones arriving.',
            { title: 'Disconnect Stripe?', confirmText: 'Disconnect' }
        );
        if (!confirmed) return;

        const err = await disconnectStripe();
        if (err) showToast(err, 'error');
        else showToast('Stripe disconnected.', 'success');
        paintStripeConnection();
    });
}

function accountAttachEvents() {
    paintStripeConnection();

    // Fill in the email from the live session rather than from the store, so it
    // is the address they actually sign in with and not a stale copy.
    window.db.auth.getSession().then(({ data }) => {
        const el = document.getElementById('account-email');
        if (!el) return;
        el.textContent = data?.session?.user?.email || 'Not available';
    }).catch(() => {
        const el = document.getElementById('account-email');
        if (el) el.textContent = 'Not available';
    });

    // Someone on the free trial has no Stripe record yet, so the customer portal
    // would be a dead end for them. Send them to the plan picker instead.
    const btnManageSub = document.getElementById('btn-manage-subscription');
    if (btnManageSub) {
        btnManageSub.addEventListener('click', () => {
            if (localStorage.getItem('ceo_sub_status') === 'trialing') {
                window.location.hash = '#/billing';
            } else {
                window.location.href = window.CEO_BILLING_PORTAL;
            }
        });
    }

    // Same flow as "forgot password" on the login screen: Supabase emails a link
    // rather than letting the page set a new password directly, so a walk-away
    // unlocked laptop can't be used to lock the owner out of her own account.
    const btnPassword = document.getElementById('btn-change-password');
    if (btnPassword) {
        btnPassword.addEventListener('click', async () => {
            const { data } = await window.db.auth.getSession();
            const email = data?.session?.user?.email;
            if (!email) {
                showToast('We could not read your account. Please sign out and back in, then try again.', 'error');
                return;
            }

            btnPassword.disabled = true;
            const original = btnPassword.textContent;
            btnPassword.textContent = 'Sending…';

            const { error } = await window.db.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + window.location.pathname + '#/reset-password'
            });

            btnPassword.disabled = false;
            btnPassword.textContent = original;

            if (error) {
                showToast(error.message, 'error');
            } else {
                showToast(`Check ${email} for a link to set a new password.`, 'success', 6000);
            }
        });
    }

    const btnSignout = document.getElementById('btn-account-signout');
    if (btnSignout) {
        btnSignout.addEventListener('click', () => signOutAndClear());
    }

    // Deletes the cloud row first, then the local copy. Clearing localStorage
    // alone left the user_data row sitting in Supabase while the user guide
    // promised permanent deletion — a UK GDPR erasure claim the app was not
    // actually honouring.
    const resetBtn = document.getElementById('btn-reset-data');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const confirmed = await showConfirm(
                "This permanently deletes your plans, revenue log and profile from this device and from our servers. It cannot be undone.",
                { title: 'Erase all your data?', confirmText: 'Erase everything', danger: true }
            );
            if (!confirmed) return;

            const originalText = resetBtn.textContent;
            resetBtn.disabled = true;
            resetBtn.textContent = 'Erasing…';

            try {
                const { data: sessionData } = await window.db.auth.getSession();
                const user = sessionData?.session?.user;
                if (user) {
                    const { error } = await window.db
                        .from('user_data')
                        .delete()
                        .eq('user_id', user.id);
                    if (error) throw error;
                }
            } catch (err) {
                // Do NOT clear locally if the cloud delete failed. Wiping the device
                // copy while the server copy survives would leave the data undeletable
                // by the user and make the erasure claim worse, not better.
                console.error('Cloud data deletion failed:', err);
                resetBtn.disabled = false;
                resetBtn.textContent = originalText;
                showToast("We couldn't delete your data from the server, so nothing has been erased. Please check your connection and try again. If it keeps failing, contact support.", 'error');
                return;
            }

            localStorage.removeItem('ceoPlanner_store');
            window.location.hash = '#/';
            // A full reload here on purpose: everything the app holds in memory is
            // now stale, and this is the one action where a clean boot is the point.
            window.location.reload();
        });
    }
}
