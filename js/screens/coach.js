// coach.js
import { renderNav } from '../components/nav.js';
import { getStore, addNote, deleteNote } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';
import { showToast, showConfirm } from '../components/toast.js';
import { proTeaser } from '../components/proGate.js';
import { canUseLiveAI, fetchIdeaVerdict, liveAINote } from '../liveAI.js';

export function renderCoach() {
    window.setScreenModule({ attachEvents: coachAttachEvents });
    const store = getStore();

    return `
        ${renderNav()}
        <div class="main-content dashboard-layout" style="padding-top: 2rem;">
            
            <div style="margin-bottom: 2rem; text-align: center;">
                <h2>Notepad</h2>
                <p style="color: var(--color-text-muted);">Capture your thoughts and filter your ideas.</p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2rem;">
                
                <!-- Voice Notes -->
                <div class="card" style="border-top: 4px solid var(--color-primary);">
                    <div class="flex items-center gap-2 mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                        <h3 style="margin: 0; display: flex; align-items: center;">
                            Voice Notes
                            ${renderTooltip("Jot down thoughts and ideas quickly using your voice.", "Get ideas out of your head and into your notepad.")}
                        </h3>
                    </div>
                    <form id="note-form" style="margin-bottom: 1.5rem;">
                        <div class="form-group mb-2 relative" style="position: relative;">
                            <textarea class="form-textarea" id="note-input" placeholder="Type or use voice to record a note..." required style="min-height: 100px; padding-right: 3rem;"></textarea>
                            <button type="button" id="btn-voice-record" class="btn btn-ghost" style="position: absolute; right: 0.5rem; bottom: 0.5rem; padding: 0.5rem; border-radius: 50%; color: var(--color-primary); background: var(--color-bg-light);" title="Start Voice Recording">
                                🎤
                            </button>
                        </div>
                        <div id="recording-indicator" style="display: none; color: #D92D20; font-size: 0.85rem; margin-bottom: 1rem; align-items: center; gap: 0.5rem;">
                            <span class="pulse-dot" style="width: 8px; height: 8px; background: #D92D20; border-radius: 50%; display: inline-block;"></span> Recording... (Speak now)
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">Save Note</button>
                    </form>
                    
                    <div id="saved-notes-list" style="display: flex; flex-direction: column; gap: 1rem;">
                        ${(store.notes || []).length === 0 ? '<p style="color: var(--color-text-muted); font-size: 0.9rem; text-align: center;">No notes saved yet.</p>' : 
                            (store.notes || []).slice().reverse().map(n => `
                            <div style="background: var(--color-bg-light); padding: 1rem; border-radius: var(--radius-sm); border-left: 3px solid var(--color-primary-light); position: relative;">
                                <p style="font-size: 0.95rem; color: var(--color-black); margin-bottom: 0.5rem; white-space: pre-wrap;">${n.text}</p>
                                <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                                    <span style="font-size: 0.75rem; color: var(--color-text-muted);">${new Date(n.date).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'})}</span>
                                    <button type="button" class="btn btn-ghost btn-sm btn-delete-note" data-id="${n.id}" style="padding: 0.25rem 0.5rem; color: var(--color-text-muted); font-size: 0.8rem; cursor: pointer; position: relative; z-index: 10;">Delete</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Decision Filter -->
                <div class="card" style="border-top: 4px solid var(--color-secondary);">
                    <div class="flex items-center gap-2 mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary-dark)" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                        <h3 style="margin: 0; display: flex; align-items: center;">
                            CEO vs Busy Work
                            ${renderTooltip("A simple filter to test if a new idea or task is worth doing.", "Before you drop everything to launch a new funnel, run it through this filter.")}
                        </h3>
                    </div>
                    <p style="color: var(--color-text-muted); font-size: 0.95rem; margin-bottom: 1.5rem;">Paste a new idea below to evaluate it against your 90-day goal.</p>
                    <form id="decision-filter-form">
                        <div class="form-group mb-4">
                            <textarea class="form-textarea" id="idea-input" placeholder="e.g., Start a TikTok channel..." required style="min-height: 80px;"></textarea>
                        </div>
                        <button type="submit" class="btn btn-secondary" style="width: 100%;">Evaluate Idea</button>
                    </form>
                    <div id="decision-result" class="mt-6" style="display: none; background: var(--color-secondary-light); padding: 1.5rem; border-radius: var(--radius-md); border-left: 4px solid var(--color-secondary);">
                        <div class="flex items-center gap-2 mb-2">
                            <span style="font-weight: 600; color: var(--color-secondary-dark); font-size: 0.95rem;">Verdict:</span>
                            <span id="alignment-score" style="font-weight: 700; font-size: 0.95rem; padding: 0.25rem 0.5rem; border-radius: 8px;"></span>
                        </div>
                        <p id="alignment-explanation" style="font-size: 1rem; color: var(--color-text-main); margin-top: 0.5rem; line-height: 1.5;"></p>
                    </div>
                    ${liveAINote('Judged against your 90-day goal, bottleneck and numbers.')}
                    ${proTeaser(
                        'live-ai',
                        'A verdict that has read your plan',
                        'This matches words today. Pro weighs the idea against your goal and bottleneck.'
                    )}
                </div>

            </div>
        </div>
    `;
}

// Logic for insights removed as it's being moved to progress.js


// Inline handleDeleteNote removed in favor of event delegation

function coachAttachEvents() {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-coach')?.classList.add('active');

    // Voice Notes Events
    const noteForm = document.getElementById('note-form');
    if (noteForm) {
        noteForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = document.getElementById('note-input').value.trim();
            if (text) {
                addNote({ text });
                document.getElementById('note-input').value = '';
                // Reload screen
                const appContainer = document.getElementById('app-container');
                if (appContainer) {
                    appContainer.innerHTML = renderCoach();
                    coachAttachEvents();
                }
            }
        });
    }

    // Delete note event delegation
    const savedNotesList = document.getElementById('saved-notes-list');
    if (savedNotesList) {
        // Clone and replace to remove any previously attached listeners (prevents duplicates)
        const newSavedNotesList = savedNotesList.cloneNode(true);
        savedNotesList.parentNode.replaceChild(newSavedNotesList, savedNotesList);
        
        newSavedNotesList.addEventListener('click', async (e) => {
            const deleteBtn = e.target.closest('.btn-delete-note');
            if (deleteBtn) {
                const id = deleteBtn.getAttribute('data-id');
                const ok = await showConfirm('This note will be removed from your coach notes.', {
                    title: 'Delete this note?', confirmText: 'Delete', danger: true
                });
                if (!ok) return;
                deleteNote(id);
                showToast('Note deleted');
                const appContainer = document.getElementById('app-container');
                if (appContainer) {
                    appContainer.innerHTML = renderCoach();
                    if (window.currentScreen && window.currentScreen.attachEvents) {
                        window.currentScreen.attachEvents();
                    }
                }
            }
        });
    }

    // Web Speech API for Voice Notes
    const btnVoice = document.getElementById('btn-voice-record');
    const noteInput = document.getElementById('note-input');
    const recordingIndicator = document.getElementById('recording-indicator');
    
    if (btnVoice && 'webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        let isRecording = false;

        recognition.onstart = function() {
            isRecording = true;
            btnVoice.style.background = '#FEE4E2';
            btnVoice.style.color = '#D92D20';
            recordingIndicator.style.display = 'flex';
        };

        recognition.onresult = function(event) {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                const currentVal = noteInput.value;
                noteInput.value = currentVal + (currentVal.length > 0 && !currentVal.endsWith(' ') ? ' ' : '') + finalTranscript;
            }
        };

        recognition.onerror = function(event) {
            console.error("Speech recognition error", event.error);
            stopRecording();
        };

        recognition.onend = function() {
            stopRecording();
        };

        function stopRecording() {
            isRecording = false;
            btnVoice.style.background = 'var(--color-bg-light)';
            btnVoice.style.color = 'var(--color-primary)';
            recordingIndicator.style.display = 'none';
        }

        btnVoice.addEventListener('click', () => {
            if (isRecording) {
                recognition.stop();
            } else {
                try {
                    recognition.start();
                } catch(e) {
                    console.error("Failed to start speech recognition", e);
                }
            }
        });
    } else if (btnVoice) {
        btnVoice.addEventListener('click', () => {
            showToast("Voice recording isn't supported in this browser. Chrome or Safari will work.", 'info');
        });
    }

    // Decision Filter Events
    const filterForm = document.getElementById('decision-filter-form');
    if (filterForm) {
        filterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rawIdea = document.getElementById('idea-input').value.trim();
            if (!rawIdea) return;

            // The keyword verdict, shown immediately. On the base plan this is
            // the whole feature. On Pro it is what stays on screen if the call
            // fails, so it is worked out first either way.
            const fallback = keywordVerdict(rawIdea);
            showVerdict(fallback.score, fallback.explanation, fallback.color, fallback.bg);

            if (!canUseLiveAI()) return;

            // This is the one live surface the user actually asked for, so it is
            // allowed to say it is working — and, unlike the automatic ones, it
            // does not draw on the daily background budget.
            const submitBtn = filterForm.querySelector('button[type="submit"]');
            const originalLabel = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Thinking…';
            }

            const live = await fetchIdeaVerdict(rawIdea);

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalLabel;
            }

            // A null answer means the keyword verdict already on screen stands.
            // Saying "the AI failed" would replace a usable answer with an
            // apology, which helps nobody decide anything.
            if (!live) return;

            const palette = VERDICT_COLOURS[live.verdict] || VERDICT_COLOURS['Busy work'];
            showVerdict(live.verdict, live.explanation, palette.color, palette.bg);
        });
    }
}

const VERDICT_COLOURS = {
    'Strategic': { color: '#027A48', bg: '#E1FDF4' },
    'Worth testing': { color: '#B54708', bg: '#FFFAEB' },
    'Busy work': { color: '#B42318', bg: '#FEE4E2' }
};

function showVerdict(score, explanation, color, bg) {
    const scoreEl = document.getElementById('alignment-score');
    if (!scoreEl) return;
    scoreEl.textContent = score;
    scoreEl.style.color = color;
    scoreEl.style.backgroundColor = bg;
    document.getElementById('alignment-explanation').textContent = explanation;
    document.getElementById('decision-result').style.display = 'block';
}

// The base-tier filter, unchanged. It matches words rather than reading the
// plan, which is why any idea containing "sales" comes back Strategic — that is
// the limitation Pro exists to remove, and the teaser on this card says so
// rather than the app pretending otherwise.
function keywordVerdict(rawIdea) {
    const idea = rawIdea.toLowerCase();
    const store = getStore();

    const focus = (store.goals?.focus || '').toLowerCase();
    const priorities = (store.goals?.priorities || []).join(' ').toLowerCase();
    const strategyMode = (store.profile?.stage || '').toLowerCase(); // Approximating Strategy Mode from stage

    let score = "Busy Work";
    let color = "#B42318";
    let bg = "#FEE4E2";
    let explanation = "This idea represents a tangent, distraction, or simply doesn't share DNA with your current Top 3 priorities. Put it in an idea parking lot for the next quarter.";

    const ideaWords = idea.split(' ').filter(w => w.length > 3);
    let matchCount = 0;

    ideaWords.forEach(word => {
        if (focus.includes(word) || priorities.includes(word) || strategyMode.includes(word)) {
            matchCount++;
        }
    });

    // "If the idea directly aligns with your stated 90-day focus or heavily supports your active Strategy Mode"
    if (matchCount >= 2 || (idea.includes('sales') || idea.includes('revenue') || idea.includes('offer'))) {
        score = "Strategic";
        color = "#027A48"; bg = "#E1FDF4";
        explanation = "This idea directly aligns with your stated 90-day focus and supports your active Strategy Mode. Add it to your weekly plan.";
    }

    return { score, explanation, color, bg };
}
