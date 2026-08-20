// store.js

// Read-only: the in-memory cache of sales imported from a payment processor
// (Stripe or PayPal), merged into the
// revenue figures at read time. store.js does not write to it and does not fetch
// it — the screens refresh it and this just reads whatever is there. An empty
// cache means "manual entries only", which is the pre-import behaviour.
import { getImportedSalesCache, applyProductOffer } from './importedSales.js';
// Translates the processor's ISO code into the user's own currency at read time,
// and refuses to guess when no rate has been set. Concatenated before this file
// in the bundle; it imports nothing, so it cannot cycle back.
import { baseCurrencyCode, convertImportedEntry, unconvertedSummary } from './currency.js';
// proGate.js has no imports of its own, so this cannot cycle back. It is
// concatenated after this file in the bundle, which is fine: quickOfferLimit is
// a hoisted function declaration and is only called at save time.
import { quickOfferLimit } from './components/proGate.js';

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
    // The named lead pipeline. A different kind of thing from leads.entries
    // above, which are bulk counters ("50 leads from the webinar"). One row here
    // is one real person with a name, a stage and a follow-up date.
    //
    // They are ADDITIVE to leads.entries, not a replacement — the funnel already
    // sums two sources (bulk entries and monthly snapshots) and this is a third.
    // See getFunnelInsights for the split it hands back so the screens can show
    // where each number came from.
    contacts: [], // Array of { id, name, source, offer, value, stage, reached, followUpDate, notes }
    metrics: [], // Array of { id, date, traffic, calls, social }
    settings: {
        currency: '$',
        // The user's own name for each product a processor reports, keyed by
        // productKeyFor(): { 'stripe:id:prod_X': 'CEO Planner' }. An empty
        // string means "keep the processor's name", stored rather than deleted
        // so a decided product is not asked about again. See importedSales.js.
        productOffers: {},
        // Rates for turning imported foreign sales into `currency`, keyed by the
        // processor's ISO code: { USD: { rate: 0.79, base: 'GBP' } }.
        //
        // Set by hand in Settings and deliberately never fetched from an FX API
        // — no external dependency, no rates moving underneath a report that has
        // already been sent. An absent or stale-based rate means the sale is
        // flagged and excluded from totals, never estimated. See js/currency.js.
        conversionRates: {}
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
    // Which weekly plan each day's tasks were built from, as { "2023-11-20": "planId" }.
    // Without it there is no way to tell a day's tasks are stale: rewriting the
    // week's plan on a Monday left that morning's Daily 3 sitting there, still
    // showing the actions from the plan the user had just replaced.
    dailyLogSources: {},
    streak: 0, // Friday Review Streak
    planningStreak: 0, // Monday Plan Streak
    draftMondayPlan: null, // AI generated plan waiting for Monday
    notes: [], // Array of { id, text, date }
    // The coach conversation, kept across page loads on Pro. Display messages
    // only: the system prompt is rebuilt from live data on every call and is
    // deliberately never stored, or a returning user would get answers about
    // last month's numbers.
    coachChat: [], // Array of { role: 'user'|'assistant', content, at }
    setupChecklist: [], // Array of one-time setup tasks
    redFlags: [], // Array of leading indicators
    monthlyThemes: { month1: '', month2: '', month3: '' },
    // What the Monday email would say, rebuilt at most hourly while the app
    // is open. The cron cannot run the app's maths, so the app leaves it ready.
    digestSnapshot: null,
    // The coach's written read on the quarter, as generated on the Revenue
    // screen. { text, at, quarterStartDate } or null. See saveAiReport().
    aiReport: null
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
                contacts: parsed.contacts || [],
                settings: { ...defaultState.settings, ...(parsed.settings || {}) },
                metrics: parsed.metrics || [],
                quarterStartDate: parsed.quarterStartDate || '',
                pastQuarters: parsed.pastQuarters || [],
                weeklyPlans: parsed.weeklyPlans || [],
                reviews: parsed.reviews || [],
                monthlyReviews: parsed.monthlyReviews || [],
                dailyLogs: parsed.dailyLogs || {},
                dailyLogSources: parsed.dailyLogSources || {},
                draftMondayPlan: parsed.draftMondayPlan || null,
                notes: parsed.notes || [],
                coachChat: parsed.coachChat || [],
                setupChecklist: parsed.setupChecklist || [],
                redFlags: parsed.redFlags || [],
                monthlyThemes: parsed.monthlyThemes || { month1: '', month2: '', month3: '' },
                digestSnapshot: parsed.digestSnapshot || null
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
    // Base holds three, Pro holds as many as it adds. The cap is on *adding*,
    // not on holding: `existing` keeps an account that drops back to base from
    // silently losing its fourth and fifth offers the next time it saves this
    // form. It only ever ratchets down — clear a grandfathered offer's name and
    // the room it occupied goes with it.
    const existing = store.revenue?.quickOffers?.length || 0;
    store.revenue.quickOffers = offers.slice(0, Math.max(quickOfferLimit(), existing));
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

// Combine manually logged sales with ones imported from a payment processor.
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
function mergeImportedSales(manualEntries, importedEntries, store) {
    if (!importedEntries || importedEntries.length === 0) return manualEntries;

    // Convert BEFORE anything else looks at an amount.
    //
    // Order matters here and is not obvious. The duplicate check below compares
    // imported amounts against hand-logged ones, and hand-logged amounts are
    // always in the user's own currency — so comparing an unconverted $17
    // against a logged £17 would call them the same sale. Converting first puts
    // both sides in one currency before any comparison is made.
    //
    // A sale in a currency with no rate set comes back with amount 0 and
    // `needsRate`, so it is excluded from every total rather than guessed at.
    // See js/currency.js for why that is the right failure.
    // Then the user's own name for what was sold, so imported sales group with
    // hand-logged ones instead of forming a parallel set of offer names that
    // never add up together. Same read-time principle as the conversion above:
    // the mapping lives in settings and can change, so it is applied on the way
    // out rather than written into rows the processor owns.
    const base = baseCurrencyCode(store);
    const offerMap = (store.settings && store.settings.productOffers) || {};
    const converted = importedEntries
        .map(e => convertImportedEntry(e, base, store))
        .map(e => applyProductOffer(e, offerMap));

    const DAY = 24 * 60 * 60 * 1000;
    const manualStamps = manualEntries.map(e => ({
        time: new Date(e.date).getTime(),
        amount: parseFloat(e.amount) || 0
    }));

    const flagged = converted.map(imported => {
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

// ---------------------------------------------------------------------------
// The named lead pipeline (Pro item 2)
// ---------------------------------------------------------------------------
//
// Stages, in the order a deal actually travels. `lost` is at the end of the
// list because that is where it belongs on screen, but it is an EXIT, not a
// further step — see stageRank below, which deliberately gives it no rank.
export const PIPELINE_STAGES = [
    { key: 'lead', label: 'Lead', hint: 'In touch, nothing booked yet' },
    { key: 'call-booked', label: 'Call booked', hint: 'A conversation is in the diary' },
    { key: 'proposal', label: 'Proposal sent', hint: 'They have your offer and a price' },
    { key: 'won', label: 'Won', hint: 'They said yes' },
    { key: 'lost', label: 'Lost', hint: 'Not this time' }
];

// The stages where a deal is still live, so still worth a follow-up.
export const PIPELINE_OPEN_STAGES = ['lead', 'call-booked', 'proposal'];

// Where a lead or a sale came from, in ONE place. The Revenue sale form and the
// pipeline both render this list, because they both feed getChannelFunnel(),
// which groups channels by matching the text. Two lists meant "IG Story" typed
// in one place and "Instagram" picked in the other became two rows in "Which
// Channel Earns" — the alias-flagging code in getChannelFunnel exists to paper
// over exactly that. A shared list removes the cause.
//
// "Other" stays last and is deliberately vague: it is better than someone
// abandoning the form because their channel isn't listed.
export const CONTACT_SOURCES = [
    'Instagram', 'Facebook', 'X', 'Email', 'Live Session', 'DM Conversation',
    'Referral', 'Website', 'TikTok', 'YouTube', 'Other'
];

// How likely this one is to land. Weights are for the forecast only.
//
// Deliberately NOT carrying "Won" and "Lost" as options, though the spreadsheet
// this was modelled on does. An outcome is not a probability: a deal that is won
// belongs at the Won stage, and having it in two fields is how a row ends up
// reading "stage: Lead Generation, probability: Won, status: Contacted" — three
// fields telling three different stories about one deal.
export const PIPELINE_PROBABILITIES = [
    { key: 'high', label: 'High', weight: 0.8 },
    { key: 'medium', label: 'Medium', weight: 0.5 },
    { key: 'low', label: 'Low', weight: 0.25 }
];

// null, not a default weight, when nothing has been chosen. Guessing "medium"
// for every unset deal would produce a forecast built mostly out of assumptions
// while looking exactly like one built out of answers.
export function probabilityWeight(key) {
    const found = PIPELINE_PROBABILITIES.find(p => p.key === key);
    return found ? found.weight : null;
}

// The last day of the active 90-day quarter, or null if no quarter has started.
//
// 90 days, matching the product's own language ("your 90-day plan"), not the 84
// that 12 weeks comes to. The pace maths in getRevenueInsights divides by 12
// weeks; this window is six days longer. That is deliberate for a forecast —
// dropping a deal expected on day 88 out of "expected this quarter" would be
// wrong in the direction that matters.
export function getQuarterEnd(store) {
    const start = store?.quarterStartDate ? new Date(store.quarterStartDate) : null;
    if (!start || !Number.isFinite(start.getTime())) return null;
    const end = new Date(start);
    end.setDate(end.getDate() + 90);
    return end;
}

// How long without a stage change before a live deal counts as gone quiet.
export const PIPELINE_COLD_DAYS = 14;

// The forward ladder only. `lost` returns -1 on purpose: losing a deal is not
// progress past "proposal sent", and ranking it as such would make moving
// something to Lost wipe the record that a call ever happened.
function stageRank(stage) {
    const rank = { 'lead': 0, 'call-booked': 1, 'proposal': 2, 'won': 3 };
    return rank[stage] === undefined ? -1 : rank[stage];
}

export function isValidStage(stage) {
    return PIPELINE_STAGES.some(s => s.key === stage);
}

// A contact's `reached` map records the first time it entered each stage, and is
// what the funnel counts calls from. It has to be separate from the current
// stage: a deal that is now Won still had a call booked on the way, and counting
// calls from the current stage alone would erase every call the moment it closed.
//
// Moving BACKWARDS down the forward ladder clears the marks above the new stage.
// That is the correction path — mis-click "Won", drag it back to "Proposal", and
// the close stops counting. Without it there would be no way to undo a mistake.
function applyStageChange(contact, nextStage) {
    contact.reached = contact.reached || {};

    const nextRank = stageRank(nextStage);
    if (nextRank >= 0) {
        const highestReached = Math.max(
            stageRank(contact.stage),
            ...Object.keys(contact.reached).map(stageRank)
        );
        if (nextRank < highestReached) {
            Object.keys(contact.reached).forEach(key => {
                if (stageRank(key) > nextRank) delete contact.reached[key];
            });
        }
        // Only the stages past "lead" are worth marking — every contact starts
        // there, so a mark on it would say nothing.
        if (nextRank > 0 && !contact.reached[nextStage]) {
            contact.reached[nextStage] = new Date().toISOString();
        }
    }

    contact.stage = nextStage;
    contact.stageChangedAt = new Date().toISOString();
}

export function addContact(contact) {
    const store = getStore();
    store.contacts = store.contacts || [];

    const now = new Date().toISOString();
    const entry = {
        id: 'c_' + Date.now().toString(),
        name: String(contact.name || '').trim(),
        source: String(contact.source || '').trim(),
        offer: String(contact.offer || '').trim(),
        value: parseFloat(contact.value) || 0,
        // When you expect it to land, which is a different question from when to
        // chase. Close date drives the forecast; follow-up date drives the
        // nudge, and a deal can easily have one and not the other.
        closeDate: contact.closeDate || '',
        probability: probabilityWeight(contact.probability) === null ? '' : contact.probability,
        // The short "what happens next", kept out of Notes on purpose. Notes is
        // where everything ends up; this is the one line you act on.
        nextSteps: String(contact.nextSteps || '').trim(),
        followUpDate: contact.followUpDate || '',
        notes: String(contact.notes || '').trim(),
        createdAt: now,
        stageChangedAt: now,
        reached: {},
        stage: 'lead'
    };

    // A contact can be added straight into a later stage — plenty of people
    // start using this with a proposal already out. Routed through the same
    // function as every other move so the reached marks are set once, in one
    // place.
    const startStage = isValidStage(contact.stage) ? contact.stage : 'lead';
    applyStageChange(entry, startStage);

    store.contacts.push(entry);
    saveStore(store);
    return entry;
}

export function updateContact(id, changes) {
    const store = getStore();
    const contact = (store.contacts || []).find(c => String(c.id) === String(id));
    if (!contact) return null;

    ['name', 'source', 'offer', 'notes', 'nextSteps'].forEach(field => {
        if (changes[field] !== undefined) contact[field] = String(changes[field]).trim();
    });
    if (changes.value !== undefined) contact.value = parseFloat(changes.value) || 0;
    if (changes.followUpDate !== undefined) contact.followUpDate = changes.followUpDate || '';
    if (changes.closeDate !== undefined) contact.closeDate = changes.closeDate || '';
    if (changes.probability !== undefined) {
        // An unrecognised value clears rather than sticking. Better an admitted
        // blank in the forecast than a weight nothing can explain.
        contact.probability = probabilityWeight(changes.probability) === null ? '' : changes.probability;
    }

    if (changes.stage !== undefined && isValidStage(changes.stage) && changes.stage !== contact.stage) {
        applyStageChange(contact, changes.stage);
    }

    saveStore(store);
    return contact;
}

export function deleteContact(id) {
    const store = getStore();
    const initialLen = (store.contacts || []).length;
    store.contacts = (store.contacts || []).filter(c => String(c.id) !== String(id));
    saveStore(store);
    return store.contacts.length < initialLen;
}

// The board's own shape: who sits in which column, who is due, who has gone
// quiet, and what the live pipeline is worth.
//
// ⚠️ This function computes NO conversion rates and no funnel totals. Leads,
// calls, closes and every rate between them come from getFunnelInsights, which
// is the single source for all of it — the Revenue screen, the AI coach and the
// executive report already read from there, and a second set of maths in here
// would be a fourth opinion on numbers the app has spent three sessions getting
// to agree. If the pipeline screen needs a rate, call getFunnelInsights.
export function getPipelineInsights() {
    const store = getStore();
    const contacts = store.contacts || [];
    const today = getLocalDateString();

    const byStage = {};
    PIPELINE_STAGES.forEach(s => { byStage[s.key] = []; });

    const coldCutoff = Date.now() - (PIPELINE_COLD_DAYS * 24 * 60 * 60 * 1000);

    const quarterEnd = getQuarterEnd(store);
    const quarterEndKey = quarterEnd ? getLocalDateString(quarterEnd) : null;
    const quarterStartKey = store.quarterStartDate
        ? getLocalDateString(new Date(store.quarterStartDate))
        : null;

    const decorated = contacts.map(c => {
        const stage = isValidStage(c.stage) ? c.stage : 'lead';
        const isOpen = PIPELINE_OPEN_STAGES.includes(stage);
        const movedAt = new Date(c.stageChangedAt || c.createdAt).getTime();
        const weight = probabilityWeight(c.probability);
        const value = parseFloat(c.value) || 0;

        return {
            ...c,
            stage,
            isOpen,
            // Only live deals can be overdue or go quiet. A won deal sitting
            // untouched for a month is finished business, not a warning.
            followUpDue: !!(isOpen && c.followUpDate && c.followUpDate <= today),
            // The date you said it would land has passed and it hasn't. Worth
            // saying out loud — it is the difference between a pipeline and a
            // list of hopeful names.
            closeOverdue: !!(isOpen && c.closeDate && c.closeDate < today),
            closesThisQuarter: !!(
                isOpen && c.closeDate && quarterStartKey && quarterEndKey &&
                c.closeDate >= quarterStartKey && c.closeDate <= quarterEndKey
            ),
            weight,
            // null, never 0, when no confidence has been set. Zero would read as
            // "worth nothing" in a total that is meant to say "not estimated".
            weightedValue: weight === null ? null : value * weight,
            isCold: !!(isOpen && Number.isFinite(movedAt) && movedAt < coldCutoff),
            daysSinceMove: Number.isFinite(movedAt)
                ? Math.floor((Date.now() - movedAt) / (24 * 60 * 60 * 1000))
                : null
        };
    });

    decorated.forEach(c => { byStage[c.stage].push(c); });

    // Newest movement first inside each column, so the deal you touched this
    // morning is at the top of the one you are looking at.
    Object.keys(byStage).forEach(key => {
        byStage[key].sort((a, b) =>
            new Date(b.stageChangedAt || b.createdAt) - new Date(a.stageChangedAt || a.createdAt));
    });

    const open = decorated.filter(c => c.isOpen);
    const weighted = open.filter(c => c.weightedValue !== null);
    const inQuarter = open.filter(c => c.closesThisQuarter);
    const inQuarterWeighted = inQuarter.filter(c => c.weightedValue !== null);

    const followUpsDue = decorated
        .filter(c => c.followUpDue)
        .sort((a, b) => String(a.followUpDate).localeCompare(String(b.followUpDate)));
    const closeOverdue = decorated
        .filter(c => c.closeOverdue && !c.followUpDue)
        .sort((a, b) => String(a.closeDate).localeCompare(String(b.closeDate)));
    const goneQuiet = decorated
        .filter(c => c.isCold && !c.followUpDue && !c.closeOverdue)
        .sort((a, b) => (b.daysSinceMove || 0) - (a.daysSinceMove || 0));

    return {
        contacts: decorated,
        byStage,
        total: decorated.length,
        openCount: open.length,
        // ⚠️ Every money figure below is money that MIGHT arrive, and none of it
        // is added to any revenue figure anywhere. The Revenue screen, the
        // quarter progress and the projection report money that did arrive; a
        // forecast leaking into those would undo the batch 2 projection fix.
        //
        // What the live pipeline is worth if every open deal lands.
        openValue: open.reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0),
        // The same thing discounted by how likely each one is. Only deals with a
        // confidence set are in it, because a forecast padded out with assumed
        // weights looks identical to one built from real answers.
        weightedValue: weighted.reduce((sum, c) => sum + c.weightedValue, 0),
        weightedCount: weighted.length,
        // The open deals with no confidence set, so the UI can admit the gap
        // rather than quietly leaving them out of the number.
        unweightedCount: open.length - weighted.length,
        unweightedValue: open
            .filter(c => c.weightedValue === null)
            .reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0),
        // Expected to land before the 90 days are up, weighted. This is the one
        // that answers "how much of my goal is already in motion".
        expectedThisQuarter: inQuarterWeighted.reduce((sum, c) => sum + c.weightedValue, 0),
        expectedThisQuarterCount: inQuarter.length,
        // Open deals carrying no close date at all, so nothing pretends the
        // forecast covers the whole pipeline when it covers part of it.
        noCloseDateCount: open.filter(c => !c.closeDate).length,
        followUpsDue,
        closeOverdue,
        goneQuiet,
        // The one list to act on, already de-duplicated and in priority order:
        // you said you'd chase them, then the date they were meant to land has
        // passed, then they simply went quiet.
        needsYou: [...followUpsDue, ...closeOverdue, ...goneQuiet]
    };
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
    return summariseFunnel(store.leads?.entries, store.metrics, store.contacts);
}

// The funnel maths itself, over whichever three lists it is handed.
//
// Split out from getFunnelInsights so an ARCHIVED quarter can be counted by the
// identical rules (see getQuarterHistory). A second implementation for history
// would have been the fourth opinion this function exists to prevent — and the
// disagreement would have been invisible, because the two datasets are never on
// screen at the same moment except on the comparison screen, where it would
// look like the business changed rather than like the code did.
export function summariseFunnel(leadEntries, metricEntries, contactList) {
    const leads = leadEntries || [];
    const metrics = metricEntries || [];
    const contacts = contactList || [];

    const snapshotTraffic = metrics.reduce((s, m) => s + (parseFloat(m.traffic) || 0), 0);
    const snapshotCalls = metrics.reduce((s, m) => s + (parseFloat(m.calls) || 0), 0);
    const snapshotCloses = metrics.reduce((s, m) => s + (parseFloat(m.closes) || 0), 0);
    const leadCalls = leads.reduce((s, l) => s + (parseFloat(l.calls) || 0), 0);
    const leadCloses = leads.reduce((s, l) => s + (parseFloat(l.closes) || 0), 0);
    const bulkLeads = leads.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

    // The named pipeline is the third source, sitting alongside the bulk lead
    // entries and the monthly snapshots that this function already summed.
    //
    // One contact is one lead. A call counts once the contact has ever REACHED
    // "call booked" — reading the current stage instead would delete every call
    // the moment a deal closed. A close counts from the CURRENT stage being
    // "won", which is what makes moving a mis-clicked win back undo it.
    const contactLeads = contacts.length;
    const contactCalls = contacts.filter(c => c.reached && c.reached['call-booked']).length;
    const contactCloses = contacts.filter(c => c.stage === 'won').length;

    const totalLeads = bulkLeads + contactLeads;
    const totalCalls = snapshotCalls + leadCalls + contactCalls;
    const totalCloses = snapshotCloses + leadCloses + contactCloses;

    const anyClosesEverLogged =
        leads.some(l => (parseFloat(l.closes) || 0) > 0) ||
        metrics.some(m => (parseFloat(m.closes) || 0) > 0) ||
        contactCloses > 0;

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
        // The split, so a screen showing "62 leads" can say where the 62 came
        // from. Two sources adding up is only confusing when it is invisible.
        bulkLeads,
        contactLeads,
        contactCalls,
        contactCloses,
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
    const contacts = store.contacts || [];
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

    // Named contacts break down by channel on exactly the rules getFunnelInsights
    // uses — one lead each, a call once "call booked" was ever reached, a close
    // while the current stage is "won". They are counted here as well as there
    // because the two have to agree: a per-channel table that excluded the
    // pipeline would quietly total less than the funnel card above it.
    contacts.forEach(c => {
        const key = normalise(c.source) || '__unattributed__';
        const label = key === '__unattributed__' ? NOT_ATTRIBUTED : String(c.source).trim();
        const r = bucket(key, label);
        r.leads += 1;
        if (c.reached && c.reached['call-booked']) r.calls += 1;
        if (c.stage === 'won') {
            r.closes += 1;
            r.hasClosesLogged = true;
        }
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

// ---------------------------------------------------------------------------
// Which plan is "this week's"? (Pro item 7)
// ---------------------------------------------------------------------------
//
// This block was copy-pasted in three places before it lived here: twice in
// dashboard.js and once in weeklyPlanner.js, byte for byte. A fourth copy was
// about to be written for the weekly digest, so it became one function instead.
//
// The rule: the newest plan that is either hand-written or an APPLIED generated
// one, discarded if it is more than 7 days old. Unapplied generated drafts are
// deliberately ignored, because a roadmap week nobody has accepted is not what
// the user is actually working on.
//
// Callers keep their own fallback for the null case, because they disagree
// about it on purpose. The planner pre-fills from the next unapplied week; the
// digest wants the roadmap week matching TODAY (see buildDigestSnapshot).
export function getActivePlan(store = getStore()) {
    const valid = (store.weeklyPlans || []).filter(p => !p.generated || p.applied);
    valid.sort((a, b) => new Date(a.date) - new Date(b.date));
    const newest = valid.length > 0 ? valid[valid.length - 1] : null;
    if (!newest) return null;

    const diffDays = Math.ceil(Math.abs(new Date() - new Date(newest.date)) / (1000 * 60 * 60 * 24));
    return diffDays > 7 ? null : newest;
}

// ---------------------------------------------------------------------------
// The weekly digest snapshot (Pro item 7)
// ---------------------------------------------------------------------------
//
// What the Monday email says, worked out HERE and stored as finished strings.
//
// The edge function that sends the email does no maths and no formatting. It
// forwards these values to Loops exactly as written. That is the whole design:
// every figure comes from getRevenueInsights(), every currency string from
// formatAmount() and settings.currency, so the email can never disagree with
// the screen. If you find yourself calculating something in the edge function,
// it belongs here instead.
//
// The PLAN half comes from the 90-day roadmap when the user has not written
// their own week, which means it does not go stale: week 7's actions are week
// 7's actions however long ago they last opened the app. Only the numbers
// carry an "as of" caveat.

// Rotated on the week number rather than at random, so what was sent to a given
// person in a given week can always be worked out afterwards. Four against a
// twelve week quarter means each lands exactly three times, never twice running.
const DIGEST_NUDGES = [
    'If the week goes sideways and only one of those gets done, make it the first one. That is the whole reason it is first.',
    'Three is the number on purpose. A list of ten is a wish, a list of three is a week.',
    'If Friday arrives and only the first one is done, that was still a good week.',
    'Nothing on that list needs to be perfect. It needs to be done.'
];

// Deliberately NOT rotated. It is a factual caveat, and varying a caveat's
// wording makes it read as copywriting rather than as fact.
const DIGEST_FRESHNESS =
    'Your plan above is current. The figures are only as recent as your last visit.';

// Blank slots are shown, not hidden. Loops cannot drop a section, and in a
// re-engagement email this reads as a prompt rather than as a failure.
const DIGEST_GAP = 'Not set yet. Open the planner and fill this one in.';

function digestText(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text === '' ? DIGEST_GAP : text;
}

export function buildDigestSnapshot(store = getStore()) {
    const currency = store.settings?.currency || '$';
    const weekNumber = getWeeksElapsed(store) || 1;

    // A week the user wrote or applied beats one generated for them.
    let plan = getActivePlan(store);
    let planIntro = 'Here is the week you set for yourself.';

    if (!plan) {
        // The roadmap week for where they are RIGHT NOW, by date. Deliberately
        // not "the next unapplied week": somebody who skipped applying weeks 2
        // to 6 would be sent week 2's actions while living in week 7.
        plan = (store.weeklyPlans || []).find(p => p.generated && p.weekNumber === weekNumber) || null;
        planIntro = 'Here is week ' + weekNumber + ' of your 90 day plan.';
    }

    const actions = (plan && Array.isArray(plan.topActions)) ? plan.topActions : [];
    const insights = getRevenueInsights();
    const money = (value) => currency + formatAmount(value);

    // "Not enough data" is the one momentum value that does not read as a
    // sentence, so it gets its own wording rather than being forced into one.
    const momentumLine = (!insights.momentum || insights.momentum === 'Not enough data')
        ? 'There is not enough logged yet to call your pace either way.'
        : 'Momentum is ' + insights.momentum.replace(' \u{1F389}', '').toLowerCase() + '.';

    return {
        // The server refuses to send when this is false, so it has to mean
        // "there is a real plan here", not merely "a plan object exists".
        hasPlan: !!plan,
        takenAt: new Date().toISOString(),
        weekNumber,

        planIntro,
        winCondition: digestText(plan?.winCondition),
        action1: digestText(actions[0]),
        action2: digestText(actions[1]),
        action3: digestText(actions[2]),
        revenueAction: digestText(plan?.revenueAction),
        visibilityAction: digestText(plan?.visibilityAction),
        followUpAction: digestText(plan?.followUps),
        priorityNudge: DIGEST_NUDGES[weekNumber % DIGEST_NUDGES.length],

        revenueSoFar: money(insights.totalRevenue),
        quarterGoal: money(insights.goal),
        quarterProgress: Math.round(insights.progressPercent) + '%',
        momentumLine,
        freshnessNote: DIGEST_FRESHNESS,

        appUrl: 'https://app.thewomensentrepreneurialnetwork.com/#/weekly'
    };
}

// Refresh the stored snapshot, at most once an hour.
//
// The rate limit is the point: saveStore() upserts the WHOLE store to Supabase
// on every call, so rebuilding this on each render would turn one page visit
// into a stream of writes. An hour is far fresher than a weekly email needs.
export function refreshDigestSnapshot() {
    const store = getStore();
    const previous = store.digestSnapshot;

    if (previous && previous.takenAt) {
        const age = Date.now() - new Date(previous.takenAt).getTime();
        if (Number.isFinite(age) && age >= 0 && age < 60 * 60 * 1000) return previous;
    }

    const snapshot = buildDigestSnapshot(store);
    store.digestSnapshot = snapshot;
    saveStore(store);
    return snapshot;
}

export function getRevenueInsights() {
    const store = getStore();
    const rev = store.revenue;
    const goal = parseFloat(rev.quarterlyGoal) || 0;
    const price = parseFloat(rev.averageOfferPrice) || 0;

    // Every entry ever logged. The pipeline feed, the history chart and the CSV
    // export all need the full list, so this stays unfiltered.
    //
    // Sales imported from Stripe or PayPal are merged in here rather than written
    // into the store, so a sync can never overwrite something the user typed.
    // Merging at this single point means the totals, the quarter progress, the
    // conversion rates, the CSV export and the AI Coach's context all pick them
    // up without each needing to know the feature exists.
    const entries = mergeImportedSales(rev.entries || [], getImportedSalesCache(), store);

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

    // The same question at the two horizons a founder can actually act on. Each
    // is rounded up from that period's own share of the revenue goal rather
    // than by dividing salesRequired, because a third of "5 sales" is not a
    // number anyone can go and sell. Rounding up per period means the weekly
    // figure can total slightly above the quarter, which is the right way round:
    // it is a floor to clear, not a budget to spend.
    const salesRequiredPerMonth = price > 0 ? Math.ceil((goal / 3) / price) : 0;
    const salesRequiredPerWeek = price > 0 ? Math.ceil((goal / 12) / price) : 0;

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
        salesRequiredPerMonth,
        salesRequiredPerWeek,
        salesMade,
        salesRemaining: Math.max(0, salesRequired - salesMade),
        // Whether the sales maths can be shown at all. Without an average offer
        // price every figure above is 0, and a card reading "0 sales a week to
        // hit your goal" is worse than no card.
        hasOfferPrice: price > 0,
        averageOfferPrice: price,
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
        // Imported sales in a currency with no conversion rate set. They are
        // counted as zero in every figure above — deliberately, because a
        // guessed rate produces a total that is confidently wrong, which is
        // worse than an admitted gap.
        //
        // Computed here rather than on the Revenue screen so that the screen
        // showing the warning and the maths acting on it can never disagree
        // about how many sales are affected. [[read-from-single-source]]
        //
        // [{ code, symbol, count, originalTotal }], commonest currency first.
        unconvertedSales: unconvertedSummary(entries),
        // The entries themselves, for anything that needs to break the quarter
        // down rather than total it. `entries` above is every sale ever logged,
        // so a breakdown built from it produces shares that do not divide into
        // totalRevenue — which is how the branded report would have printed a
        // source table adding up to more than the quarter it was reporting on.
        quarterEntries,
        entries: entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date)) // newest first
    };
}

// ---------------------------------------------------------------------------
// Quarter history (Pro item 3)
// ---------------------------------------------------------------------------
//
// Every quarter the user has finished, plus the one in progress, described in
// one shape so they can be put side by side.
//
// Two rules run through all of this:
//
// 1. The CURRENT quarter's figures are read from getRevenueInsights() and
//    getFunnelInsights(), never recalculated here. If this screen worked out its
//    own total for the quarter in progress, it would eventually disagree with
//    the Revenue screen about the same 90 days, and the user would have no way
//    to tell which number was the real one.
// 2. An ARCHIVED quarter is counted by those same functions' rules, via
//    summariseFunnel and the helpers below, rather than by a second set written
//    for history. Same maths, different dataset.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The revenue entries that belong to a quarter, on the rule getRevenueInsights
// uses for the live one: anything dated before the quarter began is money that
// arrived, but not money that quarter earned. Back-entered history counted in
// full would make a quarter look like it beat one it never touched.
function entriesInQuarter(entries, startISO) {
    const list = entries || [];
    const start = startISO ? new Date(startISO) : null;
    if (!start || !Number.isFinite(start.getTime())) return list;
    return list.filter(e => new Date(e.date).getTime() >= start.getTime());
}

function sumAmounts(entries) {
    return (entries || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
}

// Biggest key in a { name: amount } map, or 'None'. Same answer the topSource /
// topOffer reducers in getRevenueInsights give, so a past quarter's top channel
// is picked the way the live one's is.
function topKeyOf(totals) {
    const keys = Object.keys(totals);
    if (keys.length === 0) return 'None';
    return keys.reduce((a, b) => (totals[a] > totals[b] ? a : b));
}

function totalsBy(entries, field, fallback) {
    const totals = {};
    (entries || []).forEach(e => {
        const key = e[field] || fallback;
        totals[key] = (totals[key] || 0) + (parseFloat(e.amount) || 0);
    });
    return totals;
}

// "16 May – 14 Aug 2026", or "16 May 2026 – in progress" for the live one.
export function quarterRangeLabel(startISO, endISO) {
    const opts = { day: 'numeric', month: 'short' };
    const start = startISO ? new Date(startISO) : null;
    const end = endISO ? new Date(endISO) : null;
    const startOk = start && Number.isFinite(start.getTime());
    const endOk = end && Number.isFinite(end.getTime());

    if (!startOk && !endOk) return 'Dates not recorded';
    if (!startOk) return `Ended ${end.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`;

    const startText = start.toLocaleDateString(undefined, {
        ...opts,
        // Drop the year off the start when both ends share one — "16 May – 14
        // Aug 2026" rather than the same year printed twice.
        year: endOk && end.getFullYear() === start.getFullYear() ? undefined : 'numeric'
    });
    if (!endOk) return `${start.toLocaleDateString(undefined, { ...opts, year: 'numeric' })} – in progress`;
    return `${startText} – ${end.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`;
}

// What a quarter had earned by day N of it. This is the only honest way to
// compare a quarter five weeks in against one that ran the full ninety days —
// the alternative is telling someone they are 60% down on last quarter when
// what they actually are is five weeks into this one.
function revenueByDay(entries, startISO, days) {
    const start = startISO ? new Date(startISO) : null;
    if (!start || !Number.isFinite(start.getTime())) return null;
    const cutoff = start.getTime() + days * MS_PER_DAY;
    return sumAmounts((entries || []).filter(e => {
        const t = new Date(e.date).getTime();
        return Number.isFinite(t) && t >= start.getTime() && t < cutoff;
    }));
}

// A change between two quarters. `percent` is null rather than 0 when there is
// nothing to divide by: going from nothing to £2,000 is not a 100% rise, and
// printing one would be inventing a baseline that never existed.
function changeBetween(now, before) {
    const delta = now - before;
    return {
        delta,
        percent: before > 0 ? (delta / before) * 100 : null,
        direction: delta > 0 ? 'up' : (delta < 0 ? 'down' : 'level')
    };
}

// One archived quarter, summarised. `previous` is the archive entry before it,
// needed only to work out how many Friday Reviews belong to this quarter.
function summariseArchivedQuarter(quarter, ordinal, previous) {
    const startISO = quarter.quarterStartDate || '';
    const endISO = quarter.dateArchived || '';
    const allEntries = quarter.revenueEntries || [];
    const quarterEntries = entriesInQuarter(allEntries, startISO);
    const revenue = sumAmounts(quarterEntries);
    const goal = parseFloat(quarter.revenueGoal) || 0;
    const funnel = summariseFunnel(quarter.leadEntries, quarter.metrics, quarter.contacts);

    // ⚠️ reviewsCount in the archive is store.reviews.length AT THE TIME, and
    // reviews are deliberately never cleared on reset — so it is a running
    // total, not this quarter's count. Differencing consecutive archives is what
    // turns it back into "reviews done in these ninety days". plansCount needs
    // no such correction: weeklyPlans IS cleared each quarter, and the archived
    // array is the quarter's own.
    const reviewsBefore = previous ? (previous.reviewsCount || 0) : 0;
    const reviewsCount = Math.max(0, (quarter.reviewsCount || 0) - reviewsBefore);

    return {
        ordinal,
        id: endISO || `quarter-${ordinal}`,
        isCurrent: false,
        startDate: startISO,
        endDate: endISO,
        label: `Quarter ${ordinal}`,
        rangeLabel: quarterRangeLabel(startISO, endISO),
        focus: quarter.goals?.focus || '',
        outcome: quarter.goals?.outcome || '',
        revenue,
        goal,
        progressPercent: goal > 0 ? (revenue / goal) * 100 : null,
        salesCount: quarterEntries.length,
        // Money logged against dates before this quarter opened. Excluded from
        // the figures above for the reason in entriesInQuarter, and reported so
        // a quarter never looks like it lost something.
        revenueBeforeQuarter: sumAmounts(allEntries) - revenue,
        topSource: topKeyOf(totalsBy(quarterEntries, 'source', 'Other')),
        topOffer: topKeyOf(totalsBy(quarterEntries, 'offer', 'General')),
        leads: funnel.totalLeads,
        calls: funnel.totalCalls,
        closes: funnel.totalCloses,
        callCloseRate: funnel.callCloseRate,
        contactLeads: funnel.contactLeads,
        reviewsCount,
        plansCount: (quarter.weeklyPlans || []).length,
        reflection: quarter.reflection || null,
        // Kept for the same-point comparison, which needs the raw dated rows.
        entries: allEntries
    };
}

// Every quarter, oldest first, with the one in progress last.
//
// Returns { quarters, current, previous, hasHistory, years }. Each quarter
// carries `change`, its movement against the quarter before it, so a screen
// renders the comparison rather than working it out.
export function getQuarterHistory() {
    const store = getStore();

    // pastQuarters is appended to, so it is already chronological. Sorted
    // anyway: a store restored from a sync, or hand-edited, is not guaranteed
    // to be, and the ordinals and every delta below depend on the order.
    const archived = (store.pastQuarters || []).slice().sort((a, b) => {
        const at = new Date(a.dateArchived || a.quarterStartDate || 0).getTime();
        const bt = new Date(b.dateArchived || b.quarterStartDate || 0).getTime();
        return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
    });

    const quarters = archived.map((q, i) => summariseArchivedQuarter(q, i + 1, archived[i - 1]));

    // The quarter in progress. Every figure here is READ from the two functions
    // the rest of the app reads from, so this row and the Revenue screen can
    // never disagree about the ninety days the user is actually living in.
    const insights = getRevenueInsights();
    const funnel = getFunnelInsights();
    const lastArchived = archived[archived.length - 1];
    const daysElapsed = store.quarterStartDate
        ? Math.max(0, Math.floor((Date.now() - new Date(store.quarterStartDate).getTime()) / MS_PER_DAY))
        : null;

    const current = {
        ordinal: quarters.length + 1,
        id: 'current',
        isCurrent: true,
        startDate: store.quarterStartDate || '',
        endDate: '',
        label: 'This quarter',
        rangeLabel: quarterRangeLabel(store.quarterStartDate || '', ''),
        focus: store.goals?.focus || '',
        outcome: store.goals?.outcome || '',
        revenue: insights.totalRevenue,
        goal: insights.goal,
        // Worked out from the same two figures the Revenue screen shows, not
        // read off insights.progressPercent — that one is clamped to 100 for a
        // progress bar's benefit, and a quarter that beat its goal by half
        // deserves to say so when it is being compared with another.
        progressPercent: insights.goal > 0 ? (insights.totalRevenue / insights.goal) * 100 : null,
        salesCount: insights.quarterEntryCount,
        revenueBeforeQuarter: insights.revenueBeforeQuarter,
        topSource: insights.topSource,
        topOffer: insights.topOffer,
        leads: funnel.totalLeads,
        calls: funnel.totalCalls,
        closes: funnel.totalCloses,
        callCloseRate: funnel.callCloseRate,
        contactLeads: funnel.contactLeads,
        // Same differencing as the archived rows, for the same reason.
        reviewsCount: Math.max(0, (store.reviews || []).length - (lastArchived ? (lastArchived.reviewsCount || 0) : 0)),
        plansCount: (store.weeklyPlans || []).length,
        reflection: null,
        entries: insights.entries,
        weeksElapsed: insights.weeksElapsed,
        weeksRemaining: insights.weeksRemaining,
        daysElapsed,
        momentum: insights.momentum,
        projectedRevenue: insights.projectedRevenue
    };

    quarters.push(current);

    // Movement against the quarter before. Attached to each row rather than
    // computed in the screen, so the table and any card built later cannot
    // arrive at two different arrows for the same pair.
    quarters.forEach((q, i) => {
        const before = quarters[i - 1];
        q.change = before ? {
            revenue: changeBetween(q.revenue, before.revenue),
            leads: changeBetween(q.leads, before.leads),
            closes: changeBetween(q.closes, before.closes),
            comparedWith: before.label
        } : null;
    });

    // This quarter against the last one AT THE SAME POINT. Only offered when
    // the previous quarter has a start date to measure from and this one has
    // actually started — an unanswerable comparison is left null rather than
    // guessed at, and the screen says so.
    let samePoint = null;
    const previous = quarters.length > 1 ? quarters[quarters.length - 2] : null;
    if (previous && daysElapsed !== null && previous.startDate) {
        const previousThen = revenueByDay(previous.entries, previous.startDate, daysElapsed + 1);
        if (previousThen !== null) {
            samePoint = {
                daysElapsed,
                weeksElapsed: current.weeksElapsed || Math.max(1, Math.ceil((daysElapsed || 1) / 7)),
                previousLabel: previous.label,
                previousRevenue: previousThen,
                previousFinal: previous.revenue,
                currentRevenue: current.revenue,
                ...changeBetween(current.revenue, previousThen)
            };
        }
    }

    return {
        // Newest first is how they are read, so hand them back that way.
        quarters: quarters.slice().reverse(),
        current,
        previous,
        samePoint,
        hasHistory: archived.length > 0,
        archivedCount: archived.length,
        years: getYearTotals(store, quarters)
    };
}

// Revenue by calendar year.
//
// Counted from the DATE ON EACH SALE, not by which quarter it was archived
// with. A year total answers "what did this business earn in 2026", and a sale
// entered before a 90-day window opened is still money that arrived that year —
// so unlike the quarter columns, nothing is excluded here. The two therefore do
// not always add up, which is why the screen says what this counts.
//
// Deduplicated by id: an imported sale dated inside an archived quarter
// appears in the live merged list as well, and counting it twice would inflate
// the only figure on the screen someone might quote to an accountant.
function getYearTotals(store, quarters) {
    const seen = new Set();
    const years = new Map();

    const add = (entry) => {
        if (entry.id) {
            if (seen.has(entry.id)) return;
            seen.add(entry.id);
        }
        const d = new Date(entry.date);
        if (!Number.isFinite(d.getTime())) return;
        const year = d.getFullYear();
        if (!years.has(year)) years.set(year, { year, revenue: 0, salesCount: 0, quartersFinished: 0 });
        const row = years.get(year);
        row.revenue += parseFloat(entry.amount) || 0;
        row.salesCount += 1;
    };

    (store.pastQuarters || []).forEach(q => (q.revenueEntries || []).forEach(add));
    // The live list, imports merged in by getRevenueInsights.
    (quarters[quarters.length - 1]?.entries || []).forEach(add);

    quarters.forEach(q => {
        if (q.isCurrent || !q.endDate) return;
        const end = new Date(q.endDate);
        if (!Number.isFinite(end.getTime())) return;
        // Creates the row if the year has none. A quarter that earned nothing
        // still happened, and dropping the year would make it look like the
        // business did not exist that year.
        if (!years.has(end.getFullYear())) {
            years.set(end.getFullYear(), { year: end.getFullYear(), revenue: 0, salesCount: 0, quartersFinished: 0 });
        }
        years.get(end.getFullYear()).quartersFinished += 1;
    });

    return Array.from(years.values()).sort((a, b) => b.year - a.year);
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

// `source` identifies the weekly plan the tasks came from, so a later render can
// tell whether they still reflect the current plan. Omit it for tasks that did
// not come from a plan at all.
export function updateDailyLog(dateStr, tasks, source) {
    const store = getStore();
    store.dailyLogs[dateStr] = tasks;

    if (source === undefined) {
        delete store.dailyLogSources[dateStr];
    } else {
        store.dailyLogSources[dateStr] = source;
    }

    saveStore(store);
}

// The identity of a weekly plan, for stamping onto a day's tasks. Plans made in
// the Monday Plan flow have no id unless they came from a generated 90-day plan,
// so fall back to the timestamp, which is rewritten every time the plan is saved.
export function planSourceKey(plan) {
    if (!plan) return undefined;
    return String(plan.id || plan.date || '');
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

// Strips a day label off the front of a generated micro task.
//
// The 90-day plan prompt used to ask for `["Mon-Tue micro task", "Wed-Thu micro
// task", "Fri micro task"]`, so the model dutifully returned "Monday: draft the
// emails". Those strings are stored as `daily3` and dropped straight into the
// Daily 3 boxes on the Monday Plan and the dashboard, where a day name is worse
// than noise: the app already decides which day a task lands on, so a task
// labelled Wednesday sitting in Monday's list contradicts the screen it is on.
//
// The prompt no longer asks for them, but every plan generated before 20 Aug
// 2026 still carries them, which is why this also runs on read.
//
// A separator is required, so "Monday morning call with Sam" — a real task that
// happens to start with a day — is left alone. Only "Monday:", "Mon-Tue —" and
// friends are removed.
const DAY_LABEL = /^\s*(?:mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s*(?:[-–—/&+]|to|and|,)\s*(?:mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday))*\s*[:–—-]\s*/i;

export function stripDayLabel(task) {
    if (typeof task !== 'string') return task;
    const cleaned = task.replace(DAY_LABEL, '').trim();
    if (cleaned === '') return task.trim(); // it was only a label; keep the original rather than emptying the box
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function cleanDaily3(list) {
    if (!Array.isArray(list)) return list;
    return list.map(stripDayLabel);
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
            daily3: cleanDaily3(w.dailyThree),
            successCheck: w.successCheck,
            generated: true,
            applied: false
        });
    });

    saveStore(store);
}

// Which weeks of the roadmap can be rewritten one at a time?
//
// Only generated weeks that have not been applied yet. An applied week is one
// the user pushed into their Weekly Planner and lived through, and the rule the
// whole plan runs on — set in batch 2.2 and honoured by applyGeneratedPlan
// above — is that nothing the user has actually lived through is ever rewritten
// by the app. A week they wrote themselves is not ours to rewrite either.
//
// Returned in week order, because every caller shows them in a list.
export function getRegenerableWeeks() {
    const store = getStore();
    return (store.weeklyPlans || [])
        .filter(p => p.generated && !p.applied && p.weekNumber != null)
        .sort((a, b) => a.weekNumber - b.weekNumber);
}

// Swap one generated week for a freshly written one, leaving the other eleven
// exactly as they are.
//
// Matched on `id` rather than on week number: the store has held two rows with
// the same weekNumber before (an applied one and a generated one), and matching
// on the number would overwrite whichever came first — which could be the
// applied week this feature promises not to touch.
//
// `week` is the shape regenerateOneWeek() returns. Refuses anything that isn't
// an unapplied generated week, and returns true only if a row was actually
// replaced, so the caller never reports success over a no-op.
export function replaceGeneratedWeek(planId, week) {
    if (!week || !week.weeklyFocus) return false;

    const store = getStore();
    const idx = (store.weeklyPlans || []).findIndex(p => String(p.id) === String(planId));
    if (idx === -1) return false;

    const existing = store.weeklyPlans[idx];
    if (!existing.generated || existing.applied) return false;

    // The id and the week's place in the quarter are kept. Everything the model
    // wrote is replaced. `regeneratedAt` is what the roadmap reads to mark the
    // week as rewritten, and it is also the honest answer to "did this work?"
    // when a user asks later why a week looks different from the plan they
    // remember.
    store.weeklyPlans[idx] = {
        ...existing,
        winCondition: week.weeklyFocus,
        topActions: week.topPriorities,
        visibilityAction: week.visibilityAction,
        revenueAction: week.revenueAction,
        followUps: week.followUpAction,
        daily3: cleanDaily3(week.dailyThree),
        successCheck: week.successCheck,
        generated: true,
        applied: false,
        regeneratedAt: new Date().toISOString()
    };

    saveStore(store);
    return true;
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

// --- The coach's memory ------------------------------------------------------
//
// The conversation used to live in `window.ceoChatHistory` and died on refresh,
// so a product sold as a 24/7 board of directors started from nothing several
// times a day.
//
// It lives in the store rather than in its own localStorage key or its own
// table, which buys cross-device sync for free — the store is already upserted
// to `user_data` on every save, so signing in on a laptop picks up a thread
// started on a phone with no new infrastructure at all. The price is that every
// save now carries the conversation with it, which is what the two caps below
// are for. A conversation at both ceilings adds roughly 20KB to a payload that
// already carries a quarter of plans, sales and daily logs.
//
// Only what to KEEP is decided here. How much of it gets sent to the model on
// each turn is a separate, much smaller number — see CHAT_CONTEXT_MESSAGES in
// aiService.js. Storage is cheap; tokens are not.
export const COACH_CHAT_MAX_MESSAGES = 40;
export const COACH_CHAT_MAX_CHARS = 20000;

// Drops the oldest first, so the tail — the part of the conversation you are
// actually still in — is what survives. Both caps apply: the message count
// keeps the array sane, and the character budget stops one very long answer
// from filling the whole allowance on its own.
export function trimCoachChat(messages) {
    let trimmed = (messages || [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content, at: m.at || new Date().toISOString() }))
        .slice(-COACH_CHAT_MAX_MESSAGES);

    let total = trimmed.reduce((sum, m) => sum + m.content.length, 0);
    while (trimmed.length > 1 && total > COACH_CHAT_MAX_CHARS) {
        total -= trimmed[0].content.length;
        trimmed = trimmed.slice(1);
    }

    return trimmed;
}

export function getCoachChat() {
    return getStore().coachChat || [];
}

// Returns what was actually written, not what was handed in. The caller holds
// the same array in memory, and if it keeps every message while the store keeps
// forty, the two drift apart until the next page load quietly shortens the
// conversation.
export function saveCoachChat(messages) {
    const store = getStore();
    store.coachChat = trimCoachChat(messages);
    saveStore(store);
    return store.coachChat;
}

export function clearCoachChat() {
    const store = getStore();
    store.coachChat = [];
    saveStore(store);
}

// The AI Executive Report, kept so it survives closing the modal.
//
// It used to live in a module variable in pdfReport.js, which meant the branded
// report's "Coach's summary" section existed only in the browser session that
// generated it. Close the modal, come back, and the section was silently gone —
// while the feature blurb still said your report came with the write-up. True in
// the session that made it, quietly untrue afterwards.
//
// Stored rather than cached, so it also survives a reload and reaches the user's
// other devices, which the store sync gives for free.
const AI_REPORT_MAX_CHARS = 20000;

export function saveAiReport(text) {
    if (typeof text !== 'string' || !text.trim()) return null;

    const store = getStore();
    store.aiReport = {
        // Capped. The store is one JSON document upserted to Supabase on every
        // save, so an unbounded field on it is everyone's problem, not just the
        // problem of whoever generated a very long report.
        text: text.slice(0, AI_REPORT_MAX_CHARS),
        at: new Date().toISOString(),
        // Which quarter it was written about. This is the honest half of the
        // feature -- see getAiReport().
        quarterStartDate: store.quarterStartDate || ''
    };
    saveStore(store);
    return store.aiReport;
}

// Returns the report only if it is about the quarter the app is currently in.
//
// A summary written in March describes numbers that were archived at the quarter
// reset. Printing it alongside this quarter's figures would put a confident
// narrative next to data it was never about — which is worse than the gap this
// whole change exists to close, because a missing section is obvious and a wrong
// one reads as authoritative.
//
// Checked at read time rather than cleared at reset: one rule, in one place,
// that cannot be missed by some future code path that starts a quarter without
// going through the reset screen.
export function getAiReport() {
    const store = getStore();
    const report = store.aiReport;

    if (!report || typeof report.text !== 'string' || !report.text.trim()) return null;
    if ((report.quarterStartDate || '') !== (store.quarterStartDate || '')) return null;

    return report;
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
        // Only the finished deals. The open ones are carried into the new
        // quarter below rather than archived, so this is the whole record of
        // them and nothing is in two places at once.
        contacts: (store.contacts || []).filter(c => c.stage === 'won' || c.stage === 'lost'),
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

    // Contacts are the one thing that does NOT get cleared wholesale. A deal
    // still sitting at "proposal sent" on the last day of the quarter is a live
    // conversation with a real person, and deleting it because the calendar
    // turned over would be the app throwing away her actual work. Won and lost
    // are settled, so those go to the archive above and leave here.
    store.contacts = (store.contacts || []).filter(c => c.stage !== 'won' && c.stage !== 'lost');

    // Clear weekly plans for the new quarter start, keep reviews for wins history
    store.weeklyPlans = [];

    // Clear daily action history active log
    store.dailyLogs = {};

    // The coach conversation is deliberately NOT cleared. It is a thread with a
    // person about their business, not a record of one quarter's numbers, and
    // wiping it on the calendar turning over would reintroduce exactly the
    // start-from-nothing problem the memory was built to fix. The Reset button
    // in the chat header is how someone throws it away on purpose.

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
