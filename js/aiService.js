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

    let prompt = `You are an elite, highly-paid Chief Operating Officer and Executive Coach. You speak directly, concisely, and with extreme strategic clarity. You do NOT use fluffy language, emojis, or polite pleasantries. You get straight to the point.
You are advising ${ceoName}, the CEO of ${bizName}.

Here is their exact, real-time business context:
- Business Model: ${model} (${phase} stage)
- #1 Current Bottleneck: ${bottleneck}
- Primary 90-Day Goal: ${focus}
- Desired 90-Day Outcome: ${outcome}
- Quarterly Revenue: $${totalRev.toLocaleString()} out of $${revGoal.toLocaleString()} goal.
- Current Active Priorities: ${priorities.join(', ') || 'None set'}.

Instructions:
1. Base all of your advice strictly on the exact context provided above.
2. If they are behind on revenue, aggressively pivot them to sales/marketing actions.
3. If they complain about being overwhelmed, tell them to delete tasks that do not serve their primary 90-Day Goal.
4. Keep all responses under 3 paragraphs. Use bullet points if necessary. NEVER provide generic business advice; always tie it back to their specific bottleneck or revenue target.`;

    return prompt;
}

export async function generateAIResponse(messageHistory) {
    const apiKey = localStorage.getItem('ceo_openai_key');
    
    if (!apiKey) {
        throw new Error("API_KEY_MISSING");
    }

    // Inject the dynamic system prompt as the absolute baseline truth
    const messages = [
        { role: 'system', content: buildSystemPrompt() },
        ...messageHistory
    ];

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: messages,
                temperature: 0.7,
                max_tokens: 500
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("OpenAI API Error:", data.error);
            throw new Error(data.error.message);
        }

        return data.choices[0].message.content;
    } catch (error) {
        console.error("Generative AI Service Failed:", error);
        throw error;
    }
}
