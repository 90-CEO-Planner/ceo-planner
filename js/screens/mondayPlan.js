// mondayPlan.js
import { getStore, addWeeklyPlan, getRevenueInsights } from '../store.js';

let mondayStep = 1;
const MONDAY_TOTAL_STEPS = 5;
let mondayPlanData = {
    weeklyFocus: '',
    priorities: ['', '', ''],
    revenueAction: '',
    daily3: ['', '', '']
};

export function renderMondayPlan() {
    window.setScreenModule({ attachEvents: mondayPlanAttachEvents });
    const store = getStore();
    const name = store.profile?.name || 'CEO';

    let html = `
        <div class="main-content" style="max-width: 650px; padding-top: 5vh; font-family: 'Inter', sans-serif;">
            
            <!-- Progress Indicator -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                <p style="color: var(--color-text-muted); font-size: 0.9rem; margin: 0; font-weight: 500;">Step ${mondayStep} of ${MONDAY_TOTAL_STEPS}</p>
                <div style="flex: 1; margin: 0 1rem; height: 6px; background: #f0f0f0; border-radius: 4px; overflow: hidden;">
                     <div style="height: 100%; width: ${(mondayStep / MONDAY_TOTAL_STEPS) * 100}%; background: #00C2CB; transition: width 0.3s ease;"></div>
                </div>
                <button id="btn-skip-monday" class="btn btn-ghost" style="padding: 0.25rem 0.75rem; font-size: 0.85rem; color: var(--color-text-muted);">Skip for now</button>
            </div>
    `;

    if (mondayStep === 1) {
        // Step 1 - Weekly Reset
        html += `
            <div class="card" style="border-top: 5px solid #00C2CB; border-radius: 16px; padding: 2.5rem 2rem;">
                <h2 style="font-size: 2rem; color: #111; margin-bottom: 0.5rem;">Good morning, ${name}.</h2>
                <h2 style="font-size: 2rem; color: #00C2CB; margin-bottom: 2rem;">Let's set your focus for the week.</h2>

                <div style="background: #f8fcfc; padding: 1.25rem; border-radius: 12px; margin-bottom: 2rem; border-left: 4px solid #F2C21D;">
                     <p style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 0.25rem; font-weight: 600;">Your 90-Day Goal</p>
                     <p style="font-size: 1.1rem; color: #111; font-weight: 500; margin: 0;">${store.goals?.focus || 'Not set'}</p>
                </div>

                <form id="monday-form-1">
                    <div class="form-group">
                        <label class="form-label" style="font-size: 1.2rem; margin-bottom: 0.75rem;">What would make this week a win for your business?</label>
                        <input type="text" id="w-focus" class="form-input" style="font-size: 1.1rem; padding: 1rem; border-radius: 8px; border: 2px solid #e2e8f0; transition: border-color 0.2s;" placeholder="e.g., Launching the new pre-sale page" value="${mondayPlanData.weeklyFocus}" required autocomplete="off" />
                    </div>
                    
                    <div style="display: flex; justify-content: flex-end; margin-top: 2rem;">
                        <button type="submit" class="btn" style="background: #111; color: white; padding: 0.75rem 2rem; font-size: 1.1rem; border-radius: 8px; transition: transform 0.1s;">Continue →</button>
                    </div>
                </form>
            </div>
        `;
    }

    else if (mondayStep === 2) {
        // Step 2 – CEO Priorities
        html += `
            <div class="card" style="border-top: 5px solid #F2C21D; border-radius: 16px; padding: 2.5rem 2rem;">
                <h2 style="font-size: 1.75rem; color: #111; margin-bottom: 1.5rem;">Which three actions will move your business forward this week?</h2>
                
                <p style="color: #666; font-size: 0.95rem; margin-bottom: 2rem; background: #fdfbf7; padding: 1rem; border-radius: 8px;">
                    <strong>Examples:</strong> publish educational content, follow up with leads, invite people to your offer, improve sales page, host a live teaching session.
                </p>

                <form id="monday-form-2">
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div style="position: relative;">
                            <span style="position: absolute; left: 1rem; top: 1rem; color: #F2C21D; font-weight: bold; font-size: 1.1rem;">1.</span>
                            <input type="text" id="w-p1" class="form-input" style="padding: 1rem 1rem 1rem 2.5rem; font-size: 1.05rem; border-radius: 8px;" placeholder="Priority One" value="${mondayPlanData.priorities[0]}" required autocomplete="off"/>
                        </div>
                        <div style="position: relative;">
                            <span style="position: absolute; left: 1rem; top: 1rem; color: #F2C21D; font-weight: bold; font-size: 1.1rem;">2.</span>
                            <input type="text" id="w-p2" class="form-input" style="padding: 1rem 1rem 1rem 2.5rem; font-size: 1.05rem; border-radius: 8px;" placeholder="Priority Two" value="${mondayPlanData.priorities[1]}" required autocomplete="off"/>
                        </div>
                        <div style="position: relative;">
                            <span style="position: absolute; left: 1rem; top: 1rem; color: #F2C21D; font-weight: bold; font-size: 1.1rem;">3.</span>
                            <input type="text" id="w-p3" class="form-input" style="padding: 1rem 1rem 1rem 2.5rem; font-size: 1.05rem; border-radius: 8px;" placeholder="Priority Three" value="${mondayPlanData.priorities[2]}" required autocomplete="off"/>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; margin-top: 2rem;">
                        <button type="button" id="btn-back" class="btn btn-ghost" style="color: #666;">← Back</button>
                        <button type="submit" class="btn" style="background: #111; color: white; padding: 0.75rem 2rem; font-size: 1.1rem; border-radius: 8px;">Continue →</button>
                    </div>
                </form>
            </div>
        `;
    }

    else if (mondayStep === 3) {
        // Step 3 – Revenue Awareness
        const rev = getRevenueInsights();
        html += `
            <div class="card" style="border-top: 5px solid #00C2CB; border-radius: 16px; padding: 2.5rem 2rem;">
                <h2 style="font-size: 1.75rem; color: #111; margin-bottom: 0.5rem;">Revenue Awareness</h2>
                <p style="color: #666; margin-bottom: 2rem;">Protecting your revenue time is your first job as a CEO.</p>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">
                    <div style="background: #f8fcfc; padding: 1.5rem; border-radius: 12px; text-align: center; border: 1px solid #e6f7f8;">
                        <p style="font-size: 0.85rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Quarter Goal</p>
                        <p style="font-size: 1.5rem; color: #00C2CB; font-weight: 700; margin: 0;">$${rev.goal.toLocaleString()}</p>
                    </div>
                    <div style="background: #f8fcfc; padding: 1.5rem; border-radius: 12px; text-align: center; border: 1px solid #e6f7f8;">
                        <p style="font-size: 0.85rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Weekly Target</p>
                        <p style="font-size: 1.5rem; color: #111; font-weight: 700; margin: 0;">$${Math.round(rev.weeklyTargetLength).toLocaleString()}</p>
                    </div>
                </div>

                <form id="monday-form-3">
                    <div class="form-group">
                        <label class="form-label" style="font-size: 1.1rem; margin-bottom: 1rem;">How will you create opportunities for revenue this week?</label>
                        <input list="revenue-options" id="w-rev" class="form-input" style="padding: 1rem; font-size: 1.05rem; border-radius: 8px;" placeholder="e.g., Send 3 personal sales invitations" value="${mondayPlanData.revenueAction}" required autocomplete="off" />
                        
                        <datalist id="revenue-options">
                            <option value="follow-up conversations">
                            <option value="sales invitations">
                            <option value="live sessions">
                            <option value="email promotion">
                            <option value="outreach">
                        </datalist>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; margin-top: 2rem;">
                        <button type="button" id="btn-back" class="btn btn-ghost" style="color: #666;">← Back</button>
                        <button type="submit" class="btn" style="background: #111; color: white; padding: 0.75rem 2rem; font-size: 1.1rem; border-radius: 8px;">Continue →</button>
                    </div>
                </form>
            </div>
        `;
    }

    else if (mondayStep === 4) {
        // Step 4 – Daily 3
        html += `
            <div class="card" style="border-top: 5px solid #F2A0AE; border-radius: 16px; padding: 2.5rem 2rem;">
                <h2 style="font-size: 1.75rem; color: #111; margin-bottom: 0.5rem;">What are the three most important actions for today?</h2>
                <p style="color: #666; margin-bottom: 2rem;">Review your Weekly Priorities and pick the specific bitesized tasks for today.</p>

                <!-- AI Planning Assistant Suggestions -->
                <div class="card mb-6" style="border-top: 4px solid var(--color-secondary); padding: 1.5rem; background: #fff;">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary-dark)" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M12 7v6"></path><path d="M12 17h.01"></path></svg>
                            <h4 style="margin: 0; color: var(--color-black);">AI Task Breakdown</h4>
                        </div>
                        <button type="button" id="btn-ai-daily" class="btn btn-outline" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; display: flex; align-items: center; gap: 0.5rem; border-color: var(--color-secondary-dark); color: var(--color-secondary-dark);">
                            ✨ Auto-Suggest based on Priorities
                        </button>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 0;">Break down your top 3 priorities into actionable daily steps.</p>
                </div>

                <form id="monday-form-4">
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 24px; height: 24px; border: 2px solid #F2A0AE; border-radius: 4px; flex-shrink: 0;"></div>
                            <input type="text" id="w-d1" class="form-input" style="padding: 1rem; font-size: 1.05rem; border-radius: 8px; flex: 1;" placeholder="Action 1" value="${mondayPlanData.daily3[0]}" required autocomplete="off"/>
                        </div>
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 24px; height: 24px; border: 2px solid #F2A0AE; border-radius: 4px; flex-shrink: 0;"></div>
                            <input type="text" id="w-d2" class="form-input" style="padding: 1rem; font-size: 1.05rem; border-radius: 8px; flex: 1;" placeholder="Action 2" value="${mondayPlanData.daily3[1]}" required autocomplete="off"/>
                        </div>
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 24px; height: 24px; border: 2px solid #F2A0AE; border-radius: 4px; flex-shrink: 0;"></div>
                            <input type="text" id="w-d3" class="form-input" style="padding: 1rem; font-size: 1.05rem; border-radius: 8px; flex: 1;" placeholder="Action 3" value="${mondayPlanData.daily3[2]}" required autocomplete="off"/>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; margin-top: 2rem;">
                        <button type="button" id="btn-back" class="btn btn-ghost" style="color: #666;">← Back</button>
                        <button type="submit" class="btn" style="background: #111; color: white; padding: 0.75rem 2rem; font-size: 1.1rem; border-radius: 8px;">Finalize Plan</button>
                    </div>
                </form>
            </div>
        `;
    }

    else if (mondayStep === 5) {
        // Step 5 – Confirmation
        html += `
            <div class="card" style="border-radius: 16px; padding: 2.5rem 2rem; text-align: center;">
                <div style="width: 64px; height: 64px; background: #00C2CB; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto;">
                     <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>

                <h2 style="font-size: 2rem; color: #111; margin-bottom: 0.5rem;">Your CEO plan for the week is ready.</h2>
                <p style="color: #666; margin-bottom: 2.5rem; font-size: 1.1rem;">You've set your intentions. Now, trust your strategy and execute.</p>

                <div style="background: #f8fcfc; border-radius: 12px; padding: 1.5rem; text-align: left; margin-bottom: 2.5rem; border: 1px solid #e2e8f0;">
                     <p style="font-size: 0.85rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Weekly Focus</p>
                     <p style="font-size: 1.1rem; color: #111; font-weight: 500; margin-bottom: 1.5rem;">${mondayPlanData.weeklyFocus}</p>

                     <p style="font-size: 0.85rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Top Priorities</p>
                     <ul style="padding-left: 1.25rem; margin-bottom: 1.5rem; color: #333;">
                         <li>${mondayPlanData.priorities[0]}</li>
                         <li>${mondayPlanData.priorities[1]}</li>
                         <li>${mondayPlanData.priorities[2]}</li>
                     </ul>

                     <p style="font-size: 0.85rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Revenue Action</p>
                     <p style="font-size: 1.05rem; color: #333; margin: 0;">${mondayPlanData.revenueAction}</p>
                </div>

                <button id="btn-finish" class="btn" style="background: #111; color: white; padding: 1rem 3rem; font-size: 1.15rem; border-radius: 8px; width: 100%;">Open My Dashboard</button>
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

function mondayPlanAttachEvents() {
    // Handle Skipping
    const skipBtn = document.getElementById('btn-skip-monday');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            // Set a session flag avoiding re-triggering today
            sessionStorage.setItem('skippedMondayPlan', new Date().toDateString());
            window.location.hash = '#/dashboard';
        });
    }

    // Handle Back Buttons
    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (mondayStep > 1) {
                mondayStep--;
                document.getElementById('app-container').innerHTML = renderMondayPlan();
                mondayPlanAttachEvents();
            }
        });
    }

    // Handle Form Submits
    if (mondayStep === 1) {
        document.getElementById('monday-form-1')?.addEventListener('submit', (e) => {
            e.preventDefault();
            mondayPlanData.weeklyFocus = document.getElementById('w-focus').value;
            mondayStep++;
            reRender();
        });
    }
    else if (mondayStep === 2) {
        document.getElementById('monday-form-2')?.addEventListener('submit', (e) => {
            e.preventDefault();
            mondayPlanData.priorities = [
                document.getElementById('w-p1').value,
                document.getElementById('w-p2').value,
                document.getElementById('w-p3').value
            ];
            mondayStep++;
            reRender();
        });
    }
    else if (mondayStep === 3) {
        document.getElementById('monday-form-3')?.addEventListener('submit', (e) => {
            e.preventDefault();
            mondayPlanData.revenueAction = document.getElementById('w-rev').value;
            mondayStep++;
            reRender();
        });
    }
    else if (mondayStep === 4) {
        document.getElementById('monday-form-4')?.addEventListener('submit', (e) => {
            e.preventDefault();
            mondayPlanData.daily3 = [
                document.getElementById('w-d1').value,
                document.getElementById('w-d2').value,
                document.getElementById('w-d3').value
            ];
            // In this design daily 3 implies completion for today.
            mondayStep++;
            reRender();
        });

        // AI Generation logic
        const aiBtn = document.getElementById('btn-ai-daily');
        if (aiBtn) {
            aiBtn.addEventListener('click', () => {
                const suggestions = generateDaily3Suggestions(mondayPlanData);
                document.getElementById('w-d1').value = suggestions[0];
                document.getElementById('w-d2').value = suggestions[1];
                document.getElementById('w-d3').value = suggestions[2];
                aiBtn.textContent = '✨ Tasks Applied!';
                aiBtn.style.backgroundColor = 'var(--color-primary-light)';
                aiBtn.style.color = 'var(--color-primary-dark)';
                aiBtn.style.borderColor = 'var(--color-primary-light)';
            });
        }
    }

    // Handle Finish
    const finishBtn = document.getElementById('btn-finish');
    if (finishBtn) {
        finishBtn.addEventListener('click', () => {
            // 1. Pack into the standard weeklyPlan object format the system expects
            const newPlan = {
                winCondition: mondayPlanData.weeklyFocus,
                priorities: mondayPlanData.priorities, // Local priorities for this specific week (optional if we map to global)
                revenueAction: mondayPlanData.revenueAction,
                visibilityAction: "Integrated into priorities", // Fallback for backwards compatibility with the planner UI insights
                followUps: mondayPlanData.revenueAction.toLowerCase().includes('follow') ? mondayPlanData.revenueAction : "Integrated into priorities",
                daily3: mondayPlanData.daily3
            };

            // 2. Save it
            addWeeklyPlan(newPlan);

            // 3. Reset internal state for next week
            mondayStep = 1;
            mondayPlanData = { weeklyFocus: '', priorities: ['', '', ''], revenueAction: '', daily3: ['', '', ''] };

            // 4. Mark today as completed
            sessionStorage.setItem('skippedMondayPlan', new Date().toDateString());

            // 5. Navigate to dashboard
            window.location.hash = '#/dashboard';
        });
    }
}

function reRender() {
    document.getElementById('app-container').innerHTML = renderMondayPlan();
    mondayPlanAttachEvents();
    window.scrollTo(0, 0);
}

// AI Helper Function - Smart Breakdown Engine
function generateDaily3Suggestions(data) {
    const tasks = [];

    // Analyze Priority 1
    const p1 = data.priorities[0] || '';
    tasks.push(breakdownTask(p1, 'Focus block on top priority'));

    // Analyze Priority 2
    const p2 = data.priorities[1] || '';
    tasks.push(breakdownTask(p2, 'Execute next step for second priority'));

    // Analyze Revenue Action
    const rev = data.revenueAction || '';
    if (rev.trim() !== '') {
        tasks.push(breakdownTask(rev, 'Complete revenue-generating action'));
    } else {
        const p3 = data.priorities[2] || '';
        tasks.push(breakdownTask(p3, 'Take action on third priority'));
    }

    return tasks;
}

function breakdownTask(taskText, fallback) {
    if (!taskText || taskText.trim() === '') return fallback;
    const lower = taskText.toLowerCase();

    // Context-Aware Keyword Matching for Daily Actions
    if (lower.match(/launch|beta/)) {
        const options = ['Draft the launch email sequence', 'Create a list of VIPs to invite to the beta', 'Outline the core offer for the launch', 'Set up the checkout or registration page'];
        return options[Math.floor(Math.random() * options.length)];
    }
    if (lower.match(/podcast|collab|pitch/)) {
        return 'Research 3-5 potential podcasts/creators and draft a custom pitch';
    }
    if (lower.match(/course|program|module/)) {
        return 'Outline the curriculum or record the first module for the course';
    }
    if (lower.match(/email|newsletter|sequence/)) {
        return 'Draft the outline and first draft of the email sequence';
    }
    if (lower.match(/post|reel|tiktok|content|video/)) {
        return 'Script or outline 3 pieces of content and batch record/write them';
    }
    if (lower.match(/lead|magnet|freebie|opt-in/)) {
        return 'Design the core asset for the lead magnet (PDF, video outline, checklist)';
    }
    if (lower.match(/sales|sell|close|revenue|income/)) {
        return 'Identify 5 warm leads from recent interactions and send a personalized DM/email';
    }
    if (lower.match(/webinar|masterclass|live/)) {
        return 'Draft the slide deck outline focusing on the core problem and solution';
    }
    if (lower.match(/website|landing page|sales page/)) {
        return 'Draft the copy for the top three sections of the page (Headline, Problem, Solution)';
    }
    if (lower.match(/hire|va|delegate/)) {
        return 'Document the step-by-step SOP for the task you want to delegate';
    }
    if (lower.match(/brand|niche|messaging/)) {
        return 'Write down 3 core beliefs your brand stands for to use in upcoming messaging';
    }

    // Generic fallbacks for unrecognized text
    const genericOptions = [
        `Outline the first three actionable steps for: ${taskText.substring(0, 30)}${taskText.length > 30 ? '...' : ''}`,
        `Block out 60 minutes of uninterrupted time to start: ${taskText.substring(0, 30)}${taskText.length > 30 ? '...' : ''}`,
        `Gather all resources, links, and documents needed to execute: ${taskText.substring(0, 30)}${taskText.length > 30 ? '...' : ''}`
    ];
    return genericOptions[Math.floor(Math.random() * genericOptions.length)];
}
