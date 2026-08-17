// liveAI.js
//
// Pro item 4. The four places the app says "AI" but means "keyword map" are:
//
//   AI Planning Assistant   js/screens/weeklyPlanner.js  generatePlanSuggestions()
//   The Daily 3 breakdown   js/screens/dashboard.js      breakdownTask()
//   Quiet Advisor pulses    js/screens/dashboard.js      getQuietAdvisorPulses()
//   CEO vs Busy Work        js/screens/coach.js          the decision filter
//
// This file is the Pro half of all four. The keyword engines stay exactly where
// they are and remain the base tier — that is the honest free/Pro line, and it
// is also the fallback whenever a call fails, is refused, or would cost more
// than the day's budget allows. Nothing here ever leaves a screen worse off
// than it was before the feature existed.
//
// Three rules shape everything below.
//
// 1. RENDER IS SYNCHRONOUS. Screens return HTML strings, so a model call cannot
//    happen during render. Every surface paints its keyword version first and
//    the live version replaces it a moment later, in attachEvents. A cache hit
//    is read synchronously during render, so the common case has no flash.
//
// 2. THESE CALLS ARE UNASKED FOR. The user did not press a button, so a failure
//    must be silent. No toast, no error text, no spinner that outlives its
//    welcome — just the keyword version they would have had anyway. The one
//    exception is the idea filter, which the user does press a button for.
//
// 3. AUTOMATIC SPEND NEEDS ITS OWN CEILING. consume_ai_quota is the real limit
//    and it is per tier, but a feature that fires without being asked should
//    not be able to eat somebody's whole daily allowance before they have typed
//    a word to the coach. The budget below is a courtesy cap on top of it.

// Imports are one line each on purpose: build_bundle.ps1 strips them with a
// per-line regex, so a multi-line import leaves its closing brace behind and
// the bundle stops parsing. Same reason the file uses `export function`
// throughout rather than `export default` or a multi-line export block.
import { getStore, getRevenueInsights, getFunnelInsights, getWeeksElapsed, getLocalDateString, updateDailyLog } from './store.js';
import { isProUser, isProTrial, isFeatureLive } from './components/proGate.js';

// Can this account use live AI? One answer, asked by all four screens.
//
// Same shape as canUseLeadPipeline() and canUseHistory() in proGate.js, and for
// the same reason: two copies of this rule would eventually disagree, and the
// failure mode is a screen promising personalised output and then quietly
// rendering the keyword version.
export function canUseLiveAI() {
    return isProUser() && isFeatureLive('live-ai');
}

// --- Escaping ---------------------------------------------------------------
//
// Model output goes into innerHTML in a couple of places, so it is escaped on
// the way in. Named escapeText rather than escapeHtml on purpose: fridayReview.js
// already has a near-identical escapeHtml(), and the bundle flattens every file
// into one scope, so a second function of that name would silently replace it
// for the whole app. When something next touches both files, merge them into one
// shared helper and delete this note.
export function escapeText(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- The daily budget for unasked-for calls ---------------------------------
//
// Trial accounts get a smaller one. A trial resolves to Pro for features but
// keeps the 30/day trial rate server side (batch 8), so without this a quiet
// morning of page loads could spend the allowance the coach needs later.
//
// Keyed on the local date while the server quota resets at midnight UTC. They
// drift by a few hours for anyone outside GMT, which is harmless: this is a
// courtesy cap, not the ceiling that protects the bill.
const BUDGET_KEY = 'ceo_liveai_budget';

function automaticCallBudget() {
    return isProTrial() ? 6 : 12;
}

function readBudget() {
    const today = getLocalDateString();
    try {
        const raw = JSON.parse(localStorage.getItem(BUDGET_KEY) || '{}');
        if (raw.day !== today) return { day: today, calls: 0, stopped: false };
        return { day: today, calls: raw.calls || 0, stopped: raw.stopped === true };
    } catch (err) {
        return { day: today, calls: 0, stopped: false };
    }
}

function writeBudget(budget) {
    try {
        localStorage.setItem(BUDGET_KEY, JSON.stringify(budget));
    } catch (err) {
        // A full localStorage means the cap stops being enforced across reloads.
        // The server quota still holds, so this is worth a warning and nothing more.
        console.warn('Could not record live AI budget:', err.message);
    }
}

function budgetAllows() {
    const budget = readBudget();
    if (budget.stopped) return false;
    return budget.calls < automaticCallBudget();
}

function spendBudget() {
    const budget = readBudget();
    budget.calls += 1;
    writeBudget(budget);
}

// Stop trying for the rest of the day. Called when the server says the account
// is out of allowance or the feature is not on their plan — both are answers
// that will not change before midnight, so asking again on every page load
// would burn requests to be told the same thing.
function stopForToday(reason) {
    const budget = readBudget();
    budget.stopped = true;
    writeBudget(budget);
    console.info(`Live AI paused until tomorrow: ${reason}`);
}

// --- The cache --------------------------------------------------------------
//
// Without this, every dashboard render is a model call. The fingerprint is
// built from the inputs that would change the answer, so a fresh answer is
// fetched when the user's situation changes and not when they navigate.
//
// Held in localStorage rather than in the planner store on purpose. The store is
// one JSON document written wholesale to Supabase on every save, so parking
// regenerable derived text in it would sync it to the server forever. Same rule
// the Stripe import follows.
const CACHE_KEY = 'ceo_liveai_cache';

// How long an answer stays good even if nothing about the inputs changed.
const CACHE_TTL_MS = {
    'plan-suggestions': 7 * 24 * 60 * 60 * 1000,
    'daily-3': 24 * 60 * 60 * 1000,
    'advisor-pulses': 24 * 60 * 60 * 1000
};

function readCache() {
    try {
        const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch (err) {
        return {};
    }
}

// A 32-bit hash of the inputs. Collisions are possible in principle and would
// show one stale suggestion until the TTL expires — cheap enough that a real
// hash is not worth the code.
export function liveAIFingerprint(parts) {
    const seed = (parts || []).map(p => String(p == null ? '' : p)).join('|');
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    return String(hash);
}

export function getCachedLive(surface, fingerprint) {
    const entry = readCache()[surface];
    if (!entry || entry.fp !== fingerprint) return null;
    const ttl = CACHE_TTL_MS[surface] || 0;
    if (ttl && Date.now() - (entry.at || 0) > ttl) return null;
    return entry.data;
}

function putCachedLive(surface, fingerprint, data) {
    try {
        const cache = readCache();
        cache[surface] = { fp: fingerprint, at: Date.now(), data };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (err) {
        console.warn('Could not cache live AI result:', err.message);
    }
}

// Called when a quarter is reset or the user signs out, so the next account or
// the next quarter does not inherit somebody else's suggestions.
export function clearLiveAICache() {
    try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(BUDGET_KEY);
    } catch (err) {
        /* nothing worth reporting */
    }
}

// --- The business brief -----------------------------------------------------
//
// The compact context every live call is given. Deliberately not the coach's
// full system prompt, which is ~11KB now that the whole user guide is injected
// into it — that is fine for a chat the user started, and wasteful several
// times a day for three short suggestions.
//
// Every number here is read from getRevenueInsights() and getFunnelInsights()
// rather than recalculated. Those already own the quarter-scoping and the
// close-rate rules, and a second copy of that arithmetic would eventually tell
// the model something the screen disagrees with.
export function businessBrief() {
    const store = getStore();
    const rev = getRevenueInsights();
    const funnel = getFunnelInsights();

    const currency = store.settings?.currency || '$';
    const goals = store.goals || {};
    const profile = store.profile || {};

    const quarterStartMonth = Math.floor(new Date().getMonth() / 3) * 3;
    const monthInQuarter = new Date().getMonth() - quarterStartMonth + 1;
    const milestone = goals.milestones?.[`month${monthInQuarter}`] || 'Not set';

    const weeksElapsed = getWeeksElapsed(store) || 1;

    const priorities = (goals.priorities || []).filter(p => String(p || '').trim() !== '');

    const recentSales = (rev.entries || [])
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3)
        .map(e => `${currency}${e.amount} for "${e.offer || 'unnamed offer'}" via ${e.source || 'unknown source'}`)
        .join('; ') || 'nothing logged yet';

    // "Not recorded yet" rather than a number, so the model tells them to log
    // their closes instead of reasoning about a rate that does not exist. Same
    // reasoning as the coach's system prompt.
    const closeRate = funnel.callCloseRate === null
        ? 'not recorded yet'
        : `${funnel.callCloseRate.toFixed(1)}% (${funnel.totalCloses} of ${funnel.totalCalls} calls)`;

    return [
        `Founder: ${profile.name || 'the founder'} of ${profile.businessName || 'their business'}`,
        `Business model: ${profile.businessModel || 'unknown'}`,
        `Industry / niche: ${profile.industryNiche || 'unknown'}`,
        `Ideal client: ${profile.targetAudience || 'unknown'}`,
        `Business stage: ${profile.stage || 'unknown'}`,
        `Strategy mode this quarter: ${profile.strategyMode || 'unknown'}`,
        `Their #1 bottleneck: ${profile.bottleneck || 'unknown'}`,
        `90-day focus: ${goals.focus || 'not set'}`,
        `90-day outcome they want: ${goals.outcome || 'not set'}`,
        `This month's milestone: ${milestone}`,
        `Top 3 priorities: ${priorities.join(' | ') || 'none set'}`,
        `Currency: ${currency}`,
        `Quarterly revenue goal: ${currency}${(rev.goal || 0).toLocaleString()}`,
        `Revenue so far this quarter: ${currency}${(rev.totalRevenue || 0).toLocaleString()} (${(rev.progressPercent || 0).toFixed(0)}% of goal)`,
        `Week ${weeksElapsed} of 12`,
        `Average offer price: ${currency}${store.revenue?.averageOfferPrice || 0}`,
        `Call close rate: ${closeRate}`,
        `Three most recent sales: ${recentSales}`
    ].join('\n');
}

// The house style every live surface is written in. Kept in one place so the
// four of them sound like the same app, and so the tone rules learned the hard
// way in batch 7 are stated once rather than four times.
const VOICE_RULES = `
Write like a sharp, warm operator talking to one tired founder on her phone.

- Be specific to THIS business. Never write advice that would fit any business.
- Never invent facts. If something is unknown, work with what you have.
- Never recommend a tool, platform or budget they have not mentioned.
- No hype, no emojis, no exclamation marks, no "crush it" language.
- Calibrate to their stage. Someone just starting out has no past clients, no
  email list and no testimonials, so do not tell them to use any of those.
- Early in a quarter, having nothing logged yet is normal, not a failure.
`.trim();

// --- The one place a live call is made --------------------------------------
//
// Returns the parsed object, or null. Null always means "use the keyword
// version" — a refusal, an outage, a budget stop and a malformed answer are all
// the same thing as far as a screen is concerned.
async function askLive(surface, systemPrompt, userPrompt, maxTokens) {
    if (!canUseLiveAI()) return null;
    if (!budgetAllows()) return null;

    spendBudget();

    try {
        const data = await window.invokeChat(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            // background: the user did not ask for this one, so it must never
            // raise an allowance warning. A toast appearing on page load saying
            // "you've used 80% of your AI" would alarm somebody who has just
            // opened the dashboard and done nothing.
            { feature: 'live-ai', json: true, maxTokens, background: true }
        );

        const content = data?.choices?.[0]?.message?.content;
        if (!content) return null;

        return JSON.parse(String(content).replace(/^```json/gi, '').replace(/```$/g, '').trim());
    } catch (err) {
        // The message is the safe customer-facing string readFunctionError built.
        // Two of them mean there is no point asking again today.
        const message = String(err && err.message || '');
        if (/allowance for today/i.test(message)) {
            stopForToday('daily AI allowance reached');
        } else if (/part of Pro/i.test(message)) {
            stopForToday('the server says this plan does not include live AI');
        } else {
            console.warn(`Live AI (${surface}) fell back to the built-in suggestions:`, message);
        }
        return null;
    }
}

// ============================================================================
// Surface 1 — the AI Planning Assistant (weeklyPlanner.js)
// ============================================================================

export function planSuggestionsFingerprint(store) {
    const goals = store.goals || {};
    const quarterStartMonth = Math.floor(new Date().getMonth() / 3) * 3;
    const monthInQuarter = new Date().getMonth() - quarterStartMonth + 1;
    return liveAIFingerprint([
        'plan',
        goals.focus,
        goals.milestones?.[`month${monthInQuarter}`],
        (goals.priorities || []).join('~'),
        store.profile?.strategyMode,
        store.profile?.bottleneck
    ]);
}

// Six suggestions in the same shape the keyword engine returns: three general
// actions, then one each of Revenue, Visibility and Follow-up. Matching the
// shape means the Apply buttons, which route by type, need no changes.
export async function fetchPlanSuggestions() {
    const system = `You are a chief of staff planning one week for a solo founder.

${VOICE_RULES}

Return JSON in exactly this shape and nothing else:
{"suggestions":[
  {"type":"Action","action":"..."},
  {"type":"Action","action":"..."},
  {"type":"Action","action":"..."},
  {"type":"Revenue","action":"..."},
  {"type":"Visibility","action":"..."},
  {"type":"Follow-up","action":"..."}
]}

Rules for the six entries:
- Exactly six, in that order and with those exact type values.
- Each action is one sentence, under 140 characters, starting with a verb.
- The three "Action" entries move their Top 3 priorities and this month's
  milestone forward. Say what to do, not what to think about.
- "Revenue" is a direct invitation to buy, aimed at someone who already knows them.
- "Visibility" is audience-facing with no sale in it.
- "Follow-up" nurtures someone who has already shown interest.
- Every entry must be doable inside one week alongside running the business.`;

    const user = `Here is the founder's real situation:\n\n${businessBrief()}\n\nWrite this week's six suggestions as JSON.`;

    const result = await askLive('plan-suggestions', system, user, 700);
    if (!result || !Array.isArray(result.suggestions)) return null;

    const cleaned = result.suggestions
        .filter(s => s && typeof s.action === 'string' && s.action.trim() !== '')
        .map(s => ({ type: String(s.type || 'Action').trim(), action: s.action.trim() }));

    return cleaned.length >= 3 ? cleaned.slice(0, 6) : null;
}

// ============================================================================
// Surface 2 — the Daily 3 breakdown (dashboard.js)
// ============================================================================

export function daily3Fingerprint(dateStr, planKey, priorities) {
    return liveAIFingerprint(['daily3', dateStr, planKey, (priorities || []).join('~')]);
}

// Only ever called when the week's plan has no `daily3` of its own — that is,
// when the founder wrote her own Monday plan rather than applying a generated
// week. When the plan already carries three real actions the dashboard uses
// those, and always did; this replaces the keyword templates that ran otherwise.
export async function fetchDaily3(context) {
    const system = `You are turning a founder's weekly plan into three things she can finish today.

${VOICE_RULES}

Return JSON in exactly this shape and nothing else:
{"tasks":["...","...","..."]}

Rules:
- Exactly three tasks.
- Each is one sentence under 90 characters, starting with a verb.
- Each must be finishable today, in under ninety minutes, by one person.
- Together they must move THIS week's stated actions forward — do not invent a
  new direction, and do not restate her priority back to her as a task.
- At least one must directly involve another human being: a message, a call, a
  post, a pitch. A week of solo admin is how founders stall.`;

    const user = `Her week:
- What would make this week a win: ${context.winCondition || 'not stated'}
- Top 3 actions this week: ${(context.priorities || []).filter(Boolean).join(' | ') || 'not stated'}
- Revenue action this week: ${context.revenueAction || 'not stated'}
- Visibility action this week: ${context.visibilityAction || 'not stated'}
- Follow-up action this week: ${context.followUps || 'not stated'}
- Today is ${context.dayName}.

Her business:

${businessBrief()}

Write today's three tasks as JSON.`;

    const result = await askLive('daily-3', system, user, 300);
    if (!result || !Array.isArray(result.tasks)) return null;

    const tasks = result.tasks
        .filter(t => typeof t === 'string' && t.trim() !== '')
        .map(t => t.trim());

    return tasks.length === 3 ? tasks : null;
}

// ============================================================================
// Surface 3 — the Quiet Advisor pulses (dashboard.js)
// ============================================================================

export function advisorFingerprint(dateStr, revenueState, pipelineState) {
    return liveAIFingerprint(['advisor', dateStr, revenueState, pipelineState]);
}

// The deterministic engine still decides WHICH state the founder is in — First
// Move, Pace Alert, Momentum, Conversion Drop — and keeps its colour. The model
// only rewrites the sentence.
//
// That split matters. The state is arithmetic and must stay honest: a red Pace
// Alert has to mean the numbers say so, not that the model felt gloomy. What
// was wrong with these pulses was never the diagnosis, it was that the words
// were one hardcoded line telling every founder to contact the three loyal past
// clients she may not have.
export async function fetchAdvisorPulses(states) {
    const system = `You are writing two very short nudges on a founder's dashboard.

${VOICE_RULES}

Return JSON in exactly this shape and nothing else:
{"revenue":{"title":"...","message":"..."},"pipeline":{"title":"...","message":"..."}}

Rules:
- Keep each title to the exact words you are given. Do not rename the situation.
- Each message is one or two sentences, under 30 words, and ends with one
  concrete thing to do today that suits this business and this stage.
- Do not repeat the numbers back to her — they are on the screen directly above.
- If you are given no pipeline situation, set "pipeline" to null.`;

    const user = `Revenue situation: ${states.revenue || 'none'}
Pipeline situation: ${states.pipeline || 'none'}

Her business:

${businessBrief()}

Write the two nudges as JSON.`;

    const result = await askLive('advisor-pulses', system, user, 300);
    if (!result || typeof result !== 'object') return null;
    return result;
}

// ============================================================================
// Surface 4 — CEO vs Busy Work (coach.js)
// ============================================================================
//
// The only one of the four the user actually presses a button for, so it does
// not draw on the automatic budget and it is allowed to say when it failed.

export async function fetchIdeaVerdict(idea) {
    if (!canUseLiveAI()) return null;

    const system = `You are a blunt but fair chief of staff testing whether a new idea deserves a founder's next ninety days.

${VOICE_RULES}

Return JSON in exactly this shape and nothing else:
{"verdict":"Strategic","explanation":"..."}

Rules:
- "verdict" is exactly one of: "Strategic", "Worth testing", "Busy work".
- "Strategic" means it moves the stated 90-day outcome or clears the #1
  bottleneck. "Worth testing" means it might, cheaply, but is unproven for them.
  "Busy work" means it is a tangent, however enjoyable.
- "explanation" is two or three sentences. Say WHY, naming the specific goal,
  bottleneck or number it does or does not touch.
- If it is busy work, say what it would cost her and what to do instead.
- Judge the idea on their actual situation, never on whether it is a good idea
  in general.`;

    const user = `The idea she is considering:\n"${String(idea || '').slice(0, 800)}"\n\nHer business:\n\n${businessBrief()}\n\nReturn your verdict as JSON.`;

    // Deliberately bypasses budgetAllows(): she asked for this one. The server
    // quota is still the ceiling.
    try {
        const data = await window.invokeChat(
            [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            { feature: 'live-ai', json: true, maxTokens: 300 }
        );

        const content = data?.choices?.[0]?.message?.content;
        if (!content) return null;

        const parsed = JSON.parse(String(content).replace(/^```json/gi, '').replace(/```$/g, '').trim());
        if (!parsed || typeof parsed.explanation !== 'string') return null;

        const allowed = ['Strategic', 'Worth testing', 'Busy work'];
        const verdict = allowed.find(v => v.toLowerCase() === String(parsed.verdict || '').toLowerCase());
        if (!verdict) return null;

        return { verdict, explanation: parsed.explanation.trim() };
    } catch (err) {
        console.warn('Live idea verdict failed, falling back to the built-in filter:', err.message);
        return null;
    }
}

// ============================================================================
// Shared bits the screens render
// ============================================================================

// The line that marks a card as written for this business rather than picked
// from a list. Only shown to accounts that actually have the feature, so on a
// base plan the proTeaser for 'live-ai' occupies the same spot instead — one or
// the other, never both, because proTeaser returns '' exactly when this returns
// something.
export function liveAINote(text) {
    if (!canUseLiveAI()) return '';
    return `
        <p class="live-ai-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.8L20 10.7l-4.9 3.6L16.4 20 12 16.8 7.6 20l1.3-5.7L4 10.7l6.1-1.9z"></path></svg>
            <span>${escapeText(text)}</span>
        </p>
    `;
}

// Marks a container as waiting for its live version. Used to fade the keyword
// text very slightly while the call is in flight, so the swap reads as an
// update rather than as the screen glitching.
export function markLivePending(el) {
    if (el) el.classList.add('live-ai-pending');
}

export function clearLivePending(el) {
    if (el) el.classList.remove('live-ai-pending');
}

// ============================================================================
// Hydration — called from each screen's attachEvents
// ============================================================================
//
// Each screen reads the cache during its own render, so a returning visitor
// sees the live version immediately with no flash of the keyword one. These
// functions therefore only ever handle a cache MISS: the screen stashes a
// request on `window` when it wants one, exactly the way the dashboard already
// stashes _tempGeneratedTodaysLog, and stays silent when it does not.

// The Daily 3.
//
// The tick rule is the important part: if anything has been ticked today, the
// swap is abandoned. Replacing a task somebody has already done, because a
// network call finished late, would lose real work and would look like the app
// forgetting. A fresh answer simply waits for tomorrow.
export async function hydrateDaily3() {
    const request = window._liveAIDaily3;
    if (!request) return;
    delete window._liveAIDaily3;

    if (!canUseLiveAI() || !budgetAllows()) return;

    const container = document.getElementById('daily-3-list');
    markLivePending(container);
    const tasks = await fetchDaily3(request);
    clearLivePending(container);
    if (!tasks) return;

    putCachedLive('daily-3', daily3Fingerprint(request.dateStr, request.planKey, request.priorities), tasks);
    applyDaily3(tasks, request);
}

function applyDaily3(tasks, request) {
    const store = getStore();
    const existing = store.dailyLogs?.[request.dateStr] || [];

    if (existing.some(t => t && t.done)) return;
    if (existing.length === tasks.length && existing.every((t, i) => t.text === tasks[i])) return;

    updateDailyLog(request.dateStr, tasks.map(text => ({ text, done: false })), request.planKey);

    tasks.forEach((text, i) => {
        const label = document.querySelector(`#daily-task-${i}`)?.parentElement?.querySelector('span');
        if (label) label.textContent = text;
    });
}

// The Quiet Advisor pulses. The colour and the choice of situation stay exactly
// as the deterministic engine set them; only the words change.
export async function hydrateAdvisorPulses() {
    const request = window._liveAIAdvisor;
    if (!request) return;
    delete window._liveAIAdvisor;

    if (!canUseLiveAI() || !budgetAllows()) return;
    if (!request.revenue && !request.pipeline) return;

    const pulses = await fetchAdvisorPulses(request);
    if (!pulses) return;

    putCachedLive('advisor-pulses', advisorFingerprint(request.dateStr, request.revenue, request.pipeline), pulses);
    applyAdvisorPulses(pulses);
}

// Writing a pulse message into the page. Exported because the render path uses
// it too, on the load after a cached answer already exists.
export function applyAdvisorPulses(pulses) {
    ['revenue', 'pipeline'].forEach(key => {
        const pulse = pulses && pulses[key];
        if (!pulse || typeof pulse.message !== 'string') return;
        const messageEl = document.getElementById(`pulse-${key}-message`);
        if (messageEl) messageEl.textContent = pulse.message.trim();
    });
}

// The AI Planning Assistant. `rebuild` is passed in by weeklyPlanner so this
// file never has to know what one of its list items looks like.
export async function hydratePlanSuggestions(rebuild) {
    if (!window._liveAIPlanNeedsFetch) return;
    delete window._liveAIPlanNeedsFetch;

    if (!canUseLiveAI() || !budgetAllows()) return;

    const container = document.getElementById('plan-suggestions-list');
    markLivePending(container);
    const suggestions = await fetchPlanSuggestions();
    clearLivePending(container);
    if (!suggestions) return;

    putCachedLive('plan-suggestions', planSuggestionsFingerprint(getStore()), suggestions);
    rebuild(suggestions);
}
