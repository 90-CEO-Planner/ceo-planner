// store.js

// Read-only: the in-memory cache of sales imported from Stripe, merged into the
// revenue figures at read time. store.js does not write to it and does not fetch
// it — the screens refresh it and this just reads whatever is there. An empty
// cache means "manual entries only", which is the pre-import behaviour.
import { getImportedSalesCache } from './stripeImport.js';

const STORE_KEY = 'ceoPlanner_store';

// The reminder values, in one place. Settings writes these into
// profile.reminderTimes and the notification engine in app.js reads them back.
// They were previously written as 'weekly_plan' and read as 'Weekly Prompt', so
// no reminder ever matched and none of them ever fired.
export const REMINDER_WEEKLY = 'weekly_plan';
export const REMINDER_DAILY = 'daily_priority';
export const REMINDER_FRIDAY = 'friday_review';
// Monthly, unlike the other three. The funnel card is only as good as the numbers
// behind it, and those are the one input nothing else in the app prompts for —
// sales and leads get logged as they happen, traffic and social only ever get
// logged because someone remembered.
export const REMINDER_SNAPSHOT = 'monthly_snapshot';

export function getLocalDateString(date = new Date()) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Turns a <input type="date"> value ("2026-08-13") into a Date in the user's own
// timezone. `new Date("2026-08-13")` parses as UTC midnight, so anyone west of
// GMT had their sales land on the previous day. Noon is used as the time of day
// so no DST shift can push the date over a boundary either way.
export function parseDateInput(value) {
    if (!value) return new Date();
    const parts = String(value).split('-').map(Number);
    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return new Date(value);
    const [year, month, day] = parts;
    return new Date(year, month - 1, day, 12, 0, 0, 0);
}

// Money for display. Whole amounts stay clean ("1,500"), amounts with pence keep
// both decimal places ("1,500.50"). Plain toLocaleString() dropped the trailing
// zero, so a sale logged as 1500.50 was shown back to the user as "1,500.5".
export function formatAmount(value) {
    const n = parseFloat(value) || 0;
    return n.toLocaleString(undefined, {
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2
    });
}

// The single definition of "this week" for the whole app. Weeks start Monday,
// matching the Monday planning ritual the product is built around. Anything that
// buckets by week must use this, or two panels on one screen disagree.
export function getWeekStart(date = new Date()) {
    const d = new Date(date);
    const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    d.setDate(d.getDate() - diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
}

// How many weeks of the 90-day quarter have actually run, clamped to 1..12.
// This is deliberately a measure of elapsed *time*, not of activity — using the
// number of logged sales here is what made the app report "Behind" to anyone who
// logged several sales in week one.
export function getWeeksElapsed(store, quarterWeeks = 12) {
    const start = store?.quarterStartDate ? new Date(store.quarterStartDate) : null;
    if (!start || !Number.isFinite(start.getTime())) return null;

    // Whole days first, so the answer can't flicker between two values when the
    // elapsed time sits a few milliseconds either side of an exact week boundary.
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysElapsed = Math.floor((Date.now() - start.getTime()) / msPerDay);
    const elapsed = Math.ceil(daysElapsed / 7);
    return Math.min(quarterWeeks, Math.max(1, elapsed));
}

const defaultState = {
    profile: {
        name: '',
        businessName: '',
        logo: '',
        stage: '', // Set on wizard step 5: 'Just starting out' | 'Growing' | 'Scaling'
        businessModel: '',
        targetAudience: '',
        industryNiche: '',
        bottleneck: '',
        // Set on wizard step 5, changeable in Settings. weeklyPlanner.js matches on
        // substrings of these ('first sale', 'launch', 'audience', 'reset'), so the
        // wizard and Settings option lists must stay identical.
        strategyMode: '', // 'First Sale Sprint' | 'Offer Launch Quarter' | 'Audience Growth' | 'CEO Reset'
        planningDay: 'Monday',
        reminderTimes: [],
        trialStartDate: '' // ISO timestamp for notification and banner scheduling
    },
    goals: {
        focus: '',
        outcome: '',
        priorities: ['', '', ''],
        milestones: { month1: '', month2: '', month3: '' },
        statement: ''
    },
    yearlyGoals: {
        revenue: 0,
        audience: 0
    },
    revenue: {
        quarterlyGoal: 0,
        averageOfferPrice: 0,
        quickOffers: [], // Array of { id, name, price, source }
        entries: [] // Array of { id, date, weekStart, amount, notes }
    },
    leads: {
        quarterlyGoal: 0,
        entries: [] // Array of { id, date, amount, source }
    },
    metrics: [], // Array of { id, date, traffic, calls, social }
    settings: {
        currency: '$'
    },
    // ISO timestamp for the start of the active 90-day quarter. Set on wizard
    // completion and on quarter reset. Pace and projection maths measure from
    // here — without it there is no way to know how much of the quarter has run.
    quarterStartDate: '',
    pastQuarters: [], // Array of archived quarters { dateArchived, goals, reflection, ... }
    weeklyPlans: [], // Array of plan objects
    reviews: [], // Array of review objects
    monthlyReviews: [], // Array of monthly review objects
    dailyLogs: {}, // Dict of { "2023-11-20": [{text: "Task 1", done: false}, ...] }
    streak: 0, // Friday Review Streak
    planningStreak: 0, // Monday Plan Streak
    draftMondayPlan: null, // AI generated plan waiting for Monday
    notes: [], // Array of { id, text, date }
    setupChecklist: [], // Array of one-time setup tasks
    redFlags: [], // Array of leading indicators
    monthlyThemes: { month1: '', month2: '', month3: '' }
};

export function getStore() {
    try {
        const data = localStorage.getItem(STORE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            const finalStore = {
                ...defaultState,
                ...parsed,
                profile: { ...defaultState.profile, ...(parsed.profile || {}) },
                goals: { ...defaultState.goals, ...(parsed.goals || {}) },
                revenue: { ...defaultState.revenue, ...(parsed.revenue || {}), quickOffers: parsed.revenue?.quickOffers || [] },
                leads: { ...defaultState.leads, ...(parsed.leads || {}) },
                settings: { ...defaultState.settings, ...(parsed.settings || {}) },
                metrics: parsed.metrics || [],
                quarterStartDate: parsed.quarterStartDate || '',
                pastQuarters: parsed.pastQuarters || [],
                weeklyPlans: parsed.weeklyPlans || [],
                reviews: parsed.reviews || [],
                monthlyReviews: parsed.monthlyReviews || [],
                dailyLogs: parsed.dailyLogs || {},
                draftMondayPlan: parsed.draftMondayPlan || null,
                notes: parsed.notes || [],
                setupChecklist: parsed.setupChecklist || [],
                redFlags: parsed.redFlags || [],
                monthlyThemes: parsed.monthlyThemes || { month1: '', month2: '', month3: '' }
            };
            
            // Retroactively assign IDs to legacy revenue entries so they can be securely deleted
            let needsReSave = false;
            if (finalStore.revenue && finalStore.revenue.entries) {
                finalStore.revenue.entries.forEach((entry, idx) => {
                    if (!entry.id) {
                        entry.id = 'legacy_' + Date.now() + '_' + idx;
                        needsReSave = true;
                    }
                    // Anything living in revenue.entries is a sale by definition.
                    // Older rows predate the field and were being classified by
                    // whether they happened to carry an 'offer' key, so a sale
                    // logged without an offer name showed up in the pipeline as
                    // a lead.
                    if (!entry.type) {
                        entry.type = 'sale';
                        needsReSave = true;
                    }
                });
            }
            if (finalStore.leads && finalStore.leads.entries) {
                finalStore.leads.entries.forEach(entry => {
                    if (!entry.type) {
                        entry.type = 'lead';
                        needsReSave = true;
                    }
                });
            }
            // Backfill the quarter start for anyone who set up before it was tracked.
            // The earliest thing they logged is the best available origin — without
            // one, every pace and projection figure has no time axis to measure on.
            if (!finalStore.quarterStartDate) {
                const stamps = [];
                (finalStore.weeklyPlans || []).forEach(p => stamps.push(new Date(p.date).getTime()));
                (finalStore.revenue?.entries || []).forEach(e => stamps.push(new Date(e.date).getTime()));
                const valid = stamps.filter(t => Number.isFinite(t));
                if (valid.length > 0) {
                    finalStore.quarterStartDate = new Date(Math.min(...valid)).toISOString();
                    needsReSave = true;
                }
            }

            if (needsReSave) {
                localStorage.setItem(STORE_KEY, JSON.stringify(finalStore));
            }

            return finalStore;
        }
    } catch (e) {
        console.error("Failed to load store from LocalStorage", e);
    }
    return defaultState;
}

export function saveStore(state) {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
        
        // Fire-and-forget background cloud sync
        if (localStorage.getItem('ceo_auth') === 'true') {
            window.db.auth.getSession().then(({ data: sessionData }) => {
                if (sessionData && sessionData.session) {
                    const user = sessionData.session.user;
                    window.db.from('user_data').upsert({
                        user_id: user.id,
                        data: state
                    }).then(({ error }) => {
                        if (error) {
                            console.error("Background cloud sync failed", error);
                            if (!window._syncErrorAlerted) {
                                console.warn("Cloud sync failed. Your data is only saved locally. Please check your Supabase RLS policies on the user_data table. Error: " + error.message);
                                window._syncErrorAlerted = true;
                            }
                        }
                    });
                }
            });
        }
    } catch (e) {
        console.error("Failed to save store to LocalStorage", e);
    }
}

export function updateProfile(profileData) {
    const store = getStore();
    store.profile = { ...store.profile, ...profileData };
    saveStore(store);
}

export function updateGoals(goalsData) {
    const store = getStore();
    store.goals = { ...store.goals, ...goalsData };
    saveStore(store);
}

export function updateRevenueSettings(settings) {
    const store = getStore();
    store.revenue = { ...store.revenue, ...settings };
    saveStore(store);
}

export function updateQuickOffers(offers) {
    const store = getStore();
    // Enforce base tier limit of 3
    store.revenue.quickOffers = offers.slice(0, 3);
    saveStore(store);
}

export function addRevenueEntry(entry) {
    const store = getStore();
    entry.id = Date.now().toString();
    entry.date = entry.date || new Date().toISOString();
    // Written explicitly so nothing downstream has to guess a sale from the
    // presence of an 'offer' key — which misread every entry logged without one.
    entry.type = 'sale';
    store.revenue.entries.push(entry);
    saveStore(store);
}

export function deleteRevenueEntry(id) {
    const store = getStore();
    const initialLen = store.revenue.entries.length;
    store.revenue.entries = store.revenue.entries.filter(e => String(e.id) !== String(id));
    saveStore(store);
    return store.revenue.entries.length < initialLen;
}

export function updateSettings(settings) {
    const store = getStore();
    store.settings = { ...store.settings, ...settings };
    saveStore(store);
}

export function updateLeadGoal(goal) {
    const store = getStore();
    store.leads.quarterlyGoal = goal;
    saveStore(store);
}

export function addLeadEntry(entry) {
    const store = getStore();
    entry.id = Date.now().toString();
    entry.date = entry.date || new Date().toISOString();
    entry.type = 'lead';
    store.leads.entries.push(entry);
    saveStore(store);
}

export function deleteLeadEntry(id) {
    const store = getStore();
    const initialLen = store.leads.entries.length;
    store.leads.entries = store.leads.entries.filter(e => String(e.id) !== String(id));
    saveStore(store);
    return store.leads.entries.length < initialLen;
}

export function addMetricSnapshot(snapshot) {
    const store = getStore();
    snapshot.id = Date.now().toString();
    snapshot.date = snapshot.date || new Date().toISOString();
    store.metrics.push(snapshot);
    saveStore(store);
}

export function deleteMetricSnapshot(id) {
    const store = getStore();
    const initialLen = store.metrics.length;
    store.metrics = store.metrics.filter(m => String(m.id) !== String(id));
    saveStore(store);
    return store.metrics.length < initialLen;
}

// Combine manually logged sales with ones imported from Stripe.
//
// Nothing is hidden and nothing is deleted: if the same sale exists in both
// places it appears twice, with the imported copy marked. Quietly dropping one
// would mean the app silently overriding something the user typed, and being
// wrong about that is worse than showing a duplicate they can see and judge.
//
// "Likely the same sale" is the same amount on the same day, give or take a day,
// which covers a payment logged the morning after it landed. Deliberately strict:
// a false flag on two genuinely separate £47 sales in one week is more annoying
// than a missed one.
function mergeImportedSales(manualEntries, importedEntries) {
    if (!importedEntries || importedEntries.length === 0) return manualEntries;

    const DAY = 24 * 60 * 60 * 1000;
    const manualStamps = manualEntries.map(e => ({
        time: new Date(e.date).getTime(),
        amount: parseFloat(e.amount) || 0
    }));

    const flagged = importedEntries.map(imported => {
        const time = new Date(imported.date).getTime();
        const amount = imported.grossAmount != null ? imported.grossAmount : imported.amount;
        const looksLikeDuplicate = manualStamps.some(m =>
            Math.abs(m.amount - amount) < 0.01 &&
            Number.isFinite(m.time) &&
            Number.isFinite(time) &&
            Math.abs(m.time - time) <= DAY
        );
        return looksLikeDuplicate ? { ...imported, possibleDuplicate: true } : imported;
    });

    return manualEntries.concat(flagged);
}

// The funnel: visitors, calls booked, calls closed, and the rates between them.
//
// One place, because there were three. The Revenue screen worked it out inline,
// the AI Coach worked it out again in aiService.js, and the executive report
// printed raw numbers and let the model divide. They disagreed: the screen was
// corrected to count only recorded closes, while the Coach carried on dividing
// total sales by total calls and telling the user things like a 150% close rate.
//
// A number the dashboard and the AI disagree about is worse than either being
// wrong on its own, so both now read from here.
//
// callCloseRate is null when there is no answer to give, never 0. An empty closes
// box means "not recorded", and reporting that as "none of your calls closed" is
// a claim the data does not support.
export function getFunnelInsights() {
    const store = getStore();
    const leads = store.leads?.entries || [];
    const metrics = store.metrics || [];

    const snapshotTraffic = metrics.reduce((s, m) => s + (parseFloat(m.traffic) || 0), 0);
    const snapshotCalls = metrics.reduce((s, m) => s + (parseFloat(m.calls) || 0), 0);
    const snapshotCloses = metrics.reduce((s, m) => s + (parseFloat(m.closes) || 0), 0);
    const leadCalls = leads.reduce((s, l) => s + (parseFloat(l.calls) || 0), 0);
    const leadCloses = leads.reduce((s, l) => s + (parseFloat(l.closes) || 0), 0);
    const totalLeads = leads.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

    const totalCalls = snapshotCalls + leadCalls;
    const totalCloses = snapshotCloses + leadCloses;

    const anyClosesEverLogged =
        leads.some(l => (parseFloat(l.closes) || 0) > 0) ||
        metrics.some(m => (parseFloat(m.closes) || 0) > 0);

    const callCloseRate = (totalCalls > 0 && anyClosesEverLogged)
        ? (Math.min(totalCloses, totalCalls) / totalCalls) * 100
        : null;

    const visitorToCallRate = snapshotTraffic > 0
        ? (snapshotCalls / snapshotTraffic) * 100
        : null;

    return {
        snapshotTraffic,
        snapshotCalls,
        snapshotCloses,
        leadCalls,
        leadCloses,
        totalLeads,
        totalCalls,
        totalCloses,
        anyClosesEverLogged,
        callCloseRate,
        visitorToCallRate,
        latestSnapshot: metrics.length ? metrics[metrics.length - 1] : null
    };
}

// Which channel actually earns.
//
// The monthly snapshot funnel is site-wide: a visitor count cannot be split by
// source. But leads and sales both already carry one, so the rest of the funnel
// can be broken down per channel with nothing new to log.
//
// Two deliberate decisions in here:
//
// Imported Stripe payments are grouped as "Not attributed" rather than appearing
// as a channel called Stripe. Stripe is how the money arrived, not what caused
// the sale, and a row labelled Stripe sitting above Instagram would read as a
// top-performing channel while meaning nothing. Grouping them honestly also
// surfaces a real cost of automatic importing: the more revenue arrives on its
// own, the less of it can be traced back to an effort.
//
// Sources are matched on a trimmed, lowercased key, so "instagram" and
// "Instagram " become one row. Nothing cleverer than that — "IG Story" and
// "Instagram" stay separate, because silently merging two things the user named
// differently would be the app deciding it knows better than she does. Where two
// names look related, they are flagged for her to judge rather than combined.
export const NOT_ATTRIBUTED = 'Not attributed';

export function getChannelFunnel() {
    const store = getStore();
    const leads = store.leads?.entries || [];
    const sales = getRevenueInsights().entries || [];

    const normalise = (s) => String(s || '').trim().toLowerCase();
    const rows = new Map();

    const bucket = (key, label) => {
        if (!rows.has(key)) {
            rows.set(key, { key, label, leads: 0, calls: 0, closes: 0, revenue: 0, hasClosesLogged: false });
        }
        return rows.get(key);
    };

    leads.forEach(l => {
        const key = normalise(l.source) || '__unattributed__';
        const label = key === '__unattributed__' ? NOT_ATTRIBUTED : String(l.source).trim();
        const r = bucket(key, label);
        r.leads += parseFloat(l.amount) || 0;
        r.calls += parseFloat(l.calls) || 0;
        r.closes += parseFloat(l.closes) || 0;
        if ((parseFloat(l.closes) || 0) > 0) r.hasClosesLogged = true;
    });

    sales.forEach(s => {
        // An imported payment has no marketing source, whatever its source field
        // happens to say.
        const key = s.imported ? '__unattributed__' : (normalise(s.source) || '__unattributed__');
        const label = key === '__unattributed__' ? NOT_ATTRIBUTED : String(s.source).trim();
        const r = bucket(key, label);
        r.revenue += parseFloat(s.amount) || 0;
    });

    const list = Array.from(rows.values()).map(r => ({
        ...r,
        // null, not 0, when there is nothing to divide by — same rule as the rest
        // of the funnel. "No calls booked from this channel" is not "0% booked".
        callRate: r.leads > 0 ? (Math.min(r.calls, r.leads) / r.leads) * 100 : null,
        closeRate: (r.calls > 0 && r.hasClosesLogged) ? (Math.min(r.closes, r.calls) / r.calls) * 100 : null
    }));

    // Flag names that look like the same channel spelled two ways, so she can
    // decide. Nothing is merged automatically.
    //
    // Substring alone is not enough: it catches "Instagram" against "Instagram
    // Ads" but misses "IG Story" against "Instagram", which is exactly what this
    // audience types. The abbreviations below are the handful worth knowing — a
    // short list of real shorthand beats a clever string-distance algorithm that
    // would also decide "Email" and "Meta" are related.
    const ALIASES = [
        ['ig', 'insta', 'instagram'],
        ['fb', 'facebook', 'meta'],
        ['li', 'linkedin'],
        ['yt', 'youtube'],
        ['tt', 'tiktok'],
        ['x', 'twitter'],
        ['pin', 'pinterest'],
        ['newsletter', 'email', 'mailing list']
    ];
    const family = (key) => {
        const words = key.split(/[^a-z0-9]+/).filter(Boolean);
        return ALIASES.findIndex(group =>
            group.some(term => words.includes(term) || key.includes(term) && term.length >= 4)
        );
    };

    list.forEach(a => {
        const aFamily = family(a.key);
        a.similarTo = list
            .filter(b => {
                if (b.key === a.key) return false;
                if (a.key === '__unattributed__' || b.key === '__unattributed__') return false;
                const substring = a.key.length >= 3 && b.key.length >= 3
                    && (a.key.includes(b.key) || b.key.includes(a.key));
                const sameFamily = aFamily !== -1 && aFamily === family(b.key);
                return substring || sameFamily;
            })
            .map(b => b.label);
    });

    // Earners first. Unattributed always last: it is a gap to close, not a
    // channel to compare against.
    return list.sort((a, b) => {
        if (a.key === '__unattributed__') return 1;
        if (b.key === '__unattributed__') return -1;
        return b.revenue - a.revenue;
    });
}

export function getRevenueInsights() {
    const store = getStore();
    const rev = store.revenue;
    const goal = parseFloat(rev.quarterlyGoal) || 0;
    const price = parseFloat(rev.averageOfferPrice) || 0;

    // Every entry ever logged. The pipeline feed, the history chart and the CSV
    // export all need the full list, so this stays unfiltered.
    //
    // Sales imported from Stripe are merged in here rather than being written
    // into the store, so a sync can never overwrite something the user typed.
    // Merging at this single point means the totals, the quarter progress, the
    // conversion rates, the CSV export and the AI Coach's context all pick them
    // up without each needing to know the feature exists.
    const entries = mergeImportedSales(rev.entries || [], getImportedSalesCache());

    // The subset that belongs to the active quarter. Entries dated before the
    // quarter began — history someone typed in at onboarding, or an import — used
    // to count in full towards the goal while the pace maths divided by the weeks
    // since the quarter started. A month of back-entered sales then read as one
    // week's work and the projection came out roughly four times too high.
    const quarterStart = store.quarterStartDate ? new Date(store.quarterStartDate) : null;
    const quarterEntries = (quarterStart && Number.isFinite(quarterStart.getTime()))
        ? entries.filter(e => new Date(e.date).getTime() >= quarterStart.getTime())
        : entries;

    const totalRevenue = quarterEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    // What was logged against earlier dates, so the Revenue screen can account for
    // the difference rather than appearing to have lost it.
    const revenueBeforeQuarter = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) - totalRevenue;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const startOfWeek = getWeekStart(now);

    const revenueThisWeek = entries
        .filter(e => {
            const d = new Date(e.date);
            return d.getTime() >= startOfWeek.getTime();
        })
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const revenueThisMonth = entries
        .filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    // Quarter Progress
    const progressPercent = goal > 0 ? (totalRevenue / goal) * 100 : 0;

    // Month Progress
    const monthTarget = goal > 0 ? goal / 3 : 0;
    const monthProgressPercent = monthTarget > 0 ? (revenueThisMonth / monthTarget) * 100 : 0;

    // Weekly Target
    let weeklyTargetLength = goal > 0 ? goal / 12 : 0;

    // Required
    const salesRequired = price > 0 ? Math.ceil(goal / price) : 0;
    const salesMade = price > 0 ? Math.floor(totalRevenue / price) : 0;

    // Projects & Momentum
    const Q_WEEKS = 12;
    const entriesCount = entries.length;
    // Falls back to week 1 only for a store with no quarter start and no history
    // to backfill one from, in which case there is nothing to project anyway.
    const weeksElapsed = getWeeksElapsed(store, Q_WEEKS) || 1;
    let projectedRevenue = 0;
    let momentum = 'Not enough data';
    let insightText = "Log more revenue entries with their sources to generate actionable insights.";

    // Track Sources and Offers
    const revenueBySourceMonth = {};
    const revenueByOfferMonth = {};
    const revenueBySourceQuarter = {};
    const revenueByOfferQuarter = {};

    entries.forEach(e => {
        const amt = parseFloat(e.amount) || 0;
        const src = e.source || 'Other';
        const off = e.offer || 'General';
        const d = new Date(e.date);

        // Quarter total
        revenueBySourceQuarter[src] = (revenueBySourceQuarter[src] || 0) + amt;
        revenueByOfferQuarter[off] = (revenueByOfferQuarter[off] || 0) + amt;

        // Month total
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            revenueBySourceMonth[src] = (revenueBySourceMonth[src] || 0) + amt;
            revenueByOfferMonth[off] = (revenueByOfferMonth[off] || 0) + amt;
        }
    });

    // Find Top Source and Top Offer
    const topSource = Object.keys(revenueBySourceQuarter).length > 0 ?
        Object.keys(revenueBySourceQuarter).reduce((a, b) => revenueBySourceQuarter[a] > revenueBySourceQuarter[b] ? a : b) : 'None';

    const topOffer = Object.keys(revenueByOfferQuarter).length > 0 ?
        Object.keys(revenueByOfferQuarter).reduce((a, b) => revenueByOfferQuarter[a] > revenueByOfferQuarter[b] ? a : b) : 'None';

    if (entriesCount > 0) {
        // Average per week of the quarter that has actually elapsed. Dividing by
        // the number of entries instead would mean five sales in week one read as
        // five weeks of trading, and the app would call a good week "Behind".
        const avgPerWeek = totalRevenue / weeksElapsed;
        projectedRevenue = avgPerWeek * Q_WEEKS;

        // Calculate remaining weekly target dynamically based on pace
        const remainingRevenue = Math.max(0, goal - totalRevenue);
        const remainingWeeks = Math.max(1, Q_WEEKS - weeksElapsed);
        weeklyTargetLength = remainingRevenue / remainingWeeks;

        // Momentum
        if (projectedRevenue >= goal) {
            momentum = 'Ahead 🎉';
        } else if (projectedRevenue >= goal * 0.9) {
            momentum = 'On Track';
        } else {
            momentum = 'Behind';
        }

        // Advanced Insight Generation heuristics bridging activity to revenue
        if (store.weeklyPlans && store.weeklyPlans.length > 0) {
            const recentPlan = store.weeklyPlans[store.weeklyPlans.length - 1];
            const hasVisibility = recentPlan.visibilityAction?.length > 10;
            const hasOffers = recentPlan.revenueAction?.length > 10;
            const hasFollowUps = recentPlan.followUps?.length > 10;

            if (revenueThisWeek > 0) {
                let drivers = [];
                if (hasOffers) drivers.push("direct offers");
                if (hasVisibility) drivers.push("visibility efforts");
                if (hasFollowUps) drivers.push("diligent follow-ups");
                insightText = `Momentum Alert: Your recent conversion of $${revenueThisWeek.toLocaleString()} correlates highly with your focus on ${drivers.join(' and ') || 'recent actions'}. Keep executing this mix to maintain the momentum.`;
            } else if (entriesCount > 0 && revenueThisWeek === 0) {
                if (!hasOffers && !hasFollowUps) {
                    insightText = `Bottleneck Detected: Your activity level is high, but without direct invitations or follow-ups, revenue is stalling. Suggestion: Dedicate your next work block to making 3 direct offers.`;
                } else {
                    insightText = `Sales Cycle Insight: You are planting seeds with your recent visibility and offers. Shift your focus to targeted follow-ups this week.`;
                }
            } else if (entriesCount >= 3 && progressPercent < 25) {
                insightText = `Warning: Behind pace. Review your main offer: is the pricing aligned with your audience?`;
            }
        }

        // Enhance insights with source data if available
        if (Object.keys(revenueBySourceMonth).length > 0 && Math.random() > 0.5) {
            // Mention the top source for the month
            const topMonthSource = Object.keys(revenueBySourceMonth).reduce((a, b) => revenueBySourceMonth[a] > revenueBySourceMonth[b] ? a : b);
            const amtMonth = revenueBySourceMonth[topMonthSource];
            const pctMonth = Math.round((amtMonth / (revenueThisMonth || 1)) * 100);
            if (pctMonth > 30) {
                insightText = `Insight: ${pctMonth}% of your revenue this month came from ${topMonthSource}. Double down on what's working!`;
            }
        } else if (topSource !== 'None' && topSource !== 'Other' && Math.random() > 0.5) {
            insightText = `Insight: Your highest-converting source this quarter is ${topSource}. Make sure your weekly plan includes actions for that channel.`;
        }
    } else {
        weeklyTargetLength = goal > 0 ? goal / Q_WEEKS : 0;
    }

    return {
        totalRevenue,
        revenueThisWeek,
        revenueThisMonth,
        goal,
        monthTarget,
        progressPercent: Math.min(100, progressPercent),
        monthProgressPercent: Math.min(100, monthProgressPercent),
        salesRequired,
        salesMade,
        salesRemaining: Math.max(0, salesRequired - salesMade),
        projectedRevenue,
        weeklyTargetLength,
        weeksElapsed,
        weeksRemaining: Math.max(0, Q_WEEKS - weeksElapsed),
        momentum,
        insightText,
        revenueBySourceMonth,
        revenueByOfferMonth,
        revenueBySourceQuarter,
        revenueByOfferQuarter,
        topSource,
        topOffer,
        // Logged against dates before this quarter began. Counted in `entries` but
        // deliberately excluded from totalRevenue, progress and the projection.
        revenueBeforeQuarter,
        quarterEntryCount: quarterEntries.length,
        entries: entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date)) // newest first
    };
}

export function addWeeklyPlan(plan) {
    const store = getStore();
    plan.id = Date.now().toString();
    plan.date = new Date().toISOString();
    store.weeklyPlans.push(plan);

    // Recalculate planning streak based on consecutive weeks
    // Only weeks the user actually committed to count. Counting the twelve
    // generated-but-unapplied weeks would report a streak nobody had earned.
    store.planningStreak = calculateStreak(
        store.weeklyPlans.filter(p => p.applied || !p.generated)
    );

    saveStore(store);
}

export function updateWeeklyPlan(planId, updatedFields) {
    const store = getStore();
    const index = store.weeklyPlans.findIndex(p => String(p.id) === String(planId));
    if (index !== -1) {
        store.weeklyPlans[index] = { ...store.weeklyPlans[index], ...updatedFields };

        // Applying a generated week is planning, and it is how most people plan,
        // because the roadmap pre-generates all twelve. The streak used to be
        // recalculated only in addWeeklyPlan(), so anyone following the roadmap saw
        // "Plan: 0w" on their dashboard forever no matter how consistent they were.
        store.planningStreak = calculateStreak(
            store.weeklyPlans.filter(p => p.applied || !p.generated)
        );

        saveStore(store);
    }
}

export function updateDailyLog(dateStr, tasks) {
    const store = getStore();
    store.dailyLogs[dateStr] = tasks;
    saveStore(store);
}

export function addReview(review) {
    const store = getStore();
    review.id = Date.now().toString();
    review.date = new Date().toISOString();
    store.reviews.push(review);

    // Recalculate streak based on consecutive weeks
    store.streak = calculateStreak(store.reviews);
    saveStore(store);
}

// Edit a past Friday Review in place. The original date is kept so the week it
// belongs to (and the streak built from those dates) doesn't move when someone
// corrects a typo weeks later.
export function updateReview(id, updatedFields) {
    const store = getStore();
    const review = store.reviews.find(r => String(r.id) === String(id));
    if (!review) return false;
    Object.assign(review, updatedFields, { id: review.id, date: review.date });
    saveStore(store);
    return true;
}

export function deleteReview(id) {
    const store = getStore();
    const initialLen = store.reviews.length;
    store.reviews = store.reviews.filter(r => String(r.id) !== String(id));
    store.streak = calculateStreak(store.reviews);
    saveStore(store);
    return store.reviews.length < initialLen;
}

export function addMonthlyReview(review) {
    const store = getStore();
    review.id = Date.now().toString();
    review.date = new Date().toISOString();
    store.monthlyReviews.push(review);
    saveStore(store);
}

export function saveDraftMondayPlan(plan) {
    const store = getStore();
    store.draftMondayPlan = plan;
    saveStore(store);
}

export function clearDraftMondayPlan() {
    const store = getStore();
    store.draftMondayPlan = null;
    saveStore(store);
}

export function applyGeneratedPlan(plan) {
    if (!plan || !plan.summary || !plan.weeks || plan.weeks.length !== 12 || !plan.setupChecklist || !plan.redFlags || !plan.monthlyThemes) {
        console.error("Invalid plan structure passed to applyGeneratedPlan");
        return;
    }

    const store = getStore();

    store.setupChecklist = plan.setupChecklist.map(item => ({ ...item, done: false }));
    store.redFlags = plan.redFlags;
    store.monthlyThemes = plan.monthlyThemes;
    store.planSummary = plan.summary;
    store.planCalibration = plan.calibration;

    // Keep everything the user actually lived through: plans they wrote themselves,
    // and generated weeks they already applied. Only unapplied generated weeks are
    // replaced. Wiping the lot meant someone eight weeks in who wanted to
    // course-correct lost every completed week.
    const kept = (store.weeklyPlans || []).filter(p => !p.generated || p.applied);
    const spokenFor = new Set(
        kept.filter(p => p.generated && p.weekNumber != null).map(p => p.weekNumber)
    );
    store.weeklyPlans = kept;

    const now = Date.now();
    plan.weeks.forEach((w, i) => {
        if (spokenFor.has(w.weekNumber)) return; // already applied, leave it alone
        store.weeklyPlans.push({
            id: 'gen_' + (now + i).toString(),
            date: new Date(now + i).toISOString(),
            weekNumber: w.weekNumber,
            monthIndex: w.monthIndex,
            winCondition: w.weeklyFocus,
            topActions: w.topPriorities,
            visibilityAction: w.visibilityAction,
            revenueAction: w.revenueAction,
            followUps: w.followUpAction,
            daily3: w.dailyThree,
            successCheck: w.successCheck,
            generated: true,
            applied: false
        });
    });

    saveStore(store);
}

export function addNote(note) {
    const store = getStore();
    note.id = Date.now().toString();
    note.date = new Date().toISOString();
    if (!store.notes) store.notes = [];
    store.notes.push(note);
    saveStore(store);
}

export function deleteNote(id) {
    const store = getStore();
    if (!store.notes) store.notes = [];
    store.notes = store.notes.filter(n => String(n.id) !== String(id));
    saveStore(store);
}

function calculateStreak(reviews) {
    if (!reviews || reviews.length === 0) return 0;

    // Sort reviews by date descending (newest first)
    const sorted = [...reviews].sort((a, b) => new Date(b.date) - new Date(a.date));

    let streak = 0;
    let currentDate = new Date();

    // Check if there's a review from this week or last week to start the streak
    const daysSinceMostRecent = Math.floor((currentDate - new Date(sorted[0].date)) / (1000 * 60 * 60 * 24));
    if (daysSinceMostRecent > 14) {
        return 0; // Streak broken if no review in last 2 weeks
    }

    let previousReviewDate = null;

    for (const review of sorted) {
        const reviewDate = new Date(review.date);

        if (!previousReviewDate) {
            streak++;
            previousReviewDate = reviewDate;
            continue;
        }

        // Calculate days between this review and the previous one we checked
        const daysDifference = Math.floor((previousReviewDate - reviewDate) / (1000 * 60 * 60 * 24));

        // If it's roughly a week apart (allowing some fudge factor for early/late days)
        if (daysDifference > 0 && daysDifference <= 14) {
            streak++;
            previousReviewDate = reviewDate;
        } else {
            // Gap is too big, streak is broken
            break;
        }
    }

    return streak;
}

// `reflection` is the four answers from the Quarterly Wrap-Up form. They are the
// most considered thing a user writes all quarter, so they are archived with the
// numbers they describe rather than discarded.
export function resetQuarter(reflection = null) {
    const store = getStore();

    // Archive unconditionally. The old version only archived when a focus had been
    // set, so a user who skipped that one field lost 90 days of revenue history
    // with nothing written anywhere.
    store.pastQuarters = store.pastQuarters || [];
    store.pastQuarters.push({
        dateArchived: new Date().toISOString(),
        quarterStartDate: store.quarterStartDate || '',
        goals: { ...store.goals },
        reflection: reflection,
        revenueEntries: [...(store.revenue?.entries || [])],
        revenueGoal: store.revenue?.quarterlyGoal || 0,
        leadEntries: [...(store.leads?.entries || [])],
        leadGoal: store.leads?.quarterlyGoal || 0,
        metrics: [...(store.metrics || [])],
        weeklyPlans: [...(store.weeklyPlans || [])],
        reviewsCount: store.reviews.length,
        plansCount: store.weeklyPlans.length,
        dailyLogs: store.dailyLogs ? { ...store.dailyLogs } : {}
    });

    // Reset goals to default
    store.goals = {
        focus: '',
        outcome: '',
        priorities: ['', '', ''],
        milestones: { month1: '', month2: '', month3: '' },
        statement: ''
    };

    // Clear the active set. All of it is now in pastQuarters above. Leads and
    // metrics are cleared too — carrying last quarter's leads forward inflated
    // every conversion rate in the new quarter.
    if (store.revenue) {
        store.revenue.entries = [];
    }
    if (store.leads) {
        store.leads.entries = [];
    }
    store.metrics = [];

    // Clear weekly plans for the new quarter start, keep reviews for wins history
    store.weeklyPlans = [];

    // Clear daily action history active log
    store.dailyLogs = {};

    // The new 90 days start now. Pace maths reads this.
    store.quarterStartDate = new Date().toISOString();

    saveStore(store);
}

// Stamps the start of a fresh 90-day quarter. Called on wizard completion.
// Deliberately not called from applyGeneratedPlan: regenerating a roadmap
// mid-quarter must not restart the clock, or every pace figure resets with it.
export function startNewQuarter(date = new Date()) {
    const store = getStore();
    store.quarterStartDate = new Date(date).toISOString();
    saveStore(store);
}

// Seed mock data for demo mode
export function seedMockData() {
    const store = getStore();
    store.profile = {
        stage: 'growth',
        businessModel: 'Coaching/Consulting',
        bottleneck: 'Lead Generation',
        planningDay: 'Monday',
        reminderTimes: ['weekly_plan']
    };
    store.goals = {
        focus: 'Launch Signature Group Program',
        outcome: 'Enrol 10 founding members and generate $15k',
        priorities: ['Finalize program curriculum', 'Run a 3-day challenge funnel', 'Direct outreach to warm leads'],
        milestones: {
            month1: 'Build curriculum & sales page',
            month2: 'Run marketing sprint & challenge',
            month3: 'Onboard members & deliver week 1-2'
        },
        statement: 'As a CEO, I commit to showing up visible and leading my launch with confidence.'
    };

    // Add a past review to show history
    store.reviews = [{
        id: 'mock_1',
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        movedForward: 'Finished the challenge workbook',
        workedWell: 'Got 50 signups from IG reel',
        difficult: 'Writing the email sequence took way too long',
        leads: '50 new leads',
        nextWeekImprove: 'Block specific time for writing instead of fitting it in'
    }];

    store.streak = 2;

    // Seed Revenue Data
    store.revenue = {
        quarterlyGoal: 15000,
        averageOfferPrice: 1500,
        entries: [
            {
                id: 'rev_1',
                type: 'sale',
                source: 'Email',
                date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                amount: 1500,
                notes: 'Founding member signup from old list (Last Month)'
            },
            {
                id: 'rev_2',
                type: 'sale',
                source: 'Email',
                date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
                amount: 3000,
                notes: '2 signups from email list (This Month)'
            },
            {
                id: 'rev_3',
                type: 'sale',
                source: 'Instagram',
                date: new Date().toISOString(),
                amount: 1500,
                notes: 'New IG Client (This Week)'
            }
        ]
    };

    // Ensure weekly plans exist for the insight correlation
    if (!store.weeklyPlans || store.weeklyPlans.length === 0) {
        store.weeklyPlans = [{
            id: 'wp_1',
            date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
            visibilityAction: 'Hosted IG Live Series',
            revenueAction: 'Pitched beta offer on live',
            followUps: 'Followed up with 10 commenters'
        }];
    }

    saveStore(store);
}
