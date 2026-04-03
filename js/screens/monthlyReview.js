// monthlyReview.js
import { renderNav } from '../components/nav.js';
import { getStore, addMonthlyReview } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';

export function renderMonthlyReview() {
    window.setScreenModule({ attachEvents: monthlyReviewAttachEvents });
    const store = getStore();
    const reflectionSummary = generateReflectionSummary(store);

    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 700px;">
            <div style="margin-bottom: 2rem;">
                <h2>Monthly CEO Strategy Review</h2>
                <p style="color: var(--color-text-muted);">A deeper 30-day reflection to refine your strategy and eliminate distractions.</p>
            </div>

            <div class="card mb-8" style="border-left: 4px solid var(--color-accent); background-color: var(--color-bg-light);">
                <div class="flex items-center gap-2 mb-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-dark)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    <h3 style="margin: 0; color: var(--color-accent-dark);">AI Reflection Summary</h3>
                </div>
                <p style="font-size: 1rem; color: var(--color-text-main); margin: 0; line-height: 1.5;">
                    ${reflectionSummary}
                </p>
            </div>

            <form id="monthly-review-form" class="card">
                <div class="form-group mb-6 text-center" style="background: var(--color-bg-main); padding: 1.5rem; border-radius: var(--radius-md); border: 1px dashed var(--color-border);">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; color: var(--color-text-main); margin-bottom: 1rem;">
                        Easier to talk it out? Use Voice Reflection to fill out your review.
                        ${renderTooltip("A hands-free way to log your month.", "Talking out loud helps you process your thoughts faster and ensures you actually complete the deep reflection.")}
                    </p>
                    <button type="button" id="btn-voice-reflection" class="btn btn-secondary" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; max-width: 300px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                        <span id="voice-btn-text">Start Voice Reflection</span>
                    </button>
                    <p id="voice-status" style="font-size: 0.85rem; color: var(--color-primary-dark); margin-top: 0.75rem; display: none; font-weight: 500;">Listening...</p>
                </div>

                <div class="form-group">
                    <label class="form-label" style="font-size: 1.1rem; color: #027A48;">1. What activity generated the most leads or interest this month?</label>
                    <textarea class="form-textarea" id="mrev-leads" placeholder="e.g., Hosting the 3-day challenge, speaking on that podcast." required style="min-height: 80px;"></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem; color: var(--color-primary-dark);">2. What specific action generated actual sales?</label>
                    <textarea class="form-textarea" id="mrev-sales" placeholder="e.g., Direct DMs to past clients, the webinar pitch." required style="min-height: 80px;"></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem; color: #B42318;">3. What drained your energy or felt misaligned?</label>
                    <textarea class="form-textarea" id="mrev-drain" placeholder="e.g., Trying to post on TikTok 3x a day, managing my own inbox." required style="min-height: 80px;"></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem;">4. What should be eliminated or delegated next month?</label>
                    <textarea class="form-textarea" id="mrev-eliminate" placeholder="e.g., I need to stop designing my own graphics and hire a VA." required style="min-height: 80px;"></textarea>
                </div>

                <div class="flex justify-end mt-8">
                    <button type="submit" class="btn btn-primary">Generate My CEO Summary</button>
                </div>
            </form>
            
            <div id="monthly-summary-result" style="display: none; margin-top: 2rem;">
                <!-- Filled via JS -->
            </div>
        </div>
    `;
}

function monthlyReviewAttachEvents() {
    // Nav active state - we don't have a specific nav link for this yet, so we can just clear active states or highlight progress
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    // Voice Reflection Logic
    const voiceBtn = document.getElementById('btn-voice-reflection');
    const voiceBtnText = document.getElementById('voice-btn-text');
    const voiceStatus = document.getElementById('voice-status');
    let recognition = null;
    let isRecording = false;
    let activeTextArea = document.getElementById('mrev-leads'); // Default target

    // Track active text area
    document.querySelectorAll('.form-textarea').forEach(ta => {
        ta.addEventListener('focus', (e) => {
            activeTextArea = e.target;
        });
    });

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = function () {
            isRecording = true;
            voiceBtn.classList.remove('btn-secondary');
            voiceBtn.classList.add('btn-primary');
            voiceBtnText.textContent = "Stop Recording";
            voiceStatus.style.display = "block";
        };

        recognition.onresult = function (event) {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript && activeTextArea) {
                // Append with a space if there's already text
                activeTextArea.value += (activeTextArea.value ? ' ' : '') + finalTranscript.trim() + '.';
            }
        };

        recognition.onerror = function (event) {
            console.error("Speech recognition error", event.error);
            stopRecording();
            alert("Microphone error. Please check permissions.");
        };

        recognition.onend = function () {
            stopRecording();
        };
    } else {
        if (voiceBtn) {
            voiceBtn.style.display = 'none';
        }
    }

    function stopRecording() {
        isRecording = false;
        if (recognition) recognition.stop();
        if (voiceBtn) {
            voiceBtn.classList.add('btn-secondary');
            voiceBtn.classList.remove('btn-primary');
            voiceBtnText.textContent = "Start Voice Reflection";
        }
        if (voiceStatus) {
            voiceStatus.style.display = "none";
        }
    }

    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            if (isRecording) {
                stopRecording();
            } else {
                if (recognition) {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        });
    }

    const form = document.getElementById('monthly-review-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isRecording) stopRecording();

            const review = {
                leads: document.getElementById('mrev-leads').value,
                sales: document.getElementById('mrev-sales').value,
                drain: document.getElementById('mrev-drain').value,
                eliminate: document.getElementById('mrev-eliminate').value
            };

            // Save the monthly review to store
            addMonthlyReview(review);

            // Generate Summary Output
            const resultDiv = document.getElementById('monthly-summary-result');
            form.style.display = 'none'; // Hide the form
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <div class="card" style="border-top: 4px solid var(--color-primary); background-color: #f9f9ff; text-align: center;">
                    <div class="spinner" style="margin: 2rem auto;"></div>
                    <p style="font-weight: 500; font-size: 0.95rem; color: var(--color-primary-dark); margin-bottom: 2rem;">Analyzing your ${new Date().toLocaleString('default', { month: 'long' })} execution data...</p>
                </div>
            `;
            window.scrollTo({ top: 0, behavior: 'smooth' });

            const store = getStore();
            const recentReviews = (store.reviews || []).slice(-4).map(r => `
- Week of ${new Date(r.date).toLocaleDateString()}:
  Worked Well: ${r.workedWell}
  Difficult: ${r.difficult}
  Moved Forward: ${r.movedForward}
            `.trim()).join('\n\n');

            const promptText = `I am submitting my CEO Monthly Review. 
Here are my answers to the 4 core questions:
1. Activity that generated the most leads: ${review.leads}
2. Specific action that generated actual sales: ${review.sales}
3. What drained my energy/felt misaligned: ${review.drain}
4. What I am eliminating/delegating next month: ${review.eliminate}

Here is my data from the weekly Friday Reviews this past month:
${recentReviews ? recentReviews : 'No weekly reviews filled out this month.'}

Based on this data, please write a hyper-personalized Monthly CEO Summary.
Do not use generic language. Be extremely direct.
Format it using Markdown with two sections:
### 📈 The High-Impact Action
Analyze what actually worked for me based on my real data. Give me a clear directive on what to double down on next month.

### ✂️ The Elimination Directive
Analyze what drained me. Be ruthless. Tell me exactly what I need to stop doing, automate, or delegate to protect my CEO focus.`;

            try {
                const { data, error } = await window.db.functions.invoke('chat', {
                    body: { messages: [{ role: 'user', content: promptText }] }
                });

                if (error) throw new Error(error.message);
                if (data.error) throw new Error(data.error.message || data.error);

                // For simple markdown bolding and line breaks since we aren't using a markdown parser library
                let aiOutput = data.choices[0].message.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/### (.*?)\n/g, '<h4 style="margin-top: 1.5rem; color: var(--color-primary-dark);">$1</h4>')
                    .replace(/\n/g, '<br>');

                resultDiv.innerHTML = `
                    <div class="card" style="border-top: 4px solid var(--color-primary); background-color: #f9f9ff;">
                        <h3 class="mb-4">Your Monthly CEO Summary is Ready</h3>
                        <div style="font-size: 1rem; line-height: 1.6; color: var(--color-text-main);">
                            ${aiOutput}
                        </div>
                        <div class="flex justify-center mt-6">
                            <a href="#/progress" class="btn btn-secondary">Go to Progress Dashboard</a>
                        </div>
                    </div>
                `;
            } catch (err) {
                console.error("AI Generation Failed:", err);
                resultDiv.innerHTML = `
                    <div class="card" style="border-top: 4px solid #B42318; background-color: #fcf0f0;">
                        <h3 class="mb-4">Oops!</h3>
                        <p>We couldn't generate your AI summary right now. Your review has been saved successfully.</p>
                        <p style="font-size: 0.8rem; color: #B42318;">Error: ${err.message}</p>
                        <div class="flex justify-center mt-6">
                            <a href="#/progress" class="btn btn-secondary">Go to Progress Dashboard</a>
                        </div>
                    </div>
                `;
            }
        });
    }
}

function generateReflectionSummary(store) {
    const reviews = store.reviews || [];

    if (reviews.length < 2) {
        return "Not enough data yet. Complete at least 2-3 weekly Friday Reviews for the AI to detect patterns in your momentum and bottlenecks.";
    }

    // Grab the last 4 reviews
    const recentReviews = reviews.slice(-4);

    // Analyze "workedWell" themes
    let winsText = recentReviews.map(r => (r.workedWell || '') + ' ' + (r.movedForward || '')).join(' ').toLowerCase();
    let effectiveThemes = [];

    if (winsText.includes('teaching') || winsText.includes('live') || winsText.includes('webinar') || winsText.includes('call') || winsText.includes('workshop')) effectiveThemes.push("live teaching and showing up visible");
    if (winsText.includes('follow') || winsText.includes('dm') || winsText.includes('outreach') || winsText.includes('pitch') || winsText.includes('message')) effectiveThemes.push("direct follow-ups and outreach");
    if (winsText.includes('email') || winsText.includes('newsletter') || winsText.includes('sequence') || winsText.includes('flow')) effectiveThemes.push("email marketing campaigns");
    if (winsText.includes('content') || winsText.includes('post') || winsText.includes('reel') || winsText.includes('video') || winsText.includes('tiktok')) effectiveThemes.push("consistent content creation");
    if (winsText.includes('system') || winsText.includes('automation') || winsText.includes('funnel') || winsText.includes('page')) effectiveThemes.push("backend systems and automation");

    if (effectiveThemes.length === 0) effectiveThemes.push("focused, uninterrupted action"); // default fallback

    // Analyze "difficult" themes
    let drainText = recentReviews.map(r => (r.difficult || '') + ' ' + (r.nextWeekImprove || '')).join(' ').toLowerCase();
    let drainThemes = [];

    if (drainText.includes('focus') || drainText.includes('scattered') || drainText.includes('distracted') || drainText.includes('shiny')) drainThemes.push("unclear weekly focus and distraction");
    if (drainText.includes('time') || drainText.includes('schedule') || drainText.includes('late') || drainText.includes('behind')) drainThemes.push("time management and boundary setting");
    if (drainText.includes('content') || drainText.includes('write') || drainText.includes('edit') || drainText.includes('post')) drainThemes.push("content creation bottlenecks");
    if (drainText.includes('overwhelm') || drainText.includes('burnout') || drainText.includes('tired') || drainText.includes('exhausted')) drainThemes.push("over-committing to too many tasks");
    if (drainText.includes('tech') || drainText.includes('tool') || drainText.includes('broken')) drainThemes.push("technology and tool friction");

    if (drainThemes.length === 0) drainThemes.push("maintaining execution consistency"); // default fallback

    // Choose top themes
    const topEffective = effectiveThemes.slice(0, 2).join(' and ');
    const topDrain = drainThemes[0];

    return `Based on your past ${recentReviews.length} weeks of CEO reviews:<br><br><strong>Your most effective weeks included ${topEffective}.<br>Your biggest recurring bottleneck appears to be <span style="color: var(--color-error);">${topDrain}</span>.</strong><br><br>Keep these patterns in mind when completing your monthly strategic review below.`;
}
