// aiService.js

// The coach is told this is ground truth about the app, so when it drifts from
// reality the coach confidently explains features that do not exist to paying
// customers. To stop that happening again it is no longer maintained by hand:
// build_bundle.ps1 reads USER_GUIDE.md and defines CEO_USER_GUIDE ahead of this
// file. The literal below is only a fallback for running the module unbundled,
// and is deliberately short — if you are editing it to describe a feature, edit
// USER_GUIDE.md instead.
const USER_GUIDE_TEXT = (typeof CEO_USER_GUIDE !== 'undefined' && CEO_USER_GUIDE)
    ? CEO_USER_GUIDE
    : `
# CEO Planner App User Guide

Set a 90-Day Vision (Focus, Outcome, Top 3 Priorities, Revenue Goal). Work it in
weekly cycles: plan on Monday, execute a Daily 3 each day, review on Friday.
The Friday Review asks what moved forward, what worked, what felt heavy, your
energy level, optional metrics, and one thing to improve — then drafts next
Monday's plan for you. The Focus Score on the dashboard is the percentage of
Daily 3 tasks completed this week; it is not produced by the Friday Review.
Revenue tab tracks sales, leads and conversion rates, exports CSV, and generates
an AI Executive Report. Settings holds profile, targets, planning day, reminders
and data erasure.
`;

// Prepares the hyper-contextual system prompt by scraping the entire database
function buildSystemPrompt() {
    const store = getStore();
    
    const bizName = store.profile?.businessName || "their company";
    const ceoName = store.profile?.name || "CEO";
    const focus = store.goals?.focus || "None set yet";
    const outcome = store.goals?.outcome || "None set yet";
    const bottleneck = store.profile?.bottleneck || "Unknown";
    const model = store.profile?.businessModel || "Unknown";
    const phase = store.profile?.stage || "Unknown";
    
    const priorities = store.goals?.priorities || [];
    
    let totalRev = 0;
    if (store.revenue && store.revenue.entries) {
        totalRev = store.revenue.entries.reduce((sum, entry) => sum + (parseFloat(entry.amount) || 0), 0);
    }
    const revGoal = store.revenue?.quarterlyGoal || 0;
    const currency = store.settings?.currency || '$';

    // Pipeline & Conversion Metrics
    let totalLeads = 0;
    if (store.leads && store.leads.entries) {
        totalLeads = store.leads.entries.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    }
    const leadGoal = store.leads?.quarterlyGoal || 0;
    
    // Straight from getFunnelInsights, the same source the Revenue screen reads.
    // This used to divide total sales by total calls and fall back to a hardcoded
    // "100%", so the Coach would confidently quote a close rate that was wrong and
    // sometimes impossible — and disagree with the figure on screen while doing it.
    const funnel = getFunnelInsights();

    let metricsContext = "No monthly snapshot metrics available.";
    if (funnel.latestSnapshot) {
        const s = funnel.latestSnapshot;
        const closesPart = (s.closes === undefined || s.closes === null)
            ? 'closes not recorded that month'
            : `${s.closes} of those calls closed`;
        metricsContext = `Recent Snapshot: ${s.traffic} website visitors, ${s.calls} calls booked, ${closesPart}, ${s.social} total social audience.`;
        if (funnel.visitorToCallRate !== null) {
            metricsContext += ` Across all snapshots, ${funnel.visitorToCallRate.toFixed(1)}% of website visitors booked a call.`;
        }
    }

    // "Not recorded yet" rather than a number, so the model says the user should
    // log her closes instead of inventing a conversion rate to talk about.
    const callCloseRate = funnel.callCloseRate === null
        ? 'Not recorded yet (the user has not logged how many calls closed)'
        : `${funnel.callCloseRate.toFixed(1)}% (${funnel.totalCloses} closed from ${funnel.totalCalls} calls)`;

    // 1. Weekly Plan Data
    const recentPlan = store.weeklyPlans && store.weeklyPlans.length > 0 
        ? store.weeklyPlans[store.weeklyPlans.length - 1] 
        : null;
    let weeklyPlanContext = "None currently set.";
    if (recentPlan) {
        weeklyPlanContext = `Visibility Action: ${recentPlan.visibilityAction || 'None'}, Revenue Action: ${recentPlan.revenueAction || 'None'}, Follow-ups: ${recentPlan.followUps || 'None'}`;
    }

    // 2. Recent Revenue (last 3 sales)
    const recentSales = (store.revenue?.entries || [])
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3)
        .map(e => `${currency}${e.amount} for "${e.offer || 'General Offer'}" from ${e.source || 'Unknown'}`)
        .join(', ');
    const recentSalesContext = recentSales || "No recent sales logged.";

    // 3. Daily 3 Actions
    const todayStrDash = getLocalDateString();
    const todaysLog = store.dailyLogs && store.dailyLogs[todayStrDash] ? store.dailyLogs[todayStrDash] : [];
    let dailyActionsContext = "No daily actions defined today.";
    if (todaysLog.length > 0) {
        dailyActionsContext = todaysLog.map(t => `${t.text} (${t.done ? 'Done' : 'Pending'})`).join(' | ');
    }

    let prompt = `You are an elite, highly-paid Chief Operating Officer and Executive Coach. You speak directly, concisely, and with extreme strategic clarity. You do NOT use fluffy language, emojis, or polite pleasantries. You get straight to the point.
You are advising ${ceoName}, the CEO of ${bizName}.

Here is their exact, real-time business context:
- Business Model: ${model} (${phase} stage)
- Industry / Niche: ${store.profile?.industryNiche || 'Unknown'}
- Target Audience / Ideal Client: ${store.profile?.targetAudience || 'Unknown'}
- #1 Current Bottleneck: ${bottleneck}
- Primary 90-Day Goal: ${focus}
- Desired 90-Day Outcome: ${outcome}
- Quarterly Revenue: ${currency}${totalRev.toLocaleString()} out of ${currency}${revGoal.toLocaleString()} goal.
- Quarterly Leads: ${totalLeads.toLocaleString()} out of ${leadGoal.toLocaleString()} goal.
- Pipeline Overview: ${metricsContext} | Call Close Rate: ${callCloseRate}
- Recent Sales: ${recentSalesContext}
- Current Active Priorities: ${priorities.join(', ') || 'None set'}.
- This Week's Plan: ${weeklyPlanContext}
- Today's Actions: ${dailyActionsContext}

Instructions:
1. Base all of your advice strictly on the exact context provided above.
2. Be an active, inquisitive coach: Rather than just giving answers, ask them WHY they chose specific tasks to understand their logic and scope before giving a final verdict.
3. Highly Actionable: When providing tactical advice, don't just tell them what to do. Break the task down into specific, step-by-step MICRO-TASKS showing exactly HOW to execute it.
4. Explain Your Rationale: If you disagree with their weekly actions because they don't align with the primary 90-Day Goal or #1 Bottleneck, forcefully but professionally challenge them. Explain exactly WHY you disagree and suggest what makes more sense based on their data.
5. If they are behind on revenue, aggressively pivot them to direct sales/marketing actions.
6. Avoid repetition. Be concise. Use bullet points for micro-tasks. NEVER provide generic business advice; always tie your critiques back to their specific bottleneck or revenue target.
7. Hyper-Personalization: You MUST tailor your tactical advice (such as content prompts, marketing hooks, sales angles, or email outlines) specifically to their Business Model/Type, Industry/Niche, and Target Audience. Do NOT output generic placeholders or advice lists like "Topic: Address a common misconception about coaching" or "Hook: Begin with engaging language". Instead, write concrete, custom topic ideas, actual hook copy, and specific content topics matching their industry and ideal client's specific pain points (e.g. if their niche is 'Business Coaching' and their audience is 'female founders making $3k-10k/mo', write hook examples directly touching on scaling past $3k/mo, outsourcing busy work, or sales close anxiety). Make them feel like this plan was written custom by a human CMO.
8. Subscription Cancellation: If the user asks how to cancel their subscription or update billing details, tell them to navigate to Settings, scroll down to the 'Billing & Subscription' section, and click the 'Manage Subscription / Cancel' button to redirect to the Stripe Customer Portal.
9. App Assistance: If the user asks how the app works, how to use specific features (like Monday plans, Daily 3, logging sales, Friday reviews, exporting CSV, or reset data), guide them using this official app guide:
${USER_GUIDE_TEXT}`;

    return prompt;
}

// How much of the conversation goes back to the model on each turn.
//
// Deliberately much smaller than what the store keeps (COACH_CHAT_MAX_MESSAGES
// is 40). Once the thread survives refreshes it only ever grows, and sending
// all of it would make every message cost more than the one before it — with
// nothing noticing, because the daily allowance counts requests, not tokens.
//
// Twelve messages is six exchanges: enough that the coach is still talking
// about the thing you raised earlier in the session, without carrying a
// fortnight of conversation into a question about today.
const CHAT_CONTEXT_MESSAGES = 12;
const CHAT_CONTEXT_CHARS = 8000;

// The tail of the conversation, trimmed to fit and stripped back to the two
// fields the API accepts. `at` is ours, for the date dividers in the widget,
// and OpenAI rejects the request outright if it is left on the message.
//
// Trimming from the oldest end is what guarantees the newest message — the
// question being asked right now — is always in what gets sent.
function recentContext(messageHistory) {
    // Named `recent`, not `window`: the bundle puts every file in one global
    // scope, and a local called `window` inside a function that later needs
    // window.invokeChat is a trap waiting to be sprung.
    let recent = (messageHistory || [])
        .filter(m => m && m.role !== 'system' && typeof m.content === 'string')
        .slice(-CHAT_CONTEXT_MESSAGES)
        .map(m => ({ role: m.role, content: m.content }));

    let total = recent.reduce((sum, m) => sum + m.content.length, 0);
    while (recent.length > 1 && total > CHAT_CONTEXT_CHARS) {
        total -= recent[0].content.length;
        recent = recent.slice(1);
    }

    return recent;
}

export async function generateAIResponse(messageHistory) {
    // Inject the dynamic system prompt as the absolute baseline truth. It is
    // rebuilt from the store every time rather than remembered with the rest of
    // the conversation, so a thread started last week is answered against this
    // week's numbers.
    const messages = [
        { role: 'system', content: buildSystemPrompt() },
        ...recentContext(messageHistory)
    ];

    try {
        const data = await window.invokeChat(messages);
        return data.choices[0].message.content;
    } catch (error) {
        console.error("Generative AI Service Failed:", error);
        throw error;
    }
}

export async function generateMondayPlanDraft(reviewData) {
    const store = getStore();
    const focus = store.goals?.focus || "None set yet";
    const bizName = store.profile?.businessName || "the company";

    const prompt = `You are the Executive AI Coach for ${bizName}. 
The CEO has just completed their Friday Review. Here is what they said:
- What moved the business forward: ${reviewData.movedForward}
- What worked well: ${reviewData.workedWell}
- What felt difficult or heavy: ${reviewData.difficult}
- Personal Energy Level: ${reviewData.energy}
- What to improve next week: ${reviewData.nextWeekImprove}

Their overarching 90-day goal: ${focus}

Based ONLY on this review, draft a highly actionable plan for this upcoming Monday. 
You MUST return ONLY a raw JSON strictly following this schema with no markdown formatting or backticks:
{
  "weeklyFocus": "A strong one-sentence focus for the week based on their review improvements.",
  "priorities": [
    "Priority 1",
    "Priority 2",
    "Priority 3"
  ],
  "revenueAction": "A specific action to drive revenue this week, tailored to what worked well."
}`;

    try {
        // json: true makes OpenAI return a parseable object rather than prose
        // that happens to look like one. The fence-stripping below is kept as a
        // belt-and-braces measure: JSON mode is skipped server side if no
        // message mentions JSON, and a future edit to this prompt could quietly
        // remove the word.
        const data = await window.invokeChat(
            [{ role: 'user', content: prompt }],
            { json: true, maxTokens: 800 }
        );

        let content = data.choices[0].message.content;
        content = content.replace(/^```json/g, '').replace(/```$/g, '').trim();
        return JSON.parse(content);
    } catch (error) {
        console.error("Failed to generate Monday plan draft:", error);
        return null;
    }
}

export async function generate90DayActionPlan() {
    const store = getStore();

    const ceoName = store.profile?.name || "CEO";
    const businessName = store.profile?.businessName || "the business";
    const stage = store.profile?.stage || "Unknown";
    const businessModel = store.profile?.businessModel || "Unknown";
    const bottleneck = store.profile?.bottleneck || "Unknown";
    const strategyMode = store.profile?.strategyMode || "Unknown";
    const focus = store.goals?.focus || "Unknown";
    const outcome = store.goals?.outcome || "Unknown";
    const prioritiesArray = store.goals?.priorities || [];
    const priorities = prioritiesArray.filter(p => p.trim() !== '').join(" | ") || "None";
    const m1 = store.goals?.milestones?.month1 || "Unknown";
    const m2 = store.goals?.milestones?.month2 || "Unknown";
    const m3 = store.goals?.milestones?.month3 || "Unknown";
    const currency = store.settings?.currency || "$";
    const revenueGoal = store.revenue?.quarterlyGoal || 0;
    const avgOfferPrice = store.revenue?.averageOfferPrice || 0;
    const leadGoal = store.leads?.quarterlyGoal || 0;
    const statement = store.goals?.statement || "None";

    let salesRequired = "unknown";
    if (avgOfferPrice > 0) {
        salesRequired = Math.ceil(revenueGoal / avgOfferPrice);
    }

    const systemPrompt = `You are an elite strategic planner for solo entrepreneurs. You build calibrated, realistic 90-day action plans — not generic advice. You think like a Chief of Staff: ruthless about scope, honest about constraints, specific about weekly cadence.

You are planning for ${ceoName}, founder of ${businessName}.

REAL CONTEXT (use this and only this):
- Business stage: ${stage}
- Business model: ${businessModel}
- #1 Bottleneck right now: ${bottleneck}
- Strategy Mode for the quarter: ${strategyMode}
- 90-Day Focus Theme: ${focus}
- Measurable 90-Day Outcome: ${outcome}
- Top 3 Priorities the user has chosen: ${priorities}
- Monthly Milestones the user has chosen: M1: ${m1} | M2: ${m2} | M3: ${m3}
- Quarterly Revenue Goal: ${currency}${revenueGoal}
- Average Offer Price: ${currency}${avgOfferPrice}
- Implied number of sales required this quarter: ${salesRequired}
- Quarterly Lead Goal: ${leadGoal}
- Currency: ${currency}
- CEO Commitment statement: "${statement}"

RULES (apply all of them):
1. Calibrate targets honestly. If the math is unrealistic given stage and bottleneck, note it in the plan and propose a stretch vs. realistic split. Never inflate.
2. Phase the 90 days: Month 1 = foundation (build the assets and remove the bottleneck), Month 2 = momentum (output and visibility), Month 3 = conversion (sell, follow up, close).
3. Every week MUST contain a Top 3, ONE visibility action, ONE revenue action, ONE follow-up action. Visibility and Revenue are non-negotiable; do not let a week pass without both.
4. Tie every weekly action back to the user's #1 Bottleneck or 90-Day Outcome. Generic tasks ("post on social media") are forbidden — be specific to their model and stage.
5. Match weekly intensity to the user's stage. Just-starting users get fewer asks per week than scaling users.
6. Build red-flag thresholds. These are the leading indicators that, if missed, mean the user is off track BEFORE the quarter ends. Each red flag = a metric, a threshold, and a corrective action.
7. Build a one-time Setup Checklist of foundational items the user must complete in week 1 — things they only do once (set up email signature, install analytics pixel, write welcome sequence, etc.). Tailor it to the business model.
8. Write in their voice: warm, direct, specific, no hype, no jargon. The user is a tired founder reading this on their phone.
10. The 'successCheck' for each week MUST be highly realistic and grounded based on the user's stage. Do NOT set unattainable lag-metric checks (e.g., "10 new sales" or "50 signups" for a beginner). Instead, tie the check to the completion of the week's input actions (e.g., "Drafted 3 emails" or "Pitched 5 people").
11. NEVER recommend tools they did not mention. NEVER assume budget or team. Default to "free or already-owned" tools.
12. Keep each topPriorities entry under 70 characters. They are rendered in single-line inputs on the weekly planner, so anything longer is cut off mid-sentence and the user cannot read their own priorities. One action per entry, no "Task:"/"Execution:" labels, no semicolons joining two actions.
13. Output JSON only. No markdown, no code fences, no prose before or after.
OUTPUT FORMAT (return exactly this JSON shape):
{
  "summary": "One paragraph (3-4 sentences) explaining the plan's logic, what's realistic, and what's stretch.",
  "salesRequired": ${salesRequired},
  "calibration": "One sentence noting if the goal is realistic, stretch, or needs adjusting based on stage and bottleneck.",
  "monthlyThemes": {
    "month1": "Foundation — one sentence theme tied to their milestone.",
    "month2": "Momentum — one sentence theme tied to their milestone.",
    "month3": "Conversion — one sentence theme tied to their milestone."
  },
  "setupChecklist": [
    { "task": "Specific one-time setup task", "category": "foundation|email|sales|content|analytics", "estimatedMinutes": 30 }
  ],
  "redFlags": [
    { "metric": "What to measure", "threshold": "The number/condition that triggers the flag", "checkFrequency": "weekly|monthly", "correctiveAction": "What to do if triggered" }
  ],
  "weeks": [
    {
      "weekNumber": 1,
      "monthIndex": 1,
      "weeklyFocus": "One sentence focus for the week, tied to monthly theme.",
      "topPriorities": [
        "[One specific action, max 70 characters, no 'Task:' or 'Execution:' prefix]",
        "[One specific action, max 70 characters, no 'Task:' or 'Execution:' prefix]",
        "[One specific action, max 70 characters, no 'Task:' or 'Execution:' prefix]"
      ],
      "visibilityAction": "ONE specific visibility task this week (audience-facing, no sale).",
      "revenueAction": "ONE specific revenue task this week (a direct invitation to buy).",
      "followUpAction": "ONE specific follow-up task this week (nurture an existing lead).",
      "dailyThree": ["Mon-Tue micro task", "Wed-Thu micro task", "Fri micro task"],
      "successCheck": "How they will know this week worked (a measurable outcome)."
    }
  ]
}

CRITICAL: Return ONLY the JSON object above. No explanation, no preamble, no code fences.`;

    try {
        // A 12-week plan with a setup checklist and red flags is the longest
        // answer the app ever asks for, so the ceiling is generous. It exists to
        // stop a runaway, not to shape the output — a plan cut off mid-JSON
        // fails the shape check below and returns null, which is worse than
        // costing a few more tokens.
        const data = await window.invokeChat(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Generate my 90-day action plan now. Return only the JSON object, no prose, no markdown fences.' }
            ],
            { json: true, maxTokens: 8000 }
        );

        let content = data.choices[0].message.content;
        content = content.replace(/^```json/gi, '').replace(/```$/g, '').trim();
        const parsedPlan = JSON.parse(content);

        // Basic validation
        if (!parsedPlan.summary || !parsedPlan.weeks || !Array.isArray(parsedPlan.weeks) || parsedPlan.weeks.length !== 12) {
             throw new Error("Invalid plan shape returned from AI.");
        }

        return parsedPlan;
    } catch (error) {
        console.error("Failed to generate 90-Day Action Plan:", error);
        return null;
    }
}

