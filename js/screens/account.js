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
import { getStore, updateSettings, formatAmount } from '../store.js';
import { showToast, showConfirm, rerenderScreen } from '../components/toast.js';
import { PRO_FEATURES, PRO_FEATURE_KEYS, baseFeatures, getPlanTier, isProUser, isProTrial, trialTimeLeftPhrase, isFeatureLive, proBadge, planPricing, aiDailyAllowance, AI_DAILY_LIMITS, getAiAllowanceToday, fetchAiAllowance } from '../components/proGate.js';
import { fetchStripeConnection, connectStripeKey, disconnectStripe, syncStripeSales, canConnectStripe, STRIPE_KEY_PAGE } from '../stripeImport.js';
import { fetchPayPalConnection, connectPayPalApp, disconnectPayPal, syncPayPalSales, canConnectPayPal, PAYPAL_APP_PAGE } from '../paypalImport.js';
import { refreshImportedSales, countImportedFrom, getImportedSalesCache, importedProducts, unmatchedProducts } from '../importedSales.js';
import { escapeText } from '../liveAI.js';
import { openBillingPortal, canUpgradeToPro, watchForPlanChange } from '../stripePortal.js';

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
    ${renderAiUsageCard()}
    ${renderConnectionsCard()}
    ${renderProductMatchCard()}
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
    const remaining = trialTimeLeftPhrase();
    const hasPro = tier === 'pro';

    let heading;
    let sub;

    if (onTrial) {
        const dayText = remaining === null ? 'while your trial runs' : `for another ${remaining}`;
        heading = 'Free trial, running on Pro';
        sub = `You have the complete product ${dayText}, including every Pro feature as it lands. Nothing to pay and no card on file. When the trial finishes you'll pick a plan, and Base keeps everything in the first list below.`;
    } else if (hasPro) {
        heading = 'CEO Planner Pro';
        sub = 'You have everything. Thank you — genuinely.';
    } else {
        heading = 'CEO Planner, Base plan';
        sub = "Everything in the first list is yours. The second list is what Pro adds — click any line to read what it actually does.";
    }

    const baseRows = baseFeatures().map(f => `
        <div class="plan-feature-row"${f.id ? ` id="${f.id}"` : ''}>${TICK_SVG}<span>${f.text}</span></div>
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
        ${renderUpgradePanel()}
    </div>
    `;
}

// The upgrade route for someone already paying for Base.
//
// Until this shipped there wasn't one, and that was deliberate rather than
// forgotten: the only way to buy Pro was a Stripe payment link, and a customer
// with a live Base subscription who used one would have ended up paying for two
// subscriptions at once, every month, until somebody noticed. Dropping a link on
// this card was the obvious fix and the wrong one.
//
// It goes through the Stripe portal instead, which does the arithmetic properly
// — credit for the unused part of what they've already paid for, invoice for the
// difference — and, more to the point, shows them the figure before they agree
// to it. `canUpgradeToPro()` in stripePortal.js owns who sees this; it is
// deliberately false during the trial, because a trial user has paid nothing and
// so has nothing to prorate. They buy Pro outright through #/billing.
function renderUpgradePanel() {
    if (!canUpgradeToPro()) return '';

    const pro = planPricing('pro');
    const priceLine = pro
        ? `Pro is ${pro.monthly} a month, or ${pro.annual} a year.`
        : '';

    return `
    <div style="margin-top: 1.5rem; padding: 1.25rem; border: 1px solid var(--color-secondary); border-radius: 12px; background: rgba(255,255,255,0.5);">
        <p style="font-weight: 600; color: var(--color-black); margin: 0 0 0.5rem 0; font-size: 0.95rem;">
            Want the locked ones back?
        </p>
        <p style="color: var(--color-text-muted); font-size: 0.875rem; line-height: 1.6; margin: 0 0 1rem 0;">
            ${priceLine}
            You won't be charged a full month on top of what you've already paid —
            you only pay the difference for the rest of your current billing period,
            and Stripe shows you that exact amount before anything is taken.
            Everything you've logged stays exactly where it is.
        </p>
        <button type="button" id="btn-upgrade-pro" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 600;">
            Upgrade to Pro
        </button>
    </div>
    `;
}

// Opening the portal means a round trip to our function and then to Stripe, so
// the button has to say something in between. Restored only on failure: on
// success the browser is already leaving, and putting the old label back would
// flash "Manage billing" for an instant on a page that is on its way out.
async function portalOnClick(button, busyLabel, intent) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = busyLabel;

    const failed = await openBillingPortal(intent);

    if (failed) {
        button.disabled = false;
        button.textContent = original;
    }
}

// "We found N products — match them to your offers."
//
// The friction here is acceptable in a way per-sale friction never would be: the
// user names PRODUCTS, a handful of them, once. Sales never stop arriving;
// products barely change. So the cost does not grow with use.
//
// It appears on first import, disappears once every product has been decided
// about, and comes back on its own the day a new product shows up — because
// `unmatchedProducts()` asks the mapping, not a "have we shown this yet" flag.
// A flag would have to be reset by hand and would eventually be wrong.
//
// Deliberately a dropdown of the user's EXISTING offers rather than a free-text
// box. The entire point is that imported sales group with hand-logged ones, and
// free text invites "CEO planner" beside "CEO Planner" — two rows in every
// breakdown, for one offer, and no way to tell it has happened.
function renderProductMatchCard() {
    const store = getStore();
    const mapping = store.settings?.productOffers || {};
    const products = importedProducts(getImportedSalesCache());
    if (products.length === 0) return '';

    const offers = (store.revenue?.quickOffers || []).filter(o => o && String(o.name || '').trim());
    const pending = unmatchedProducts(getImportedSalesCache(), mapping);
    const currency = store.settings?.currency || '$';

    // No offers to map onto. Currently the state EVERY account is in — not one
    // of the 13 has a single quick offer saved — so this is the first thing most
    // people will see here, and it has to be a useful sentence rather than an
    // empty dropdown.
    if (offers.length === 0) {
        return `
        <div class="card mb-6">
            ${productMatchHeading(products.length)}
            <p style="color: var(--color-text-muted); font-size: 0.875rem; line-height: 1.6; margin-bottom: 1rem;">
                Right now they are filed under whatever your payment processor calls them,
                which is usually not what you call them. Set up your offers first and you can
                match them here, so your imported sales and the ones you log by hand add up
                together instead of sitting in separate rows.
            </p>
            <a href="#/revenue" class="btn btn-outline btn-sm" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">
                Set up my offers
            </a>
        </div>
        `;
    }

    const rows = products.map(p => {
        const chosen = mapping[p.key];
        const decided = typeof chosen === 'string';
        const options = offers.map(o =>
            `<option value="${escapeText(o.name)}" ${chosen === o.name ? 'selected' : ''}>${escapeText(o.name)}</option>`
        ).join('');

        return `
            <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;padding:0.75rem 0;border-bottom:1px solid var(--color-border);">
                <div style="flex:1 1 200px;min-width:0;">
                    <span style="font-weight:600;color:var(--color-black);display:block;overflow-wrap:anywhere;">${escapeText(p.label)}</span>
                    <span style="font-size:0.8rem;color:var(--color-text-muted);">
                        ${p.sourceLabel} • ${p.count} ${p.count === 1 ? 'sale' : 'sales'} • ${currency}${formatAmount(p.total)}
                    </span>
                </div>
                <select class="form-select product-offer-select" data-key="${escapeText(p.key)}" style="flex:0 1 220px;min-width:180px;">
                    <option value="" ${decided && chosen === '' ? 'selected' : ''}>Keep as is</option>
                    ${options}
                </select>
            </div>
        `;
    }).join('');

    const intro = pending.length === products.length
        ? `We found ${products.length} ${products.length === 1 ? 'product' : 'products'} in your imported sales. Match each one to an offer of yours and it will be counted under your name for it, in every breakdown and every report.`
        : (pending.length > 0
            ? `${pending.length} new ${pending.length === 1 ? 'product' : 'products'} since you last looked. Everything else is already matched.`
            : `All matched. Change any of these whenever you like — it applies to sales already imported, not just new ones.`);

    return `
    <div class="card mb-6">
        ${productMatchHeading(products.length)}
        <p style="color: var(--color-text-muted); font-size: 0.875rem; line-height: 1.6; margin-bottom: 0.5rem;">
            ${intro}
        </p>
        ${rows}
        <button type="button" id="btn-save-product-offers" class="btn btn-primary btn-sm" style="margin-top:1.25rem;font-weight:600;">
            Save matches
        </button>
        <p style="font-size:0.75rem;color:var(--color-text-muted);margin:0.75rem 0 0;line-height:1.5;">
            "Keep as is" leaves the processor's own name on it, and stops us asking again.
        </p>
    </div>
    `;
}

function productMatchHeading(count) {
    return `
        <h3 class="mb-2" style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-black);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
            What you sold
        </h3>
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
    const showStripe = canConnectStripe();
    const showPayPal = canConnectPayPal();
    if (!showStripe && !showPayPal) return '';

    // The promise is the same for both processors, so it is made once at the top
    // rather than repeated per section. "Read-only" is the load-bearing word and
    // it is true of both, though it is guaranteed differently: Stripe by the
    // shape of the key, PayPal by the permissions on the app. The per-processor
    // detail belongs in each section, not here.
    const intro = showStripe && showPayPal
        ? `Connect Stripe or PayPal and your sales are imported here automatically. Both connect
           <strong>read-only</strong>, so they can see payments but can never move money, issue a
           refund, or change anything in your account. Connect either, or both. You can disconnect
           at any time and your imported sales stay with you.`
        : showStripe
            ? `Connect Stripe and your sales are imported here automatically. You give this a
               <strong>read-only key</strong> that you create yourself, so it can see payments
               but can never move money, issue a refund, or change anything in your Stripe
               account. You can disconnect at any time and your imported sales stay with you.`
            : `Connect PayPal and your sales are imported here automatically. It connects
               <strong>read-only</strong>, so it can see payments but can never move money, issue a
               refund, or change anything in your PayPal account. You can disconnect at any time
               and your imported sales stay with you.`;

    // Each processor gets its own heading only when both are on screen. With one
    // connected the heading is noise; with two, an unlabelled pair of panels is
    // genuinely ambiguous once both say "connected".
    const sectionHeading = (label) => (showStripe && showPayPal)
        ? `<p style="font-weight: 600; color: var(--color-black); margin: 0 0 0.5rem 0;">${label}</p>`
        : '';

    const stripeSection = showStripe ? `
        <div style="margin-bottom: ${showPayPal ? '1.5rem' : '0'};">
            ${sectionHeading('Stripe')}
            <div id="stripe-connection-state" style="color: var(--color-text-muted); font-size: 0.875rem;">Checking…</div>
        </div>
    ` : '';

    const paypalSection = showPayPal ? `
        <div${showStripe ? ' style="border-top: 1px solid var(--color-border); padding-top: 1.25rem;"' : ''}>
            ${sectionHeading('PayPal')}
            <div id="paypal-connection-state" style="color: var(--color-text-muted); font-size: 0.875rem;">Checking…</div>
        </div>
    ` : '';

    return `
    <div class="card mb-6">
        <h3 class="mb-2" style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-black);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            Connected accounts
        </h3>
        <p style="color: var(--color-text-muted); font-size: 0.875rem; line-height: 1.6; margin-bottom: 1.25rem;">
            ${intro}
        </p>
        ${stripeSection}
        ${paypalSection}
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
        <li style="margin-bottom: 0.5rem;">Paste it below and press <strong style="color: var(--color-black);">Connect Stripe</strong>.</li>
        <li>
            Then press <strong style="color: var(--color-black);">Import sales now</strong>, which appears
            once you're connected. Connecting on its own doesn't bring anything in — that button is
            what fetches your history the first time.
        </li>
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

// AI usage. Its own card, in the same shape as Billing and Connected accounts,
// because "how much have I used today" is a thing you come here to look at —
// not a detail to be appended to a line in the plan list.
//
// This is still the ONLY place in the app that shows a running count. A counter
// on the dashboard would teach people to ration a tool they are paying to use,
// and most accounts never come near the limit. Here the reader has chosen to
// look.
function renderAiUsageCard() {
    // Rendered from whatever the browser already knows so the card is never
    // blank, then corrected by the server in attachEvents. Usually there is no
    // local reading yet, which is the whole reason the lookup exists.
    const known = getAiAllowanceToday();
    const quota = known && Number.isFinite(known.quota) ? known.quota : aiDailyAllowance();
    const showPro = !isProUser();

    return `
    <div class="card mb-6">
        <h3 class="mb-4" style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-black);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8L20 10.7l-4.9 3.6L16.4 20 12 16.8 7.6 20l1.3-5.7L4 10.7l6.1-1.9z"></path></svg>
            AI usage
        </h3>

        <!-- flex-wrap plus nowrap on the figure: at 375px the label was squeezing
             "96 of 120" onto two lines, breaking the number itself in half. The
             label drops below instead. -->
        <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
            <span id="ai-usage-figure" style="font-size: 2rem; font-weight: 700; color: var(--color-black); line-height: 1.1; white-space: nowrap;">— of ${quota}</span>
            <span style="color: var(--color-text-muted); font-size: 0.9rem;">requests used today</span>
        </div>

        <div class="progress-container" style="height: 6px; background: var(--color-bg-light); border-radius: var(--radius-full); overflow: hidden;">
            <div id="ai-usage-bar" class="progress-bar" style="height: 100%; width: 0%; background: var(--color-primary); transition: width var(--transition-fast);"></div>
        </div>

        <p id="ai-usage-note" style="color: var(--color-text-muted); font-size: 0.875rem; margin-top: 0.75rem; margin-bottom: 1.25rem;">
            Checking…
        </p>

        <p style="color: var(--color-text-muted); font-size: 0.8rem; line-height: 1.6; margin: 0;">
            A request is one message to your coach, one regenerated 90-day plan, one
            executive report, or one refreshed set of planning suggestions. Your
            allowance resets at midnight UTC.
        </p>

        ${showPro ? `
        <p style="font-size: 0.8rem; line-height: 1.6; margin: 0.75rem 0 0 0;">
            Pro comes with ${AI_DAILY_LIMITS.pro} requests a day.
            <a href="#/account" data-pro-feature="ai-allowance" style="color: var(--color-primary-dark); font-weight: 600;">See what's in Pro</a>
        </p>
        ` : ''}
    </div>
    `;
}

// Fill the card in once the server has answered. Kept separate from render so
// the same painting runs on load and on any later refresh.
function paintAiUsage(allowance) {
    const figure = document.getElementById('ai-usage-figure');
    const bar = document.getElementById('ai-usage-bar');
    const note = document.getElementById('ai-usage-note');
    if (!figure || !bar || !note) return;

    // The lookup failed. Say so plainly rather than showing a zero that would be
    // indistinguishable from "you have used nothing today".
    if (!allowance || !Number.isFinite(allowance.quota) || !Number.isFinite(allowance.used)) {
        figure.textContent = `— of ${aiDailyAllowance()}`;
        note.textContent = "Couldn't check today's usage just now. Your allowance is unaffected.";
        return;
    }

    const { used, quota } = allowance;
    const left = Math.max(0, quota - used);
    const percent = Math.min(100, Math.round((used / quota) * 100));

    figure.textContent = `${used} of ${quota}`;
    bar.style.width = `${percent}%`;

    // The same thresholds the warning uses, so the colour here and the toast
    // never disagree about whether somebody is running low.
    if (used >= quota) {
        bar.style.background = '#B42318';
        note.textContent = 'You have used today\'s allowance. It resets at midnight UTC.';
    } else if (percent >= 80) {
        bar.style.background = '#F2C21D';
        note.textContent = `${left} left today. Resets at midnight UTC.`;
    } else {
        bar.style.background = 'var(--color-primary)';
        note.textContent = `${left} left today. Resets at midnight UTC.`;
    }
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
                : 'Change your plan, update your card, change your billing address, download invoices or cancel — all handled on the secure Stripe page, so your card details never touch this app.'}
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
//
// The ?v= matters more than it looks. Anyone who opened this card in the window
// between the code shipping and the image being uploaded has a **cached 404** for
// this exact URL, and GitHub Pages sends max-age=600 on 404s just as it does on
// hits — so their browser will keep serving that 404 from cache and the picture
// stays broken long after the file is live. A new query string is a new cache
// entry, which sidesteps every stale copy at once. **Bump it whenever the
// screenshot is replaced.**
const PERMISSIONS_HELP_IMAGE = './stripe-key-permissions.png?v=1';
const PAYPAL_CREATE_APP_IMAGE = './paypal-create-app.png?v=1';
const PAYPAL_SEARCH_HELP_IMAGE = './paypal-transaction-search.png?v=1';

// Reveal a "See what this looks like" link only once its image genuinely loads.
//
// The alternative — rendering the link unconditionally — means a broken image
// icon on a screen whose entire job is to look trustworthy enough to be handed a
// credential. Drop the file in and the link appears by itself; leave it out and
// the card reads exactly as it did before.
//
// One helper for all three screenshots rather than one function each. The Stripe
// version was written first and copied for PayPal's two, which is how three
// copies of the same probe-then-bind logic would have drifted apart.
function revealImageHelp(linkId, src, alt, caption) {
    const link = document.getElementById(linkId);
    if (!link) return;

    const probe = new Image();
    probe.onload = () => {
        link.style.display = 'inline';
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showImageModal(src, alt, caption);
        });
    };
    probe.src = src;
}

function revealPermissionsHelp() {
    revealImageHelp(
        'stripe-permissions-help',
        PERMISSIONS_HELP_IMAGE,
        "Stripe's Create restricted API key page, with Charges and Refunds set to Read",
        'Set each of the five to Read in the first Permissions column. Everything else stays on None.'
    );
}

// PayPal needs two, because its setup has two places you can go wrong: naming
// the app on a dialog that looks like a dead end, and finding one checkbox in a
// long list of features that mostly do not apply to you.
function revealPayPalHelp() {
    revealImageHelp(
        'paypal-create-app-help',
        PAYPAL_CREATE_APP_IMAGE,
        "PayPal's Create App dialog with the app name filled in",
        'Just the name and the Create App button. Nothing else to choose at this stage.'
    );
    revealImageHelp(
        'paypal-search-help',
        PAYPAL_SEARCH_HELP_IMAGE,
        "PayPal's app features list with Transaction search ticked",
        'Transaction search is under Add-on services on the right. That one tick is all this needs — leave everything else exactly as you find it.'
    );
}

// A picture in a dialog. Structure, Escape handling, click-outside and focus
// return all mirror showConfirm() in toast.js, so every dialog in this app
// behaves the same way.
function showImageModal(src, alt, caption) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-card card" role="dialog" aria-modal="true" aria-label="${alt}" style="max-width: 720px; text-align: left;">
            <img src="${src}" alt="" style="width: 100%; height: auto; border: 1px solid var(--color-border); border-radius: var(--radius-sm);">
            <p class="image-modal-fallback" style="display: none; margin: 0; color: var(--color-text-muted); font-size: 0.875rem; line-height: 1.6;"></p>
            <p class="confirm-message" style="margin-top: 1rem;"></p>
            <div class="confirm-actions">
                <button type="button" class="btn btn-primary confirm-ok">Close</button>
            </div>
        </div>
    `;
    overlay.querySelector('.confirm-message').textContent = caption;

    // Never show a broken image. The link is only revealed after the picture has
    // loaded once, but "loaded once" and "loads again now" are not the same
    // thing: a cached 404 from before the file was uploaded, a CDN edge that
    // hasn't caught up, or a dropped connection will all put a broken-image icon
    // on the screen whose entire job is to look trustworthy enough to be handed
    // a credential. If it fails, the words do the work instead.
    //
    // Note the img carries alt="" rather than the description — a broken image
    // with alt text renders the text beside a torn-page icon, which looks like
    // the fault it is. The dialog keeps its aria-label, so screen readers are
    // unaffected.
    const img = overlay.querySelector('img');
    const fallback = overlay.querySelector('.image-modal-fallback');
    img.addEventListener('error', () => {
        img.style.display = 'none';
        fallback.textContent = alt + ". The picture could not be loaded just now, but the written steps behind this dialog are complete on their own.";
        fallback.style.display = 'block';
    });

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

    const { state, conn } = await fetchStripeConnection();

    // Couldn't find out. Never show the connect form here: telling someone to
    // paste a new key because a request failed is how a working connection gets
    // replaced for no reason.
    if (state === 'unknown') {
        host.innerHTML = `
            <p style="margin: 0 0 0.75rem 0;">Couldn't check your Stripe connection just now. Nothing has been lost.</p>
            <button type="button" id="btn-stripe-recheck" class="btn btn-outline btn-sm" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Try again</button>
        `;
        document.getElementById('btn-stripe-recheck')?.addEventListener('click', () => {
            host.innerHTML = 'Checking…';
            paintStripeConnection();
        });
        return;
    }

    if (state === 'none') {
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

    // How many sales are actually here. A toast saying "imported 8 sales" is gone
    // in three and a half seconds, and if you happened to be looking elsewhere the
    // screen afterwards looks identical to the screen before. This is the same
    // information, written down and still there tomorrow.
    //
    // Counted per processor, not from the length of the whole cache. With both
    // Stripe and PayPal connected the cache holds everything, so quoting its
    // length here would have each panel claiming the other's sales as its own.
    await refreshImportedSales();
    const stripeCount = countImportedFrom('stripe');
    const importedSummary = stripeCount
        ? ` — <strong style="color: var(--color-black);">${stripeCount} ${stripeCount === 1 ? 'sale' : 'sales'}</strong> imported, showing on your Revenue screen`
        : '';

    // 'unknown' is what stripe-connect stores when a key can read charges but not
    // the account object — a perfectly usable key, so it connects anyway and this
    // simply doesn't name the account.
    const accountLine = conn.stripe_account_id && conn.stripe_account_id !== 'unknown'
        ? ` — account ${conn.stripe_account_id}`
        : '';
    const modeNote = conn.livemode === false
        ? ` <span style="color: #B54708;">(test mode key, so this will only ever import test payments)</span>`
        : '';

    // Connecting imports nothing on its own, which is not obvious: the card says
    // "connected", so the job looks finished. Until the first import has run this
    // spells out the remaining step, rather than leaving it to a toast that has
    // already disappeared by the time anyone goes looking for what changed.
    const neverImported = !conn.last_synced_at;
    const nextStep = neverImported
        ? `<div style="background: var(--color-primary-light); border-left: 3px solid var(--color-primary); border-radius: 6px; padding: 0.75rem 0.875rem; margin: 0 0 1rem 0; color: var(--color-text-main); line-height: 1.5;">
               <strong style="color: var(--color-black);">One more step.</strong>
               Connecting doesn't bring your sales in by itself. Press
               <strong style="color: var(--color-black);">Import sales now</strong> to fetch your history.
           </div>`
        : '';

    host.innerHTML = `
        <p style="margin: 0 0 0.5rem 0;"><strong style="color: var(--color-black);">Stripe connected</strong>${accountLine}${modeNote}</p>
        <p style="margin: 0 0 1rem 0;">Last import: ${lastSynced}${importedSummary}</p>
        ${nextStep}
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

// The PayPal paste-your-credentials form.
//
// Written out step by step for the same reason the Stripe one is: this is the
// hardest thing the app ever asks anyone to do, it happens once, and it happens
// at the exact moment someone is deciding whether the import is worth the
// bother. PayPal is arguably harder than Stripe, for two reasons worth knowing
// before editing this copy:
//
//   1. THE DEVELOPER DASHBOARD IS NOT THE PAYPAL YOU KNOW. It is a different
//      site with a different login, and it looks nothing like the account page
//      where you check your balance. Someone who has used PayPal for ten years
//      has probably never seen it. Saying so up front stops the "am I in the
//      right place?" bounce.
//   2. THE NINE HOUR DELAY IS REAL AND IT LOOKS LIKE A BUG. PayPal caches
//      issued tokens, so ticking Transaction Search on an app that has been
//      used before can take up to nine hours to take effect. Someone who ticks
//      the box and connects immediately gets an error about a permission they
//      can see is enabled. paypal-connect explains it when it happens; this
//      warns before, so a fresh app is created rather than an existing one
//      edited.
//
// Two fields rather than one, because PayPal's credential is a pair and neither
// half works alone.
function paypalConnectFormHtml() {
    return `
    <ol style="margin: 0 0 1.25rem 0; padding-left: 1.25rem; line-height: 1.7; color: var(--color-text-muted);">
        <li style="margin-bottom: 0.5rem;">
            Open <a href="${PAYPAL_APP_PAGE}" target="_blank" rel="noopener noreferrer" style="color: var(--color-primary-dark); font-weight: 600;">PayPal's developer dashboard</a>.
            This is a separate PayPal site to the one you normally use and it may ask you to
            sign in again. Make sure you are on the <strong style="color: var(--color-black);">Live</strong>
            tab, not Sandbox.
        </li>
        <li style="margin-bottom: 0.5rem;">
            Press <strong style="color: var(--color-black);">Create App</strong> and name it
            <strong style="color: var(--color-black);">CEO Planner</strong>, so you can recognise it later.
            Make a new one rather than reusing an existing app — see the note in step 3.
            <a href="#" id="paypal-create-app-help" style="display: none; margin-left: 0.25rem; color: var(--color-primary-dark); font-weight: 600;">See what this looks like</a>
        </li>
        <li style="margin-bottom: 0.5rem;">
            In the app's <strong style="color: var(--color-black);">Features</strong> list, tick
            <strong style="color: var(--color-black);">Transaction Search</strong> and save. That is
            the only permission this needs — it lets us read your payment history and nothing else.
            <em>If you edit an app you have used before, PayPal can take up to 9 hours to apply a
            newly ticked permission, which is why a brand new app is easier.</em>
            <a href="#" id="paypal-search-help" style="display: none; margin-left: 0.25rem; color: var(--color-primary-dark); font-weight: 600;">See what this looks like</a>
        </li>
        <li style="margin-bottom: 0.5rem;">
            Copy the <strong style="color: var(--color-black);">Client ID</strong> and the
            <strong style="color: var(--color-black);">Secret</strong>. You will need to press
            <strong style="color: var(--color-black);">Show</strong> to see the secret.
        </li>
        <li style="margin-bottom: 0.5rem;">Paste them both below and press <strong style="color: var(--color-black);">Connect PayPal</strong>.</li>
        <li>
            Then press <strong style="color: var(--color-black);">Import sales now</strong>, which appears
            once you're connected. Connecting on its own doesn't bring anything in — that button is
            what fetches your history the first time.
        </li>
    </ol>

    <div class="form-group mb-3">
        <label class="form-label" for="paypal-client-id-input" style="font-weight: 600;">Client ID</label>
        <input type="text" id="paypal-client-id-input" class="form-input" placeholder="A…"
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
    </div>

    <div class="form-group mb-3">
        <label class="form-label" for="paypal-secret-input" style="font-weight: 600;">Secret</label>
        <input type="password" id="paypal-secret-input" class="form-input" placeholder="E…"
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        <p style="font-size: 0.8rem; margin-top: 0.5rem; line-height: 1.5;">
            The secret is stored securely and is never shown back to you or sent to your browser again.
        </p>
    </div>

    <button type="button" id="btn-paypal-connect" class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Connect PayPal</button>
    `;
}

// Paints the PayPal panel and wires its buttons. Re-entrant: every action
// re-paints, so there is one place that decides what the panel says. The twin of
// paintStripeConnection().
async function paintPayPalConnection() {
    const host = document.getElementById('paypal-connection-state');
    if (!host) return;

    const { state, conn } = await fetchPayPalConnection();

    // Couldn't find out. Never show the connect form here: telling someone to
    // paste new credentials because a request failed is how a working connection
    // gets replaced for no reason.
    if (state === 'unknown') {
        host.innerHTML = `
            <p style="margin: 0 0 0.75rem 0;">Couldn't check your PayPal connection just now. Nothing has been lost.</p>
            <button type="button" id="btn-paypal-recheck" class="btn btn-outline btn-sm" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Try again</button>
        `;
        document.getElementById('btn-paypal-recheck')?.addEventListener('click', () => {
            host.innerHTML = 'Checking…';
            paintPayPalConnection();
        });
        return;
    }

    if (state === 'none') {
        host.innerHTML = paypalConnectFormHtml();
        revealPayPalHelp();

        const idInput = document.getElementById('paypal-client-id-input');
        const secretInput = document.getElementById('paypal-secret-input');
        const button = document.getElementById('btn-paypal-connect');

        const submit = async () => {
            button.disabled = true;
            button.textContent = 'Checking with PayPal…';

            const err = await connectPayPalApp(idInput.value, secretInput.value);

            if (err) {
                button.disabled = false;
                button.textContent = 'Connect PayPal';
                showToast(err, 'error');
                return;
            }

            // Clear both fields before anything else. Neither half is stored in
            // the browser, and leaving the secret sitting in a DOM node after it
            // has been accepted serves no purpose.
            idInput.value = '';
            secretInput.value = '';
            showToast('PayPal connected. Import your sales whenever you are ready.', 'success');
            paintPayPalConnection();
        };

        button.addEventListener('click', submit);
        // Enter submits from either field. Two fields and one button; making
        // someone reach for the mouse after pasting would be gratuitous.
        [idInput, secretInput].forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                }
            });
        });
        return;
    }

    const lastSynced = conn.last_synced_at
        ? new Date(conn.last_synced_at).toLocaleString()
        : 'not yet';

    // Counted per processor — see the note in paintStripeConnection().
    await refreshImportedSales();
    const paypalCount = countImportedFrom('paypal');
    const importedSummary = paypalCount
        ? ` — <strong style="color: var(--color-black);">${paypalCount} ${paypalCount === 1 ? 'sale' : 'sales'}</strong> imported, showing on your Revenue screen`
        : '';

    // 'unknown' is what paypal-connect stores when the app is valid but the
    // account had no transactions in the last month to read the number off — a
    // perfectly usable connection, so it connects anyway and this simply doesn't
    // name the account.
    const accountLine = conn.paypal_account_id && conn.paypal_account_id !== 'unknown'
        ? ` — account ${conn.paypal_account_id}`
        : '';
    const modeNote = conn.livemode === false
        ? ` <span style="color: #B54708;">(sandbox app, so this will only ever import test payments)</span>`
        : '';

    // Said out loud rather than assumed, because PayPal cannot promise it the
    // way Stripe can. A restricted Stripe key is read-only by construction; a
    // PayPal app is read-only only if its Features list says so, and the user is
    // the one who ticked those boxes. If their app can also take payments they
    // are entitled to know that the credential they handed over can do it.
    const scopeNote = conn.read_only === false
        ? `<p style="margin: 0 0 1rem 0; color: #B54708; line-height: 1.5;">
               This app has more than read-only access to your PayPal account. The import only ever
               reads, but if you would rather the credential could do nothing else, create a new app
               with only <strong>Transaction Search</strong> ticked and reconnect.
           </p>`
        : '';

    // Connecting imports nothing on its own, which is not obvious: the card says
    // "connected", so the job looks finished. Until the first import has run this
    // spells out the remaining step, rather than leaving it to a toast that has
    // already disappeared by the time anyone goes looking for what changed.
    const neverImported = !conn.last_synced_at;
    const nextStep = neverImported
        ? `<div style="background: var(--color-primary-light); border-left: 3px solid var(--color-primary); border-radius: 6px; padding: 0.75rem 0.875rem; margin: 0 0 1rem 0; color: var(--color-text-main); line-height: 1.5;">
               <strong style="color: var(--color-black);">One more step.</strong>
               Connecting doesn't bring your sales in by itself. Press
               <strong style="color: var(--color-black);">Import sales now</strong> to fetch your history.
           </div>`
        : '';

    host.innerHTML = `
        <p style="margin: 0 0 0.5rem 0;"><strong style="color: var(--color-black);">PayPal connected</strong>${accountLine}${modeNote}</p>
        <p style="margin: 0 0 1rem 0;">Last import: ${lastSynced}${importedSummary}</p>
        ${nextStep}
        ${scopeNote}
        ${conn.last_sync_error ? `<p style="margin: 0 0 1rem 0; color: #B42318;">Last attempt failed: ${conn.last_sync_error}</p>` : ''}
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <button type="button" id="btn-paypal-sync" class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Import sales now</button>
            <button type="button" id="btn-paypal-disconnect" class="btn btn-ghost">Disconnect</button>
        </div>
    `;

    document.getElementById('btn-paypal-sync').addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Importing…';
        const result = await syncPayPalSales();
        if (result.error) {
            showToast(result.error, 'error');
        } else if (!result.imported) {
            showToast('Up to date, nothing new to import.', 'success');
        } else {
            const sales = `${result.imported} ${result.imported === 1 ? 'sale' : 'sales'}`;
            // `truncated` means we stopped at a ceiling, not that PayPal ran out.
            // Saying so beats leaving someone to wonder why a long history
            // arrived in pieces.
            showToast(
                result.truncated
                    ? `Imported ${sales} so far. There are more to come — run it again to carry on.`
                    : `Imported ${sales} from PayPal.`,
                'success'
            );
        }
        paintPayPalConnection();
    });

    document.getElementById('btn-paypal-disconnect').addEventListener('click', async () => {
        const confirmed = await showConfirm(
            'Your imported sales stay in your revenue history. This only stops new ones arriving.',
            { title: 'Disconnect PayPal?', confirmText: 'Disconnect' }
        );
        if (!confirmed) return;

        const err = await disconnectPayPal();
        if (err) showToast(err, 'error');
        else showToast('PayPal disconnected.', 'success');
        paintPayPalConnection();
    });
}

function accountAttachEvents() {
    // "What you sold" is built from the imported-sales cache, and on a cold load
    // straight to #/account that cache is empty — so the card would be invisible
    // exactly when it matters most, right after someone connects a processor and
    // lands back here.
    //
    // The two paints below refresh the cache too, but they only repaint their own
    // panel, so they would fill the cache without ever showing this card. Same
    // re-render guard as the Revenue and Settings screens: only repaint when the
    // count actually changed, or rerenderScreen would loop through attachEvents.
    const importedCountAtRender = getImportedSalesCache().length;
    refreshImportedSales().then(sales => {
        if (sales.length !== importedCountAtRender) rerenderScreen();
    }).catch(() => { /* the rest of the screen works without it */ });

    paintStripeConnection();
    // Each paint is independent and each no-ops when its panel isn't on screen,
    // so an account with only one processor visible costs only that one lookup.
    paintPayPalConnection();

    // Fill in the AI usage card from the server. This is the only way the page
    // can know: the figures otherwise ride back on AI calls, and Account is the
    // one screen you open *without* making one.
    //
    // The quota shown comes from the server rather than AI_DAILY_LIMITS, so the
    // number on screen is the one that will actually be enforced even if the two
    // copies of the limits ever drift.
    fetchAiAllowance().then(paintAiUsage);

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

    // Just back from Stripe. Waits for the new plan to reach the app rather than
    // leaving somebody who has this minute upgraded looking at a Base screen.
    watchForPlanChange();

    // Someone on the free trial has no Stripe record yet, so the customer portal
    // would be a dead end for them. Send them to the plan picker instead.
    const btnManageSub = document.getElementById('btn-manage-subscription');
    if (btnManageSub) {
        btnManageSub.addEventListener('click', () => {
            if (localStorage.getItem('ceo_sub_status') === 'trialing') {
                window.location.hash = '#/billing';
                return;
            }
            portalOnClick(btnManageSub, 'Opening…');
        });
    }

    const btnUpgrade = document.getElementById('btn-upgrade-pro');
    if (btnUpgrade) {
        btnUpgrade.addEventListener('click', () => portalOnClick(btnUpgrade, 'Opening…', 'upgrade'));
    }

    // Saving every dropdown at once, including the ones left on "Keep as is".
    //
    // That is the point of the button: pressing it is the user saying "I have
    // looked at this list", which is what stops the card asking again. Saving
    // each select on change instead would leave anything untouched looking
    // undecided forever, and the card would never go away.
    const btnSaveOffers = document.getElementById('btn-save-product-offers');
    if (btnSaveOffers) {
        btnSaveOffers.addEventListener('click', () => {
            const selects = Array.from(document.querySelectorAll('.product-offer-select'));
            if (!selects.length) return;

            // Merged onto what is already stored, not replacing it. A product
            // that stops appearing in the imported sales — an offer retired last
            // year, or a row that fell outside the import window — is not on
            // screen to be re-selected, and rebuilding the map from the visible
            // rows alone would quietly forget it.
            const productOffers = { ...(getStore().settings?.productOffers || {}) };
            selects.forEach(sel => {
                const key = sel.dataset.key;
                if (key) productOffers[key] = sel.value;
            });

            updateSettings({ productOffers });
            showToast('Saved. Your imported sales now count under your own offer names.', 'success');
            rerenderScreen();
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
