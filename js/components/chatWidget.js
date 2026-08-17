// chatWidget.js
import { showConfirm } from './toast.js';
import { canRememberChats } from './proGate.js';
import { getCoachChat, saveCoachChat, clearCoachChat, getLocalDateString, parseDateInput } from '../store.js';

function renderWidgetMessage(role, content) {
    const isAi = role === 'assistant';
    const bg = isAi ? '#F8FAFC' : 'var(--color-primary-light)';
    const color = 'var(--color-black)';
    const align = isAi ? 'flex-start' : 'flex-end';
    const radius = isAi ? '16px 16px 16px 4px' : '16px 16px 4px 16px';
    const border = '1px solid var(--color-border)';

    let formattedContent = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

    return `
        <div style="align-self: ${align}; max-width: 85%; background: ${bg}; color: ${color}; padding: 0.75rem 1rem; border-radius: ${radius}; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: ${border}; line-height: 1.4; font-size: 0.85rem;">
            ${formattedContent}
        </div>
    `;
}

// A quiet date marker between the messages of one day and the next.
//
// This is the whole visible surface of the memory feature. Without it, a
// remembered conversation looks identical to one you just had, and a reply
// referring to something "we said earlier" reads as the coach hallucinating
// rather than as it doing its job.
function renderDayDivider(day) {
    const label = day === getLocalDateString()
        ? 'Today'
        : parseDateInput(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

    return `
        <div style="display: flex; align-items: center; gap: 0.5rem; margin: 0.25rem 0; color: var(--color-text-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em;">
            <span style="flex: 1; height: 1px; background: var(--color-border);"></span>
            <span>${label}</span>
            <span style="flex: 1; height: 1px; background: var(--color-border);"></span>
        </div>
    `;
}

// The stored conversation, laid out with a divider wherever the day changes.
//
// Dividers are skipped entirely when everything on screen happened today: a
// single "Today" line above a conversation you are in the middle of explains
// nothing and just takes up room in a 350px panel.
function renderConversation(history) {
    const days = history.map(m => (m.at ? getLocalDateString(new Date(m.at)) : null));
    const distinct = new Set(days.filter(Boolean));
    const showDividers = distinct.size > 1 || (distinct.size === 1 && !distinct.has(getLocalDateString()));

    let lastDay = null;
    return history.map((m, i) => {
        let html = '';
        if (showDividers && days[i] && days[i] !== lastDay) {
            html += renderDayDivider(days[i]);
            lastDay = days[i];
        }
        return html + renderWidgetMessage(m.role, m.content);
    }).join('');
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

    // Hide widget on wizard, auth, and billing pages initially
    const hash = window.location.hash || '#/';
    const path = hash.split('?')[0];
    const isAuthRoute = path === '#/login' || path === '#/signup' || path === '#/forgot-password' || path === '#/reset-password';
    if (path === '#/wizard' || isAuthRoute || path === '#/billing') {
        widgetContainer.style.display = 'none';
    } else {
        widgetContainer.style.display = 'block';
    }

    widgetContainer.innerHTML = `
        <!-- Floating Chat Window (Hidden by default) -->
        <div id="ai-chat-window" style="display: none; position: absolute; bottom: 70px; right: 0; width: 350px; height: 500px; background: white; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); border: 1px solid var(--color-border); flex-direction: column; overflow: hidden; transform-origin: bottom right; transition: all 0.2s ease;">
            
            <!-- Header -->
            <div style="padding: 1rem; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); color: white;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem;">AI</div>
                    <div>
                        <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600;">Executive AI Coach</h3>
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
                <!-- The panel is narrow, so this is the compact one-line variant of
                     the teaser rather than the full strip used on the wide screens. -->
                ${canRememberChats() ? '' : `
                <button type="button" class="pro-teaser pro-teaser-compact" data-pro-feature="coach-memory">
                    <svg class="pro-teaser-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span class="pro-teaser-hint">Pick up where you left off. Pro remembers your chats.</span>
                </button>`}
                <form id="ai-widget-form" style="display: flex; gap: 0.5rem; margin: 0;">
                    <input type="text" id="ai-widget-input" placeholder="Ask your Co-Pilot..." style="flex: 1; border-radius: 20px; border: 1px solid var(--color-border); padding: 0.5rem 1rem; font-size: 0.85rem; color: var(--color-black); outline: none; transition: border-color 0.2s;" autocomplete="off" required>
                    <button type="submit" id="ai-widget-submit" style="background: var(--color-primary); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: transform 0.1s;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: -2px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </form>
            </div>
        </div>

        <!-- Onboarding Coach Tooltip Popover -->
        <div id="ai-coach-tooltip-popover" style="display: ${localStorage.getItem('first_coach_visit_done') === 'true' ? 'none' : 'block'}; position: absolute; bottom: 75px; right: 0; width: 280px; background: white; color: var(--color-text-main); padding: 1rem; border-radius: 12px; border: 1px solid var(--color-primary-light); border-left: 4px solid var(--color-primary); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 9998;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.25rem;">
                <strong style="color: var(--color-primary-dark); font-size: 0.9rem;">Meet Your Executive AI Coach</strong>
                <button id="btn-close-coach-tooltip" style="background: none; border: none; font-size: 1.1rem; color: var(--color-text-muted); cursor: pointer; padding: 0;">&times;</button>
            </div>
            <p style="margin: 0; font-size: 0.85rem; line-height: 1.4;">
                Your Executive AI Coach knows your goals and your numbers. Ask it anything — or hit 'Generate Executive Report' to see exactly where your funnel needs work.
            </p>
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

    // Dismiss Tooltip logic
    const dismissTooltip = () => {
        localStorage.setItem('first_coach_visit_done', 'true');
        const tooltipPopover = document.getElementById('ai-coach-tooltip-popover');
        if (tooltipPopover) tooltipPopover.style.display = 'none';
    };

    const closeCoachTooltipBtn = document.getElementById('btn-close-coach-tooltip');
    if (closeCoachTooltipBtn) {
        closeCoachTooltipBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent opening chat
            dismissTooltip();
        });
    }

    // Write the thread back to the store, and take back what was actually
    // written — saveCoachChat trims to its caps, and if the copy in memory kept
    // growing past them the two would disagree until the next page load
    // silently shortened the conversation.
    //
    // Called after the answer lands rather than after the question is sent. A
    // stored user message with no reply comes back on the next load looking
    // like a question the coach ignored.
    const rememberChat = () => {
        if (!canRememberChats()) return;
        window.ceoChatHistory = saveCoachChat(window.ceoChatHistory);
    };

    // Load History Function
    const loadMemory = () => {
        // Pro reads the thread back from the store; every other plan keeps
        // whatever this tab has said since it was opened, and no more.
        //
        // Done here rather than at init because the plan tier is resolved
        // asynchronously on load, and opening the panel is the first moment the
        // answer is actually needed.
        if (canRememberChats() && (!window.ceoChatHistory || window.ceoChatHistory.length === 0)) {
            window.ceoChatHistory = getCoachChat().map(m => ({ ...m }));
        }

        if (!window.ceoChatHistory || window.ceoChatHistory.length === 0) {
            window.ceoChatHistory = [];
            const greeting = `Hello! I am your Executive AI Coach. I have your 90-day goals, active bottleneck, and recent task history fully loaded in my context. How can I accelerate your productivity today?`;
            
            messagesEl.innerHTML = renderWidgetMessage('assistant', greeting);
            
            // Inject Quick Prompt Chips
            messagesEl.innerHTML += `
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.25rem;">
                    <button type="button" onclick="document.getElementById('ai-widget-input').value='Critique my latest weekly plan: are there too many distractions?'; document.getElementById('ai-widget-submit').click();" style="text-align: left; background: white; border: 1px solid var(--color-text-muted); color: var(--color-black); padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.8rem; cursor: pointer; transition: background 0.2s;">
                        🎯 <b>Plan Alignment:</b> Critique my weekly priorities.
                    </button>
                    <button type="button" onclick="document.getElementById('ai-widget-input').value='Give me 3 specific, fast actions I can take this week to overcome my main bottleneck.'; document.getElementById('ai-widget-submit').click();" style="text-align: left; background: white; border: 1px solid var(--color-text-muted); color: var(--color-black); padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.8rem; cursor: pointer; transition: background 0.2s;">
                        🚧 <b>Bottleneck Resolution:</b> Give me 3 fast actions to unblock me.
                    </button>
                    <button type="button" onclick="document.getElementById('ai-widget-input').value='Based on my current business stage and goals, what is the #1 revenue-generating action I should focus on today?'; document.getElementById('ai-widget-submit').click();" style="text-align: left; background: white; border: 1px solid var(--color-text-muted); color: var(--color-black); padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.8rem; cursor: pointer; transition: background 0.2s;">
                        💰 <b>Revenue Focus:</b> What is the #1 action I should take today?
                    </button>
                </div>
            `;
            
        } else {
            // Render from history, removing any old structural HTML
            const displayHistory = window.ceoChatHistory.filter(m => m.role !== 'system');
            messagesEl.innerHTML = renderConversation(displayHistory);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    };

    // Toggle Window
    toggleBtn.addEventListener('click', () => {
        dismissTooltip();
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
    //
    // The warning changes with the plan, because the button now does two
    // different things. On the base plan it drops a conversation that was going
    // to end at the next refresh anyway. On Pro it deletes something that was
    // being kept on purpose, everywhere the account is signed in — and telling
    // someone that in the same mild words would be the app understating what it
    // is about to do.
    clearBtn.addEventListener('click', async () => {
        const remembers = canRememberChats();
        const message = remembers
            ? 'This deletes the whole conversation for good, on this device and anywhere else you sign in. Your coach will start fresh.'
            : 'This clears the conversation you have open with your coach.';

        const ok = await showConfirm(message, {
            title: 'Reset chat memory?', confirmText: 'Reset', danger: true
        });
        if (!ok) return;
        window.ceoChatHistory = [];
        if (remembers) clearCoachChat();
        loadMemory();
    });

    // Handle Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        // `at` is what the date dividers read. It is stripped before the
        // messages are sent to the model — see recentContext in aiService.js.
        window.ceoChatHistory.push({ role: 'user', content: text, at: new Date().toISOString() });
        messagesEl.innerHTML += renderWidgetMessage('user', text);
        input.value = '';
        input.disabled = true;
        submitBtn.disabled = true;
        messagesEl.scrollTop = messagesEl.scrollHeight;

        const loadingId = 'wid-load-' + Date.now();
        messagesEl.innerHTML += `
            <div id="${loadingId}" style="align-self: flex-start; padding: 0.5rem 1rem; color: var(--color-black); font-size: 0.8rem; font-style: italic;">
                Thinking...
            </div>
        `;
        messagesEl.scrollTop = messagesEl.scrollHeight;

        try {
            const aiResponse = await generateAIResponse(window.ceoChatHistory);
            document.getElementById(loadingId).remove();
            
            window.ceoChatHistory.push({ role: 'assistant', content: aiResponse, at: new Date().toISOString() });
            messagesEl.innerHTML += renderWidgetMessage('assistant', aiResponse);
            rememberChat();
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
