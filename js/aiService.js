// aiService.js

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
    
    let metricsContext = "No monthly snapshot metrics available.";
    let callCloseRate = "Unknown";
    if (store.metrics && store.metrics.length > 0) {
        const lastSnapshot = store.metrics[store.metrics.length - 1];
        metricsContext = `Recent Snapshot: ${lastSnapshot.traffic} traffic, ${lastSnapshot.calls} calls booked, ${lastSnapshot.social} total social audience.`;
        const totalCalls = store.metrics.reduce((sum, m) => sum + (parseFloat(m.calls) || 0), 0);
        const salesCount = store.revenue?.entries ? store.revenue.entries.length : 0;
        if (totalCalls > 0) {
            callCloseRate = ((salesCount / totalCalls) * 100).toFixed(1) + "%";
        } else if (salesCount > 0) {
            callCloseRate = "100%";
        }
    }

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
        .map(e => `${currency}${e.amount} from ${e.source || 'Unknown'}`)
        .join(', ');
    const recentSalesContext = recentSales || "No recent sales logged.";

    // 3. Daily 3 Actions
    const todayStrDash = new Date().toISOString().split('T')[0];
    const todaysLog = store.dailyLogs && store.dailyLogs[todayStrDash] ? store.dailyLogs[todayStrDash] : [];
    let dailyActionsContext = "No daily actions defined today.";
    if (todaysLog.length > 0) {
        dailyActionsContext = todaysLog.map(t => `${t.text} (${t.done ? 'Done' : 'Pending'})`).join(' | ');
    }

    let prompt = `You are an elite, highly-paid Chief Operating Officer and Executive Coach. You speak directly, concisely, and with extreme strategic clarity. You do NOT use fluffy language, emojis, or polite pleasantries. You get straight to the point.
You are advising ${ceoName}, the CEO of ${bizName}.

Here is their exact, real-time business context:
- Business Model: ${model} (${phase} stage)
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
6. Avoid repetition. Be concise. Use bullet points for micro-tasks. NEVER provide generic business advice; always tie your critiques back to their specific bottleneck or revenue target.`;

    return prompt;
}

export async function generateAIResponse(messageHistory) {
    // Inject the dynamic system prompt as the absolute baseline truth
    const messages = [
        { role: 'system', content: buildSystemPrompt() },
        ...messageHistory
    ];

    try {
        const { data, error } = await window.db.functions.invoke('chat', {
            body: { messages: messages },
            headers: {
                Authorization: `Bearer ${window.db.supabaseKey}`
            }
        });

        if (error) {
            console.error("Edge Function Invocation Error:", error);
            throw new Error(error.message);
        }

        if (data.error) {
            console.error("OpenAI API Error:", data.error);
            throw new Error(data.error.message || data.error);
        }

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

    const prompt = `You are the AI CEO Advisor for ${bizName}. 
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
        const { data, error } = await window.db.functions.invoke('chat', {
            body: { messages: [{ role: 'user', content: prompt }] },
            headers: {
                Authorization: `Bearer ${window.db.supabaseKey}`
            }
        });

        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error.message || data.error);

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
12. Output JSON only. No markdown, no code fences, no prose before or after.
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
        "Task: [Actionable task]. Execution: [Clear step-by-step direction on how to carry it out]",
        "Task: [Actionable task]. Execution: [Clear step-by-step direction on how to carry it out]",
        "Task: [Actionable task]. Execution: [Clear step-by-step direction on how to carry it out]"
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
        const { data, error } = await window.db.functions.invoke('chat', {
            body: { 
                messages: [
                    { role: 'system', content: systemPrompt }, 
                    { role: 'user', content: 'Generate my 90-day action plan now. Return only the JSON object, no prose, no markdown fences.' }
                ] 
            },
            headers: {
                Authorization: `Bearer ${window.db.supabaseKey}`
            }
        });

        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error.message || data.error);

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

