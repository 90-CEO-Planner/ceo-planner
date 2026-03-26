// coach.js
import { renderNav } from '../components/nav.js';
import { getStore } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';

function renderMessage(role, content) {
    const isAi = role === 'assistant';
    const bg = isAi ? 'white' : 'var(--color-primary)';
    const color = isAi ? 'var(--color-text-main)' : 'white';
    const align = isAi ? 'flex-start' : 'flex-end';
    const radius = isAi ? '16px 16px 16px 4px' : '16px 16px 4px 16px';
    const border = isAi ? '1px solid var(--color-border)' : 'none';

    let formattedContent = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

    return `
        <div style="align-self: ${align}; max-width: 85%; background: ${bg}; color: ${color}; padding: 1rem 1.25rem; border-radius: ${radius}; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: ${border}; line-height: 1.5; font-size: 0.95rem;">
            ${formattedContent}
        </div>
    `;
}

export function renderCoach() {
    window.setScreenModule({ attachEvents: coachAttachEvents });
    const store = getStore();

    // Security check
    const sessionData = JSON.parse(localStorage.getItem('ceo_auth') || '{}');
    const userEmail = sessionData?.user?.email || '';
    const isAdmin = userEmail.toLowerCase() === 'jeanette_spencer@yahoo.com';

    // Generate AI Insights (Classic)
    const insight = generateInsights(store);
    const hasKey = !!localStorage.getItem('ceo_openai_key');

    let chatHtml = '';

    if (isAdmin) {
        if (!hasKey) {
            chatHtml = `
                <div class="card text-center" style="padding: 3rem; border: dashed 2px var(--color-border); box-shadow: none; height: 100%;">
                    <div style="background: #E0E7FF; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <h2 style="margin-bottom: 1rem; color: var(--color-black);">Unlock the General AI Advisor</h2>
                    <p style="color: var(--color-text-muted); margin-bottom: 2rem; line-height: 1.5;">The conversational CEO Advisor requires an OpenAI API Key to securely process and chat about your strategy.</p>
                    <a href="#/settings" class="btn btn-primary" style="display: inline-block;">Go to Settings</a>
                </div>
            `;
        } else {
            chatHtml = `
                <div style="display: flex; flex-direction: column; height: 100%; min-height: 600px; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid var(--color-border);">
                    <!-- Header -->
                    <div style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; background: #F8FAFC;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; box-shadow: 0 4px 6px -1px rgba(78, 14, 255, 0.3);">AI</div>
                            <div>
                                <h3 style="margin:0; font-size: 1.1rem; color: var(--color-black);">CEO Advisor</h3>
                                <p style="margin:0; font-size: 0.8rem; color: var(--color-text-muted);">Powered by GPT-4o-mini | Fully Context-Aware</p>
                            </div>
                        </div>
                        <button id="clear-chat-btn" class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Clear Chat</button>
                    </div>

                    <!-- Chat Area -->
                    <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; background: #F8FAFC;">
                        <!-- Messages will be injected here -->
                    </div>

                    <!-- Input Area -->
                    <div style="padding: 1rem 1.5rem; border-top: 1px solid var(--color-border); background: white;">
                        <form id="chat-form" style="display: flex; gap: 0.75rem;">
                            <input type="text" id="chat-input" class="form-input" placeholder="Ask for strategy, complain about bottlenecks..." style="flex: 1; border-radius: 20px; padding-left: 1.25rem;" autocomplete="off" required>
                            <button type="submit" class="btn btn-primary" id="chat-submit" style="border-radius: 20px; padding: 0.75rem 1.5rem;">
                                Send
                            </button>
                        </form>
                    </div>
                </div>
            `;
        }
    }

    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 1200px; padding-top: 2rem;">
            
            <div style="margin-bottom: 2rem;">
                <h2>CEO Command Center & AI Coach</h2>
                <p style="color: var(--color-text-muted);">Your personalized strategy dashboard and intelligent advisory.</p>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 2rem; align-items: stretch; justify-content: ${isAdmin ? 'flex-start' : 'center'};">
                
                ${isAdmin ? `
                <!-- Left Column: Generative AI Chat -->
                <div style="flex: 1 1 600px; display: flex; flex-direction: column;">
                    ${chatHtml}
                </div>
                ` : ''}

                <!-- Right Column (or Center if not Admin): Deterministic Tools -->
                <div style="flex: 1 1 350px; ${isAdmin ? '' : 'max-width: 600px;'} display: flex; flex-direction: column; gap: 2rem;">
                    
                    <!-- CEO Insight Engine -->
                    <div class="card" style="border-top: 4px solid var(--color-primary); flex-shrink: 0;">
                        <div class="flex items-center gap-2 mb-4">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                            <h3 style="margin: 0; display: flex; align-items: center;">
                                Weekly CEO Insight
                                ${renderTooltip("Identifies the area most likely slowing your progress right now.", "Solving the right problem is faster than doing more work.")}
                            </h3>
                        </div>
                        <div style="background: var(--color-bg-main); padding: 1.25rem; border-radius: var(--radius-md); font-size: 0.95rem; line-height: 1.6; color: var(--color-black);">
                            ${insight}
                        </div>
                    </div>

                    <!-- Decision Filter -->
                    <div class="card" style="border-top: 4px solid var(--color-secondary); flex-shrink: 0;">
                        <div class="flex items-center gap-2 mb-4">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary-dark)" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                            <h3 style="margin: 0; display: flex; align-items: center;">
                                CEO vs Busy Work
                                ${renderTooltip("A simple filter to test if a new idea or task is worth doing.", "Before you drop everything to launch a new funnel, run it through this filter.")}
                            </h3>
                        </div>
                        <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Paste a new idea below to evaluate it against your 90-day goal.</p>
                        <form id="decision-filter-form">
                            <div class="form-group mb-2">
                                <textarea class="form-textarea" id="idea-input" placeholder="e.g., Start a TikTok channel..." required style="min-height: 60px;"></textarea>
                            </div>
                            <button type="submit" class="btn btn-secondary" style="width: 100%; padding: 0.5rem;">Evaluate Idea</button>
                        </form>
                        <div id="decision-result" class="mt-4" style="display: none; background: var(--color-secondary-light); padding: 1rem; border-radius: var(--radius-md); border-left: 4px solid var(--color-secondary);">
                            <div class="flex items-center gap-2 mb-1">
                                <span style="font-weight: 600; color: var(--color-secondary-dark); font-size: 0.85rem;">Verdict:</span>
                                <span id="alignment-score" style="font-weight: 700; font-size: 0.85rem;"></span>
                            </div>
                            <p id="alignment-explanation" style="font-size: 0.85rem; color: var(--color-text-main); margin-top: 0.25rem; line-height: 1.4;"></p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;
}

// Logic Rules Engine
function generateInsights(store) {
    const reviews = store.reviews || [];
    const plans = store.weeklyPlans || [];
    const name = store.profile?.name || 'CEO';
    const bottleneck = store.profile?.bottleneck || '';

    let baseGreeting = `Hey ${name}, let's look at your momentum. `;

    if (reviews.length < 2 && plans.length < 2) {
        return baseGreeting + "Complete a few more weekly plans and Friday reviews so I can start learning your working patterns and generating personalized insights.";
    }

    const recentPlans = plans.slice(-3);
    let visibilityCount = 0; let followUpCount = 0; let revActionCount = 0;

    recentPlans.forEach(p => {
        if (p.visibilityAction?.length > 5) visibilityCount++;
        if (p.followUps?.length > 5 && !p.followUps.toLowerCase().includes('none')) followUpCount++;
        if (p.revenueAction?.length > 5) revActionCount++;
    });

    if (visibilityCount >= 2 && followUpCount === 0) {
        let msg = baseGreeting + "I'm noticing you've had strong visibility over the last few weeks! However, I don't see many follow-ups planned. ";
        if (bottleneck.includes('Sales')) msg += "Since sales conversion is a bottleneck for you right now, I highly recommend scheduling two follow-up conversations this week.";
        else msg += "Consider scheduling follow-up conversations this week to turn that visibility into revenue.";
        return msg;
    }

    if (revActionCount < 2 && recentPlans.length >= 3) {
        return baseGreeting + "Revenue-generating actions haven't been your main focus lately. Let's make direct sales conversations your top priority this week.";
    }

    const recentReviews = reviews.slice(-3);
    let difficultContent = false;
    recentReviews.forEach(r => {
        if (r.difficult) {
            const diff = r.difficult.toLowerCase();
            if (diff.includes('email') || diff.includes('content') || diff.includes('writing')) difficultContent = true;
        }
    });

    if (difficultContent) {
        let msg = baseGreeting + "You've mentioned content creation as a drain in your recent Friday reviews. ";
        if (bottleneck.includes('Time')) msg += "Since time is tight, dedicate a specific 90-minute block early in the week to get it out of the way.";
        else msg += "Consider lowering the volume or batching your content so it doesn't leak energy across your week.";
        return msg;
    }

    return baseGreeting + "You are consistently logging your plans and protecting your CEO time—well done! Keep focusing closely on your revenue-generating actions.";
}

function coachAttachEvents() {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-coach')?.classList.add('active');

    // Chat Events
    const messagesContainer = document.getElementById('chat-messages');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const submitBtn = document.getElementById('chat-submit');
    const clearBtn = document.getElementById('clear-chat-btn');

    if (messagesContainer && form) {
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm("Clear your working chat history?")) {
                    window.ceoChatHistory = [];
                    coachAttachEvents();
                }
            });
        }

        if (!window.ceoChatHistory || window.ceoChatHistory.length === 0) {
            window.ceoChatHistory = [];
            messagesContainer.innerHTML = renderMessage('assistant', "Hello. I have completely reviewed your 90-day trajectory, revenue pacing, and your primary bottlenecks. **What is standing in your way right now?**");
        } else {
            messagesContainer.innerHTML = window.ceoChatHistory.map(m => renderMessage(m.role, m.content)).join('');
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;

            window.ceoChatHistory.push({ role: 'user', content: text });
            messagesContainer.innerHTML += renderMessage('user', text);
            input.value = ''; input.disabled = true; submitBtn.disabled = true; submitBtn.innerText = '...';
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            const loadingId = 'loading-' + Date.now();
            messagesContainer.innerHTML += `
                <div id="${loadingId}" style="align-self: flex-start; background: white; padding: 1rem 1.25rem; border-radius: 16px 16px 16px 4px; border: 1px solid var(--color-border); color: var(--color-text-muted);">
                    <i>Thinking...</i>
                </div>
            `;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            try {
                // generateAIResponse is globally injected by bundler
                const aiResponse = await generateAIResponse(window.ceoChatHistory);
                const loader = document.getElementById(loadingId);
                if(loader) loader.remove();

                window.ceoChatHistory.push({ role: 'assistant', content: aiResponse });
                messagesContainer.innerHTML += renderMessage('assistant', aiResponse);
            } catch (err) {
                const loader = document.getElementById(loadingId);
                if(loader) loader.remove();
                messagesContainer.innerHTML += renderMessage('assistant', `**Network Protocol Error:** ${err.message}. Please verify your API key in Settings.`);
                window.ceoChatHistory.pop();
            } finally {
                input.disabled = false; submitBtn.disabled = false; submitBtn.innerText = 'Send';
                input.focus();
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        });
    }

    // Decision Filter Events
    const filterForm = document.getElementById('decision-filter-form');
    if (filterForm) {
        filterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const idea = document.getElementById('idea-input').value.toLowerCase();
            const store = getStore();
            const focus = (store.goals?.focus || '').toLowerCase();
            const priorities = (store.goals?.priorities || []).join(' ').toLowerCase();

            let score = "Busy Work";
            let color = "#B42318";
            let bg = "#FEE4E2";
            let explanation = "This idea does not strongly align with your current 90-day focus or priorities. It may be a distraction. Put it in an idea parking lot for the next quarter.";

            const ideaWords = idea.split(' ').filter(w => w.length > 3);
            let matchCount = 0;
            ideaWords.forEach(word => {
                if (focus.includes(word) || priorities.includes(word)) matchCount++;
            });

            if (matchCount >= 2 || idea.includes('sales') || idea.includes('revenue')) {
                score = "Strategic";
                color = "#027A48"; bg = "#E1FDF4";
                explanation = "This idea strongly supports your current 90-day focus. It's a solid action to add to your weekly plan.";
            } else if (matchCount === 1) {
                score = "Busy Work";
                color = "#B54708"; bg = "#FEF0C7";
                explanation = "This idea has some alignment with your goals, but might be secondary. Only proceed if you have extra capacity.";
            }

            const scoreEl = document.getElementById('alignment-score');
            scoreEl.textContent = score; scoreEl.style.color = color; scoreEl.style.backgroundColor = bg;
            document.getElementById('alignment-explanation').textContent = explanation;
            document.getElementById('decision-result').style.display = 'block';
        });
    }
}
