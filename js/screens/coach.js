// coach.js
import { renderNav } from '../components/nav.js';

function renderMessage(role, content) {
    const isAi = role === 'assistant';
    const bg = isAi ? 'white' : 'var(--color-primary)';
    const color = isAi ? 'var(--color-text-main)' : 'white';
    const align = isAi ? 'flex-start' : 'flex-end';
    const radius = isAi ? '16px 16px 16px 4px' : '16px 16px 4px 16px';
    const border = isAi ? '1px solid var(--color-border)' : 'none';

    // Parse markdown (simple bold/breaks for MVP)
    let formattedContent = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

    return `
        <div style="align-self: ${align}; max-width: 85%; background: ${bg}; color: ${color}; padding: 1rem 1.25rem; border-radius: ${radius}; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: ${border}; line-height: 1.5; font-size: 0.95rem;">
            ${formattedContent}
        </div>
    `;
}

export function renderCoach() {
    window.setScreenModule({ attachEvents: coachAttachEvents });

    const hasKey = !!localStorage.getItem('ceo_openai_key');

    if (!hasKey) {
        return `
            ${renderNav()}
            <div class="main-content" style="max-width: 800px;">
                <div class="card text-center" style="max-width: 500px; margin: 4rem auto; padding: 3rem; border: dashed 2px var(--color-border); box-shadow: none;">
                    <div style="background: #E0E7FF; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <h2 style="margin-bottom: 1rem; color: var(--color-black);">Unlock the General AI Advisor</h2>
                    <p style="color: var(--color-text-muted); margin-bottom: 2rem; line-height: 1.5;">The conversational CEO Advisor requires an OpenAI API Key to securely process and analyze your local strategy database.</p>
                    <a href="#/settings" class="btn btn-primary" style="display: inline-block;">Go to Settings</a>
                </div>
            </div>
        `;
    }

    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 900px; height: 100vh; padding: 1rem 2rem; display: flex; flex-direction: column;">
            
            <div style="display: flex; flex-direction: column; flex: 1; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid var(--color-border);">
                
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
                        <input type="text" id="chat-input" class="form-input" placeholder="Ask for strategy, complain about bottlenecks, or get advice..." style="flex: 1; border-radius: 20px; padding-left: 1.25rem;" autocomplete="off" required>
                        <button type="submit" class="btn btn-primary" id="chat-submit" style="border-radius: 20px; padding: 0.75rem 1.5rem;">
                            Send
                        </button>
                    </form>
                </div>
            </div>
        </div>
    `;
}

function coachAttachEvents() {
    // Nav active state update
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-coach')?.classList.add('active');

    const messagesContainer = document.getElementById('chat-messages');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const submitBtn = document.getElementById('chat-submit');
    const clearBtn = document.getElementById('clear-chat-btn');

    if (!messagesContainer || !form) return;

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm("Clear your working chat history?")) {
                window.ceoChatHistory = [];
                coachAttachEvents();
            }
        });
    }

    // Load initial greeting if history is empty
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

        // Add user message to history and UI
        window.ceoChatHistory.push({ role: 'user', content: text });
        messagesContainer.innerHTML += renderMessage('user', text);
        
        input.value = '';
        input.disabled = true;
        submitBtn.disabled = true;
        submitBtn.innerText = '...';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Add loading skeleton
        const loadingId = 'loading-' + Date.now();
        messagesContainer.innerHTML += `
            <div id="${loadingId}" style="align-self: flex-start; background: white; padding: 1rem 1.25rem; border-radius: 16px 16px 16px 4px; border: 1px solid var(--color-border); color: var(--color-text-muted);">
                <i>Thinking...</i>
            </div>
        `;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            // Call aiService (global namespace from bundle)
            const aiResponse = await generateAIResponse(window.ceoChatHistory);
            
            // Remove loading
            const loader = document.getElementById(loadingId);
            if(loader) loader.remove();

            // Add AI response to history and UI
            window.ceoChatHistory.push({ role: 'assistant', content: aiResponse });
            messagesContainer.innerHTML += renderMessage('assistant', aiResponse);
        } catch (err) {
            const loader = document.getElementById(loadingId);
            if(loader) loader.remove();
            messagesContainer.innerHTML += renderMessage('assistant', `**Network Protocol Error:** ${err.message}. Please verify your API key in Settings.`);
            // Pop the failed user message off history to prevent corrupted conversations
            window.ceoChatHistory.pop();
        } finally {
            input.disabled = false;
            submitBtn.disabled = false;
            submitBtn.innerText = 'Send';
            input.focus();
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    });
}
