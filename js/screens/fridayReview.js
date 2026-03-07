// fridayReview.js
import { renderNav } from '../components/nav.js';
import { addReview } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';

export function renderReview() {
    window.setScreenModule({ attachEvents: reviewAttachEvents });
    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 700px;">
            <div style="margin-bottom: 2rem;">
                <h2>Friday CEO Review</h2>
                <p style="color: var(--color-text-muted);">Reflect on the week, capture the wins, and plan for better next week.</p>
            </div>

            <form id="review-form" class="card">
                <div class="form-group mb-6 text-center" style="background: var(--color-bg-main); padding: 1.5rem; border-radius: var(--radius-md); border: 1px dashed var(--color-border);">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; color: var(--color-text-main); margin-bottom: 1rem;">
                        Easier to talk it out? Use Voice Reflection to fill out your review.
                        ${renderTooltip("A hands-free way to log your week.", "Sometimes writing feels like a chore at the end of a long week. Talking out loud helps you process your thoughts faster and ensures you actually complete the review.")}
                    </p>
                    <button type="button" id="btn-voice-reflection" class="btn btn-secondary" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; max-width: 300px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                        <span id="voice-btn-text">Start Voice Reflection</span>
                    </button>
                    <p id="voice-status" style="font-size: 0.85rem; color: var(--color-primary-dark); margin-top: 0.75rem; display: none; font-weight: 500;">Listening...</p>
                </div>

                <div class="form-group">
                    <label class="form-label" style="display: flex; align-items: center; font-size: 1.1rem;">
                        What moved the business forward this week?
                        ${renderTooltip("The actual needle-moving progress you made.", "It's easy to feel like you didn't do enough. Answering this proves to your brain that you are making progress on the things that matter.")}
                    </label>
                    <textarea class="form-textarea" id="rev-forward" placeholder="e.g., Finished the beta launch copy, pitched 5 podcasts." required></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="display: flex; align-items: center; font-size: 1.1rem; color: #027A48;">
                        What worked well?
                        ${renderTooltip("Activities that felt easy, natural, or generated good results.", "Success leaves clues. By identifying what worked, you know exactly what to repeat next week.")}
                    </label>
                    <p class="form-helper mb-2">Celebrate your wins, big or small. What gave you energy or results?</p>
                    <textarea class="form-textarea" id="rev-well" style="min-height: 80px;" required></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="display: flex; align-items: center; font-size: 1.1rem; color: #B42318;">
                        What felt difficult or heavy?
                        ${renderTooltip("Tasks or projects that caused resistance.", "You can't fix a bottleneck if you don't acknowledge it. If something is consistently heavy, you need to automate it, delegate it, or delete it.")}
                    </label>
                    <p class="form-helper mb-2">Notice resistance without judgment. What drained you or got stuck?</p>
                    <textarea class="form-textarea" id="rev-difficult" style="min-height: 80px;" required></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem;">Metrics (Optional)</label>
                    <p class="form-helper mb-2">Track the numbers that matter for your 90-day goal.</p>
                    <div class="flex gap-4">
                        <div style="flex: 1;">
                            <label class="form-label" style="font-size: 0.85rem;">Leads/Subscribers</label>
                            <input type="text" class="form-input" id="rev-leads" placeholder="e.g., +15" />
                        </div>
                        <div style="flex: 1;">
                            <label class="form-label" style="font-size: 0.85rem;">Sales/Revenue</label>
                            <input type="text" class="form-input" id="rev-sales" placeholder="e.g., $500" />
                        </div>
                    </div>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="display: flex; align-items: center; font-size: 1.1rem; color: var(--color-primary-dark);">
                        What will you improve next week?
                        ${renderTooltip("A singular focus for making the upcoming week better.", "Trying to fix everything at once leads to failure. Changing just one habit or approach per week leads to massive compounding growth.")}
                    </label>
                    <p class="form-helper mb-2">Pick ONE thing to adjust so next week is easier.</p>
                    <textarea class="form-textarea" id="rev-improve" style="min-height: 80px;" required></textarea>
                </div>

                <div class="flex justify-end mt-8">
                    <button type="submit" class="btn btn-primary">Save Review & Close Week</button>
                </div>
            </form>
        </div>
    `;
}

function reviewAttachEvents() {
    // Nav
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-review')?.classList.add('active');

    // Voice Reflection Logic
    const voiceBtn = document.getElementById('btn-voice-reflection');
    const voiceBtnText = document.getElementById('voice-btn-text');
    const voiceStatus = document.getElementById('voice-status');
    let recognition = null;
    let isRecording = false;
    let activeTextArea = document.getElementById('rev-forward'); // Default target

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

    const form = document.getElementById('review-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (isRecording) stopRecording();

            const review = {
                movedForward: document.getElementById('rev-forward').value,
                workedWell: document.getElementById('rev-well').value,
                difficult: document.getElementById('rev-difficult').value,
                leads: document.getElementById('rev-leads').value,
                sales: document.getElementById('rev-sales').value,
                nextWeekImprove: document.getElementById('rev-improve').value,
            };

            addReview(review);

            // Show success and redirect
            alert("Review saved! Great job this week. Take some well-deserved rest off.");
            window.location.hash = '#/progress';
        });
    }
}
