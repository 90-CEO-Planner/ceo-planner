// chatWidget.js

function renderWidgetMessage(role, content) {
    const isAi = role === 'assistant';
    const bg = isAi ? '#F8FAFC' : 'var(--color-primary)';
    const color = isAi ? 'var(--color-text-main)' : 'white';
    const align = isAi ? 'flex-start' : 'flex-end';
    const radius = isAi ? '16px 16px 16px 4px' : '16px 16px 4px 16px';
    const border = isAi ? '1px solid var(--color-border)' : 'none';

    let formattedContent = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

    return `
        <div style="align-self: ${align}; max-width: 85%; background: ${bg}; color: ${color}; padding: 0.75rem 1rem; border-radius: ${radius}; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: ${border}; line-height: 1.4; font-size: 0.85rem;">
            ${formattedContent}
        </div>
    `;
}

function initChatWidget() {
    // Inject Widget HTML into body
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'ceo-ai-widget';
    widgetContainer.style.position = 'fixed';
    widgetContainer.style.bottom = '20px';
    widgetContainer.style.right = '20px';
    widgetContainer.style.zIndex = '9999';
    widgetContainer.style.fontFamily = "'Inter', sans-serif";

    widgetContainer.innerHTML = `
        <!-- Floating Chat Window (Hidden by default) -->
        <div id="ai-chat-window" style="display: none; position: absolute; bottom: 70px; right: 0; width: 350px; height: 500px; background: white; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); border: 1px solid var(--color-border); flex-direction: column; overflow: hidden; transform-origin: bottom right; transition: all 0.2s ease;">
            
            <!-- Header -->
            <div style="padding: 1rem; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); color: white;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem;">AI</div>
                    <div>
                        <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600;">CEO Advisor</h3>
                    </div>
                </div>
                <!-- Clear Chat Button -->
                <button id="ai-widget-clear" style="background: transparent; border: none; color: rgba(255,255,255,0.8); cursor: pointer; padding: 0.25rem;">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>

            <!-- Messages Container -->
            <div id="ai-widget-messages" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; background: white;">
                <!-- Content -->
            </div>

            <!-- Input Form -->
            <div style="padding: 0.75rem 1rem; border-top: 1px solid var(--color-border); background: #F8FAFC;">
                <form id="ai-widget-form" style="display: flex; gap: 0.5rem; margin: 0;">
                    <input type="text" id="ai-widget-input" placeholder="Ask your Co-Pilot..." style="flex: 1; border-radius: 20px; border: 1px solid var(--color-border); padding: 0.5rem 1rem; font-size: 0.85rem; outline: none; transition: border-color 0.2s;" autocomplete="off" required>
                    <button type="submit" id="ai-widget-submit" style="background: var(--color-primary); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: transform 0.1s;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: -2px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </form>
            </div>
        </div>

        <!-- Floating Toggle Button -->
        <button id="ai-widget-toggle" style="width: 60px; height: 60px; border-radius: 50%; background: var(--color-primary); color: white; border: none; box-shadow: 0 4px 10px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease, background 0.2s;">
            <svg id="ai-icon-open" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <svg id="ai-icon-close" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    document.body.appendChild(widgetContainer);

    // Elements
    const toggleBtn = document.getElementById('ai-widget-toggle');
    const chatWindow = document.getElementById('ai-chat-window');
    const form = document.getElementById('ai-widget-form');
    const input = document.getElementById('ai-widget-input');
    const submitBtn = document.getElementById('ai-widget-submit');
    const messagesEl = document.getElementById('ai-widget-messages');
    const clearBtn = document.getElementById('ai-widget-clear');
    const iconOpen = document.getElementById('ai-icon-open');
    const iconClose = document.getElementById('ai-icon-close');

    let isOpen = false;

    // Load History Function
    const loadMemory = () => {
        if (!window.ceoChatHistory || window.ceoChatHistory.length === 0) {
            window.ceoChatHistory = [];
            const greeting = `Hello! I am your Executive AI Advisor. I have your 90-day goals, active bottleneck, and recent task history fully loaded in my context. How can I accelerate your productivity today?`;
            
            messagesEl.innerHTML = renderWidgetMessage('assistant', greeting);
            
            // Inject Quick Prompt Chips
            messagesEl.innerHTML += `
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.25rem;">
                    <button onclick="document.getElementById('ai-widget-input').value='Critique my latest weekly plan: are there too many distractions?'; document.getElementById('ai-widget-submit').click();" style="text-align: left; background: white; border: 1px solid var(--color-primary); color: var(--color-primary); padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.8rem; cursor: pointer; transition: background 0.2s;">
                        🎯 <b>Plan Alignment:</b> Critique my weekly priorities.
                    </button>
                    <button onclick="document.getElementById('ai-widget-input').value='Give me 3 specific, fast actions I can take this week to overcome my main bottleneck.'; document.getElementById('ai-widget-submit').click();" style="text-align: left; background: white; border: 1px solid var(--color-primary); color: var(--color-primary); padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.8rem; cursor: pointer; transition: background 0.2s;">
                        🚧 <b>Bottleneck Resolution:</b> Give me 3 fast actions to unblock me.
                    </button>
                    <button onclick="document.getElementById('ai-widget-input').value='Based on my current business stage and goals, what is the #1 revenue-generating action I should focus on today?'; document.getElementById('ai-widget-submit').click();" style="text-align: left; background: white; border: 1px solid var(--color-primary); color: var(--color-primary); padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.8rem; cursor: pointer; transition: background 0.2s;">
                        💰 <b>Revenue Focus:</b> What is the #1 action I should take today?
                    </button>
                </div>
            `;
            
        } else {
            // Render from history, removing any old structural HTML
            const displayHistory = window.ceoChatHistory.filter(m => m.role !== 'system');
            messagesEl.innerHTML = displayHistory.map(m => renderWidgetMessage(m.role, m.content)).join('');
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    };

    // Toggle Window
    toggleBtn.addEventListener('click', () => {
        isOpen = !isOpen;
        if (isOpen) {
            chatWindow.style.display = 'flex';
            iconOpen.style.display = 'none';
            iconClose.style.display = 'block';
            toggleBtn.style.background = 'var(--color-black)';
            loadMemory();
            setTimeout(() => input.focus(), 100);
        } else {
            chatWindow.style.display = 'none';
            iconOpen.style.display = 'block';
            iconClose.style.display = 'none';
            toggleBtn.style.background = 'var(--color-primary)';
        }
    });

    // Clear Chat
    clearBtn.addEventListener('click', () => {
        if (confirm("Reset local chat memory?")) {
            window.ceoChatHistory = [];
            loadMemory();
        }
    });

    // Handle Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        window.ceoChatHistory.push({ role: 'user', content: text });
        messagesEl.innerHTML += renderWidgetMessage('user', text);
        input.value = '';
        input.disabled = true;
        submitBtn.disabled = true;
        messagesEl.scrollTop = messagesEl.scrollHeight;

        const loadingId = 'wid-load-' + Date.now();
        messagesEl.innerHTML += `
            <div id="${loadingId}" style="align-self: flex-start; padding: 0.5rem 1rem; color: var(--color-text-muted); font-size: 0.8rem; font-style: italic;">
                Thinking...
            </div>
        `;
        messagesEl.scrollTop = messagesEl.scrollHeight;

        try {
            const aiResponse = await generateAIResponse(window.ceoChatHistory);
            document.getElementById(loadingId).remove();
            
            window.ceoChatHistory.push({ role: 'assistant', content: aiResponse });
            messagesEl.innerHTML += renderWidgetMessage('assistant', aiResponse);
        } catch (err) {
            document.getElementById(loadingId).remove();
            messagesEl.innerHTML += renderWidgetMessage('assistant', `Error: ${err.message}`);
            window.ceoChatHistory.pop();
        } finally {
            input.disabled = false;
            submitBtn.disabled = false;
            input.focus();
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    });
}
