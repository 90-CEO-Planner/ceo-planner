// proGate.js
//
// One place that answers "can this account use Pro?" and one place that says no.
//
// The design rule for Phase 2: base-tier users SEE every Pro feature where they
// would naturally use it, rather than having it hidden. Clicking a locked control
// opens an explanatory modal. Nothing is sold here yet — there is no Pro price in
// Stripe, so a checkout button would be selling something that doesn't exist.
// When Pro ships, set window.CEO_CHECKOUT_PRO in supabaseClient.js and the
// modal grows a real upgrade button on its own.
//
// The client is for presentation only. Every Pro feature that costs money must
// also be enforced server side — the edge functions are the real gate.

// Every Pro feature, in the order they appear in UPGRADE_PLAN.md Phase 2.
// `title` is what the modal is headed with, `blurb` is the honest description of
// what it does. Keep the tone the same as the rest of the app: plain, warm, no
// "unlock your potential" language.
//
// `shipped` is the honesty switch. The 14-day trial runs on Pro, so without it
// the plan list would show a trial user nine ticks for features that do not
// exist yet — the app telling her she has things she cannot use. While it is
// false the feature reads as "in build" for Pro and trial accounts and as a
// lock for base. **Flip it to true in the same session the feature ships**, and
// the plan list, the modal copy and the nav pill all correct themselves.
export const PRO_FEATURES = {
    'payment-import': {
        // Shipped 16 Aug 2026, once the revenue merge landed and eight real sales
        // were confirmed importing and displaying on the live site. Until then the
        // import worked but nothing read the results back, so the feature existed
        // everywhere except the screen it was for.
        shipped: true,
        title: 'Sales that log themselves',
        // Stripe and PayPal used to be named as though both existed. Only Stripe
        // is being built, so PayPal sits in brackets as a promise about later
        // rather than a claim about today. Delete the bracket when it ships.
        blurb: 'Connect Stripe once and every sale appears here on its own, at the moment it happens. No manual entry, no forgotten Tuesday, and every rate on this page becomes something you can actually trust. (PayPal coming soon)'
    },
    'lead-pipeline': {
        // Shipped 16 Aug 2026. Lives on its own screen at #/pipeline, with the
        // nav link rendered only for accounts that have it.
        shipped: true,
        title: 'A real lead pipeline',
        blurb: 'Named contacts instead of a running count. Move each one through lead, call booked, proposal sent, won or lost, set a follow-up date, and see at a glance who has gone quiet on you.'
    },
    'history': {
        // Shipped 16 Aug 2026. Lives at #/history, reached from Wins & Progress
        // — where the teaser for it used to sit — and from the Quarter Reset
        // screen, which is the moment history gets made.
        shipped: true,
        title: 'Your year, quarter by quarter',
        blurb: 'Every quarter you finish is archived rather than cleared. This is where you see them side by side, so you can tell whether this quarter is genuinely better than the last one or it just feels that way.'
    },
    'live-ai': {
        // Shipped 17 Aug 2026. All four keyword engines now have a live half:
        // the planning assistant, the Daily 3 breakdown, the Quiet Advisor
        // pulses and the CEO vs Busy Work filter. The keyword versions stay as
        // the base tier and as the fallback — see js/liveAI.js.
        shipped: true,
        title: 'Planning that thinks about your business',
        blurb: 'The suggestions here are currently pattern rules, which is why they can feel a little generic. Pro sends your actual numbers, offer and stage to the coach, so what comes back is written about your business rather than about businesses in general.'
    },
    'ai-allowance': {
        // Real today — the limits have existed since batch 1.1 and became
        // per-tier with Pro item 4. Nothing to build, so it ships as true.
        shipped: true,
        title: 'More AI to work with',
        blurb: 'Every plan includes the coach. Base is 120 requests a day, Pro is 300. It matters more on Pro than it sounds: Pro also writes your planning suggestions and your Daily 3 with the coach, so the bigger allowance is what keeps that going all day instead of stopping by lunchtime.'
    },
    'coach-memory': {
        shipped: false,
        title: 'A coach that remembers',
        blurb: 'Right now the conversation resets every time you refresh the page. With Pro your coach keeps the thread, so you can pick up on Thursday where you left off on Monday without explaining yourself again.'
    },
    'week-regen': {
        shipped: false,
        title: 'Rebuild one week, keep the rest',
        blurb: 'Something changed in week five and the plan needs to bend. Regenerate that single week instead of the whole quarter, and leave everything you have already done exactly as it is.'
    },
    'email-digest': {
        shipped: false,
        title: 'Your week, in your inbox',
        blurb: 'A short Monday summary of where you are against target, what moved last week and what you said you would do next. It arrives whether or not the app is open, which is the part browser reminders can never do.'
    },
    'pdf-export': {
        shipped: false,
        title: 'A report worth sending',
        blurb: 'Your executive report laid out properly with your logo, your numbers and your charts, ready to save as a PDF. For an accountant, a business partner, or the version of you who wants proof of the last ninety days.'
    },
    'unlimited-offers': {
        shipped: false,
        title: 'More than three quick offers',
        blurb: 'The quick-log buttons are capped at three offers on the base plan. Pro lifts the cap, which matters once you are selling a few different things and the one you sold today is never one of the three.'
    },
    // Used by the nav pill and anywhere we want to describe Pro as a whole
    'overview': {
        title: 'What Pro adds',
        blurb: 'Pro is being built now. Here is what is coming:',
        list: [
            'Sales imported automatically from Stripe (PayPal coming soon)',
            'A named lead pipeline with follow-up dates',
            'Quarter-over-quarter history and a year view',
            'AI planning written from your real numbers',
            '300 AI requests a day instead of 120',
            'A coach that remembers your conversations',
            'Weekly digest by email',
            'Branded PDF reports',
            'Unlimited quick offers'
        ]
    }
};

// The nine Pro features in plan-list order. `overview` is deliberately absent —
// it is the "all of Pro" description used by the nav, not a feature.
export const PRO_FEATURE_KEYS = [
    'payment-import',
    'lead-pipeline',
    'history',
    'live-ai',
    // Sits directly under live-ai on purpose: it is the reason the allowance
    // matters. Read on its own it is a number; read after "planning written by
    // the coach" it is the thing that keeps that working.
    'ai-allowance',
    'coach-memory',
    'week-regen',
    'email-digest',
    'pdf-export',
    'unlimited-offers'
];

// Has this feature actually been built yet?
export function isFeatureLive(featureKey) {
    return PRO_FEATURES[featureKey] ? PRO_FEATURES[featureKey].shipped === true : false;
}

// True once any Pro feature exists. Until then "Pro" is a plan on paper, so the
// nav says "Free trial" rather than "Pro trial" — naming the tier only helps if
// there is something behind the name.
export function anyProFeatureLive() {
    return PRO_FEATURE_KEYS.some(isFeatureLive);
}

// The plan the account is actually on: 'base' or 'pro'.
//
// A trial deliberately resolves to 'pro'. The 14 free days run on the full
// product, because nobody upgrades to a tier they have never seen — and a
// locked feature reads very differently once you have used it. The trial's AI
// allowance stays at the trial rate regardless (see consume_ai_quota), so this
// grants Pro features, not Pro spend.
export function getPlanTier() {
    const cached = localStorage.getItem('ceo_plan_tier');
    if (cached === 'base' || cached === 'pro') return cached;

    // First load after signup, before refreshAccessState has answered. Fall back
    // to the subscription status rather than flashing locks at a trial user.
    return localStorage.getItem('ceo_sub_status') === 'trialing' ? 'pro' : 'base';
}

export function isProUser() {
    return getPlanTier() === 'pro';
}

// How many AI requests a day each plan gets.
//
// ⚠️ These MUST match the defaults in `consume_ai_quota` (supabase/setup.sql
// and migration 20260816_ai_quota_pro_tier.sql). The server is what actually
// enforces them; this copy exists only so the app can say the number out loud
// on the plan card. **Change one and you must change the other**, or the app
// will promise an allowance the database does not honour.
export const AI_DAILY_LIMITS = { trial: 30, base: 120, pro: 300 };

// What THIS account gets per day.
//
// Written as the real number for the person reading it rather than as a
// headline. A trial resolves to the Pro feature set but deliberately keeps the
// trial rate, so quoting the Pro figure to a trial user would be a promise the
// server refuses at request 31.
export function aiDailyAllowance() {
    if (localStorage.getItem('ceo_sub_status') === 'trialing') return AI_DAILY_LIMITS.trial;
    return isProUser() ? AI_DAILY_LIMITS.pro : AI_DAILY_LIMITS.base;
}

// --- Where today's allowance actually stands ---------------------------------
//
// The chat function reports `used` and `quota` on every successful call, so the
// app knows where it stands without asking. No polling, no extra endpoint: the
// numbers arrive as a side effect of work already being done.
//
// Keyed on the **UTC** date because that is what the server counter resets on.
// Using the local date would show a stale figure, or a fresh one that isn't,
// for anybody outside GMT — and being wrong about a limit is worse than being
// silent about it.
const ALLOWANCE_KEY = 'ceo_ai_allowance';
const ALLOWANCE_WARNED_KEY = 'ceo_ai_allowance_warned';

// Warn once the day is 80% spent. Early enough to change plans, late enough
// that it isn't nagging somebody who was never going to run out.
const ALLOWANCE_WARN_AT = 0.8;

function utcDay() {
    return new Date().toISOString().slice(0, 10);
}

export function recordAiAllowance(allowance) {
    if (!allowance || !Number.isFinite(allowance.quota) || allowance.quota <= 0) return;
    try {
        localStorage.setItem(ALLOWANCE_KEY, JSON.stringify({
            day: utcDay(),
            used: allowance.used,
            quota: allowance.quota
        }));
    } catch (err) {
        // Storage full. The warning simply won't fire; nothing else breaks.
    }
}

// Today's figures, or null when nothing has been recorded today. Null is a real
// answer and must not be shown as "0 used" — it means "we haven't asked yet",
// which is different, and on the Account card it reads very differently.
export function getAiAllowanceToday() {
    try {
        const raw = JSON.parse(localStorage.getItem(ALLOWANCE_KEY) || 'null');
        if (!raw || raw.day !== utcDay()) return null;
        return { used: raw.used, quota: raw.quota };
    } catch (err) {
        return null;
    }
}

// Ask the server where today's allowance stands, without spending one.
//
// The warning is fed by the numbers that ride back on every AI call, which is
// perfect for warning — you are always mid-request when you approach a limit —
// and useless for the Account page, which is the one screen you open *without*
// making a call. It showed the allowance and no usage until something else
// happened to spend one.
//
// `get_ai_quota_status()` takes no parameter and resolves auth.uid() itself,
// which is why the browser is allowed to call it at all. Returns null on any
// failure: this decorates a line of text and must never break the screen.
export async function fetchAiAllowance() {
    try {
        const { data, error } = await window.db.rpc('get_ai_quota_status');
        if (error) {
            console.warn('Could not read AI allowance:', error.message);
            return null;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row || !Number.isFinite(row.quota)) return null;
        recordAiAllowance(row);
        return row;
    } catch (err) {
        console.warn('Could not read AI allowance:', err.message);
        return null;
    }
}

// Forget today's figures. Called wherever the account changes on this browser —
// sign-out, login, signup — because a usage count belongs to one person. NOT
// called on quarter reset: this is a daily counter and has nothing to do with
// which 90 days you are in.
export function clearAiAllowance() {
    try {
        localStorage.removeItem(ALLOWANCE_KEY);
        localStorage.removeItem(ALLOWANCE_WARNED_KEY);
    } catch (err) {
        /* nothing worth reporting */
    }
}

// Say something once a day, when they are close and it is still useful to know.
//
// Only ever called for requests the user actually made. The live planning
// surfaces spend quota on page load, and a toast appearing unprompted to say
// "you have used 80% of your AI" would alarm somebody who has not done
// anything — see the `background` flag in invokeChat.
export function warnIfAllowanceLow(allowance) {
    if (!allowance || !Number.isFinite(allowance.quota) || allowance.quota <= 0) return;
    if (allowance.used / allowance.quota < ALLOWANCE_WARN_AT) return;
    if (allowance.used >= allowance.quota) return; // The 429 says it better.

    try {
        if (localStorage.getItem(ALLOWANCE_WARNED_KEY) === utcDay()) return;
        localStorage.setItem(ALLOWANCE_WARNED_KEY, utcDay());
    } catch (err) {
        return; // Can't remember having warned, so don't risk warning repeatedly.
    }

    const left = allowance.quota - allowance.used;
    const requests = left === 1 ? 'request' : 'requests';
    const base = `${left} AI ${requests} left today. It resets at midnight UTC.`;

    // The upgrade line is only fair because they are genuinely close to the
    // limit and Pro genuinely fixes it. Saying it at 20% would be a nag.
    const message = isProUser()
        ? base
        : `${base} Pro comes with ${AI_DAILY_LIMITS.pro} a day — see Account.`;

    // toast.js is concatenated after this file in the bundle. The call happens
    // at runtime rather than at load, so it resolves, but guard it anyway.
    if (typeof showToast === 'function') showToast(message, 'info', 7000);
}

// True while the account is inside the app-managed 14-day trial, which is the
// only state where someone has Pro without paying for it.
export function isProTrial() {
    return localStorage.getItem('ceo_sub_status') === 'trialing' && isProUser();
}

// Whole days left on the trial, or null if they aren't on one.
export function trialDaysLeft() {
    const endsAt = localStorage.getItem('ceo_trial_ends_at');
    if (!endsAt) return null;
    const ms = new Date(endsAt).getTime() - Date.now();
    if (Number.isNaN(ms)) return null;
    return Math.max(0, Math.ceil(ms / 86400000));
}

// Can this account open the lead pipeline screen?
//
// One answer, asked by three places: the nav link, the screen's own guard, and
// the Revenue card that either links into it or advertises it. Two copies of
// this rule would eventually disagree, and the failure mode is a nav link
// pointing at a locked screen — the exact shape of the canConnectStripe bug.
export function canUseLeadPipeline() {
    return isProUser() && isFeatureLive('lead-pipeline');
}

// Can this account open the quarter history screen? Same single-answer rule as
// canUseLeadPipeline above, asked by the screen's own guard, the card on Wins &
// Progress and the link on Quarter Reset.
export function canUseHistory() {
    return isProUser() && isFeatureLive('history');
}

// A small "PRO" chip, for sitting next to a heading or a label.
export function proBadge() {
    return `<span class="pro-badge">PRO</span>`;
}

// The heading line every Pro card wears: the chip, the heading, and an "in build"
// marker when the feature does not exist yet.
//
//   ${proCardHeading('payment-import', 'Stripe connected')}
//
// Why this exists rather than each card assembling its own:
//
// A Pro feature's card has two lives. Before you can use it, it is an advert
// (proTeaser). Once you can, that advert deletes itself and something useful
// takes its place — a panel with real buttons. The second one is written by hand
// on whichever screen needs it, and twice now it has been written without the
// badge: the card became useful and quietly stopped saying it was part of Pro.
//
// One function owning the chip, the heading and the build marker means a card
// that graduates from advert to control keeps its identity through the change.
// If you are building a new Pro panel, start its markup with this.
export function proCardHeading(featureKey, heading) {
    const buildNote = isFeatureLive(featureKey)
        ? ''
        : `<span class="plan-feature-soon">in build</span>`;
    return `${proBadge()}${heading}${buildNote}`;
}

// The style that lays proCardHeading out: chip and text on one line, wrapping
// together rather than the chip stranding itself. Inline because the codebase
// styles inline throughout and a one-off class in components.css for this would
// be the odd one out.
export const PRO_CARD_HEADING_STYLE =
    'margin: 0 0 0.5rem 0; font-weight: 600; color: var(--color-black); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;';

// A locked control, for a feature that belongs in a row of other controls rather
// than in the flow of the page:
//
//   ${proLock('pdf-export', 'PDF Report')}
//
// Disappears on exactly the same rule as proTeaser — the account has the tier
// AND the feature exists. Hiding it on tier alone was a bug: the trial resolves
// to Pro, so every trial user lost the lock buttons while keeping the teasers,
// and the two most valuable placements were invisible to the people most likely
// to convert.
export function proLock(featureKey, label) {
    if (isProUser() && isFeatureLive(featureKey)) return '';
    return `
        <button type="button" class="pro-lock" data-pro-feature="${featureKey}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span>${label}</span>
        </button>
    `;
}

// A full-width teaser strip, for the moments where the point isn't "here's a
// button you can't press" but "this whole job could be easier". Sits in the flow
// of a screen rather than in a row of controls.
//
//   ${proTeaser('payment-import', 'These could log themselves', 'Connect Stripe…')}
//
// Returns an empty string for accounts that already have the feature working,
// so it disappears the moment the real thing ships to that user.
//
// `action` is optional: `{ href, label }` adds a real link inside the strip, for
// the case where part of the feature IS reachable and the teaser should be a way
// in rather than only an explanation. The link carries `data-pro-action`, which
// is how the delegated handler below knows to let the navigation happen instead
// of swallowing the click and opening the modal.
export function proTeaser(featureKey, heading, hint, action) {
    if (isProUser() && isFeatureLive(featureKey)) return '';

    // The heading, chip and build marker all come from proCardHeading, which is
    // the one place that decides what a Pro card's heading looks like.
    //
    // The chip always reads PRO. Its job is to mark the card as a Pro feature,
    // and that is true whether or not the feature has shipped yet. It used to read
    // IN BUILD for anything unshipped, which meant the cards most in need of the
    // label were the only ones without it: a reader on the base plan learned when
    // something was coming but never that it was a Pro feature at all.

    const link = action && action.href
        ? `<a class="pro-teaser-action" data-pro-action href="${action.href}">${action.label}</a>`
        : '';

    return `
        <div class="pro-teaser" data-pro-feature="${featureKey}" role="button" tabindex="0">
            <svg class="pro-teaser-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span class="pro-teaser-body">
                <span class="pro-teaser-heading">${proCardHeading(featureKey, heading)}</span>
                <span class="pro-teaser-hint">${hint}</span>
                ${link}
            </span>
        </div>
    `;
}

// The "not on your plan" modal. Structure and keyboard handling mirror
// showConfirm() in toast.js so the two feel like the same app.
export function showProModal(featureKey) {
    const feature = PRO_FEATURES[featureKey] || PRO_FEATURES['overview'];

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-card card pro-modal" role="dialog" aria-modal="true" aria-labelledby="pro-modal-title">
            <span class="pro-badge pro-modal-badge">PRO</span>
            <h3 id="pro-modal-title" class="confirm-title"></h3>
            <p class="confirm-message pro-modal-blurb"></p>
            <ul class="pro-modal-list"></ul>
            <p class="pro-modal-note"></p>
            <div class="confirm-actions">
                <button type="button" class="btn btn-primary pro-modal-close">Got it</button>
            </div>
        </div>
    `;

    const live = isFeatureLive(featureKey);

    // No chip is added before the title here on purpose. The modal already carries
    // a PRO badge of its own directly above the heading (.pro-modal-badge), and a
    // second one on the title line reads as a mistake rather than as emphasis.
    // The teaser strips are the place the badge earns its keep, because there it
    // is the only thing marking the row as Pro.
    overlay.querySelector('.confirm-title').textContent = feature.title;
    overlay.querySelector('.pro-modal-blurb').textContent = feature.blurb;

    // The footer says one of three true things, never a sales line the app can't
    // honour. Which one depends on whether the feature exists yet and whether
    // this account already has Pro.
    const note = overlay.querySelector('.pro-modal-note');
    if (!live) {
        note.textContent = "This one is still being built. Nothing changes on your plan today, and it'll appear here the moment it lands.";
    } else if (isProUser()) {
        note.textContent = 'This is part of your plan. Go ahead.';
    } else if (window.CEO_CHECKOUT_PRO) {
        note.textContent = 'This is part of Pro. You can switch plans whenever you like, and everything you have logged comes with you.';
    } else {
        note.textContent = "Pro isn't open for sign-ups just yet. You'll see it here as soon as it is.";
    }

    const list = overlay.querySelector('.pro-modal-list');
    if (feature.list && feature.list.length) {
        feature.list.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            list.appendChild(li);
        });
    } else {
        list.remove();
    }

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

    overlay.querySelector('.pro-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKeydown);

    document.body.appendChild(overlay);
    overlay.querySelector('.pro-modal-close').focus();
}

// One delegated listener for every locked control in the app, present and
// future. Screens only have to render `data-pro-feature="..."` — they never
// wire up a handler, and a screen that re-renders can't lose it.
export function initProGate() {
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-pro-feature]');
        if (!trigger) return;
        // A real link inside a teaser wins over the modal. Without this the
        // preventDefault below would swallow it, and the one part of the feature
        // that does work would be unreachable from the place that describes it.
        if (e.target.closest('[data-pro-action]')) return;
        e.preventDefault();
        showProModal(trigger.getAttribute('data-pro-feature'));
    });

    // Not every locked control can be a <button> — the plan list in Settings is
    // rows of text. Those carry role="button" tabindex="0", which promises
    // keyboard users that Enter and Space will work, so honour it.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const trigger = e.target.closest && e.target.closest('[data-pro-feature]');
        if (!trigger || trigger.tagName === 'BUTTON') return;
        // Same rule as the click handler: a focused link inside the strip is
        // navigation, not a request to read about the plan.
        if (e.target.closest('[data-pro-action]')) return;
        e.preventDefault();
        showProModal(trigger.getAttribute('data-pro-feature'));
    });
}
