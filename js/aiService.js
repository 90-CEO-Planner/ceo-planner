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
        .map(e => `$${e.amount} from ${e.source || 'Unknown'}`)
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
- Quarterly Revenue: $${totalRev.toLocaleString()} out of $${revGoal.toLocaleString()} goal.
- Recent Sales: ${recentSalesContext}
- Current Active Priorities: ${priorities.join(', ') || 'None set'}.
- This Week's Plan: ${weeklyPlanContext}
- Today's Actions: ${dailyActionsContext}

Instructions:
1. Base all of your advice strictly on the exact context provided above.
2. If they are behind on revenue, aggressively pivot them to sales/marketing actions.
3. If they complain about being overwhelmed, tell them to delete tasks that do not serve their primary 90-Day Goal.
4. Keep all responses under 3 paragraphs. Use bullet points if necessary. NEVER provide generic business advice; always tie it back to their specific bottleneck or revenue target.`;

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
            body: { messages: messages }
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
