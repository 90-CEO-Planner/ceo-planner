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
        shipped: false,
        title: 'A real lead pipeline',
        blurb: 'Named contacts instead of a running count. Move each one through lead, call booked, proposal sent, won or lost, set a follow-up date, and see at a glance who has gone quiet on you.'
    },
    'history': {
        shipped: false,
        title: 'Your year, quarter by quarter',
        blurb: 'Every quarter you finish is archived rather than cleared. This is where you see them side by side, so you can tell whether this quarter is genuinely better than the last one or it just feels that way.'
    },
    'live-ai': {
        shipped: false,
        title: 'Planning that thinks about your business',
        blurb: 'The suggestions here are currently pattern rules, which is why they can feel a little generic. Pro sends your actual numbers, offer and stage to the coach, so what comes back is written about your business rather than about businesses in general.'
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

// A small "PRO" chip, for sitting next to a heading or a label.
export function proBadge() {
    return `<span class="pro-badge">PRO</span>`;
}

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

    const live = isFeatureLive(featureKey);

    // The chip always reads PRO. Its job is to mark the card as a Pro feature,
    // and that is true whether or not the feature has shipped yet.
    //
    // It used to read IN BUILD for anything unshipped, which meant the cards most
    // in need of the label were the only ones not carrying it: a reader on the
    // base plan saw IN BUILD and learned when it was coming, but never learned it
    // was a Pro feature at all. Build status is still real information, so it
    // keeps its own muted marker after the heading instead of taking the chip's
    // place — the same treatment the plan list on the Account screen already uses.
    const buildNote = live ? '' : `<span class="plan-feature-soon">in build</span>`;

    const link = action && action.href
        ? `<a class="pro-teaser-action" data-pro-action href="${action.href}">${action.label}</a>`
        : '';

    return `
        <div class="pro-teaser" data-pro-feature="${featureKey}" role="button" tabindex="0">
            <svg class="pro-teaser-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span class="pro-teaser-body">
                <span class="pro-teaser-heading"><span class="pro-badge pro-teaser-tag">PRO</span>${heading}${buildNote}</span>
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
