import { getStore, getRevenueInsights, addRevenueEntry, updateDailyLog } from '../store.js';
import { renderNav } from '../components/nav.js';
import { renderTooltip } from '../components/tooltip.js';

export function renderDashboard() {
    window.setScreenModule({ attachEvents: dashboardAttachEvents });
    const store = getStore();
    const g = store.goals;
    const streak = store.streak;
    const revInsights = getRevenueInsights();
    const currency = store.settings?.currency || '$';

    // Check if there is an active weekly plan
    let activePlan = store.weeklyPlans.length > 0 ? store.weeklyPlans[store.weeklyPlans.length - 1] : null;

    if (activePlan) {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(activePlan.date)) / (1000 * 60 * 60 * 24));
        if (diffDays > 6) {
            activePlan = null;
        }
    }

    // --- Monday CEO Flow Intercept ---
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const planningDay = store.profile?.planningDay || 'Monday';
    const skippedToday = sessionStorage.getItem('skippedMondayPlan') === new Date().toDateString();

    if (todayName === planningDay && !activePlan && !skippedToday && window.location.hash !== '#/monday-plan') {
        // Prevent recursive loops if dashboard render is somehow called, but immediately push to wizard.
        window.location.hash = '#/monday-plan';
        return ''; // Don't render dashboard while redirecting
    }
    // ---------------------------------

    let html = `
        ${renderNav()}
        <div class="main-content dashboard-layout">
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h2>Welcome back, ${store.profile?.name || 'CEO'}</h2>
                    <p style="color: var(--color-text-muted);">Stay focused on your 90-day outcome.</p>
                </div>
                <div style="display: flex; gap: 0.75rem; align-items: center;">
                    <button class="btn btn-primary btn-sm btn-open-quick-sale" style="display: flex; align-items: center; gap: 0.25rem;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Log a Sale
                    </button>
                    <div style="background: var(--color-secondary-light); padding: 0.5rem 1rem; border-radius: var(--radius-full); display: flex; align-items: center; gap: 0.5rem; font-weight: 600; color: var(--color-secondary-dark);">
                        Plan: ${store.planningStreak || 0}w | Review: ${streak}w
                    </div>
                </div>
            </div>

            <!-- Dynamic Coaching Engine -->
            ${(() => {
            const coach = getCoachingEngineData(store, activePlan, revInsights);
            return `
                <div class="card mb-6" style="border-top: 5px solid ${coach.color}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
                    <div class="flex items-start gap-4">
                        <div style="background: ${coach.color}15; color: ${coach.color}; padding: 0.75rem; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            ${coach.icon}
                        </div>
                        <div style="flex-grow: 1;">
                            <h3 style="margin: 0 0 0.25rem 0; font-size: 1.15rem; color: var(--color-black);">${coach.title}</h3>
                            <p style="margin: 0 0 1rem 0; font-size: 0.95rem; color: var(--color-text-muted); line-height: 1.5;">${coach.message}</p>
                            
                            <div style="background: var(--color-bg-light); border-radius: var(--radius-sm); padding: 0.75rem 1rem; border: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; flex-direction: column;">
                                    <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); margin-bottom: 0.2rem; display: flex; align-items: center;">
                                        Next Best Action
                                        ${renderTooltip("The single most important step you can take right now based on your current progress.", "Doing the right thing is more important than doing everything. This prevents overwhelm by focusing you on what moves the needle today.")}
                                    </span>
                                    <span style="font-size: 0.9rem; font-weight: 500; color: var(--color-primary-dark);">${coach.actionLabel}</span>
                                </div>
                                ${coach.actionOpenModal ?
                    `<button class="btn btn-sm btn-open-quick-sale" style="background: white; border: 1px solid var(--color-border); color: var(--color-black); white-space: nowrap;">Go →</button>` :
                    `<a href="${coach.actionHash}" class="btn btn-sm" style="background: white; border: 1px solid var(--color-border); color: var(--color-black); white-space: nowrap;">Go →</a>`
                }
                            </div>
                        </div>
                    </div>
                </div>
                `;
        })()}

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-lg); margin-bottom: var(--spacing-lg);">
                
                <!-- 90 Day Focus Card -->
                <div class="card" style="border-top: 4px solid var(--color-primary);">
                    <p style="display: flex; align-items: center; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); font-weight: 600; margin-bottom: var(--spacing-sm);">
                        90-Day Focus
                        ${renderTooltip("The main overarching goal you are working towards this quarter.", "A clear 90-day focus acts as a filter. If an opportunity or task doesn't support this focus, it's a distraction.")}
                    </p>
                    <h3 style="margin-bottom: var(--spacing-md);">${g.focus || 'Not set'}</h3>
                    
                    <div style="background: var(--color-bg-main); padding: 1rem; border-radius: var(--radius-md);">
                        <p style="font-size: 0.875rem; color: var(--color-primary-dark); font-weight: 600; margin-bottom: 0.25rem;">Measurable Outcome:</p>
                        <p style="font-size: 0.875rem;">${g.outcome || 'Not set'}</p>
                    </div>

                    <div class="mt-4">
                        <p style="display: flex; align-items: center; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem;">
                            Top 3 Priorities
                            ${renderTooltip("The three core projects or objectives that will make your 90-day focus a reality.", "Keeping your priorities limited to three ensures you actually finish what you start instead of having ten half-finished projects.")}
                        </p>
                        <ul style="list-style-position: inside; font-size: 0.875rem; color: var(--color-text-muted);">
                            ${g.priorities.map(p => `<li>${p || 'Not set'}</li>`).join('')}
                        </ul>
                    </div>
                </div>

                <!-- This Week Card -->
                <div class="card" style="border-top: 4px solid var(--color-secondary);">
                    <div class="flex justify-between items-center mb-4">
                        <p style="display: flex; align-items: center; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); font-weight: 600;">
                            This Week's Plan
                            ${renderTooltip("Your weekly strategy broken down into actionable steps.", "Planning your week in advance is the difference between leading your business and reacting to it.")}
                        </p>
    `;

    if (activePlan) {
        html += `
                        <span style="background: #E1FDF4; color: #027A48; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 600;">Active</span>
                    </div>
                    <h4 style="margin-bottom: var(--spacing-sm);">${activePlan.visibilityAction || 'Visibility Action'}</h4>
                    <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: var(--spacing-md);">Revenue action: ${activePlan.revenueAction}</p>
                    <div id="ceo-focus-score" style="margin-bottom: var(--spacing-md); font-size: 0.875rem; padding: 0.5rem; background: var(--color-bg-main); border-radius: var(--radius-sm); font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                        <span style="display: flex; align-items: center;">
                            CEO Focus Score:
                            ${renderTooltip("A score from 0-100% measuring the strength of your weekly plan.", "A strong plan always includes three things: a way to get visible, a way to generate revenue, and a way to follow up. This score keeps you accountable to all three.")}
                        </span> 
                        <span id="score-val">Calculating...</span>
                    </div>
                    <a href="#/planner" class="btn btn-outline" style="width: 100%;">View Full Plan</a>
                </div>
            </div>
        `;
    } else {
        html += `
                        <span style="background: #FEE4E2; color: #B42318; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 600;">Needs Planning</span>
                    </div>
                    <div style="text-align: center; padding: 2rem 0;">
                        <p style="display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); margin-bottom: 1rem;">
                            You haven't planned your week yet.
                            ${renderTooltip("Weekly Planning", "CEOs don't wing it. By dedicating 15 minutes to plan on Monday, you save hours of busywork later in the week.")}
                        </p>
                        <a href="#/planner" class="btn btn-primary" style="width: 100%;">Create Weekly Plan</a>
                    </div>
                </div>
            </div>
        `;
    }

    if (revInsights.goal > 0) {
        html += `
            <!-- Revenue Snapshot (NEW) -->
            <div class="card mb-6" style="border-left: 4px solid var(--color-primary-dark); cursor: pointer;" onclick="window.location.hash='#/revenue'">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 style="display: flex; align-items: center; margin: 0 0 0.25rem 0; font-size: 0.95rem; color: var(--color-text-main); font-weight: 500;">
                            This Week's Revenue
                            ${renderTooltip("The total amount of sales logged in the current calendar week.", "Tracking your weekly cash flow keeps your finger on the pulse of the business and prevents end-of-quarter surprises.")}
                        </h3>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--color-accent-dark); line-height: 1;">
                            ${currency}${revInsights.revenueThisWeek.toLocaleString()}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Weekly Target</span>
                        <div style="font-size: 1rem; color: var(--color-text-main); font-weight: 600;">${currency}${revInsights.weeklyTargetLength.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    </div>
                </div>
                
                <hr style="border: none; border-top: 1px solid var(--color-border); margin: 1rem 0;" />
                
                <div class="flex justify-between items-center mb-2">
                    <span style="font-weight: 500; font-size: 0.875rem; color: var(--color-text-muted);">Quarterly Goal Progress</span>
                    <span style="font-weight: 600; font-size: 0.875rem; color: var(--color-primary-dark);">${revInsights.progressPercent.toFixed(1)}%</span>
                </div>
                <div class="progress-container" style="height: 8px; background: var(--color-bg-light); border-radius: var(--radius-full); overflow: hidden; margin-bottom: 0.5rem;">
                    <div class="progress-bar" style="height: 100%; width: ${revInsights.progressPercent}%; background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-dark) 100%); transition: width 0.5s ease-out;"></div>
                </div>
                <div class="flex justify-between" style="font-size: 0.8rem; color: var(--color-text-muted);">
                    <span>${currency}${revInsights.totalRevenue.toLocaleString()} / ${currency}${revInsights.goal.toLocaleString()}</span>
                    <span>${revInsights.salesRemaining} sales left</span>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="card mb-6" style="border-left: 4px solid var(--color-primary-dark); text-align: center; cursor: pointer;" onclick="window.location.hash='#/revenue'">
                <h3 style="margin-bottom: 0.5rem; font-size: 1.125rem;">Track Your Revenue</h3>
                <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 0;">Set your quarterly goal to unlock insights.</p>
            </div>
        `;
    }

    let dailyTasksHtml = "";

    // Helper to generate daily actionable steps from priorities and weekly plans
    const generateDaily3 = (priorities, plan) => {
        const tasks = [];

        // Analyze Priority 1
        const p1 = priorities[0] || '';
        tasks.push(breakdownTask(p1, 'Focus block on top priority'));

        // Analyze Priority 2
        const p2 = priorities[1] || '';
        tasks.push(breakdownTask(p2, 'Execute next step for second priority'));

        // Analyze Revenue Action based on Weekly Plan vs Priorities
        const rev = plan && plan.revenueAction ? plan.revenueAction : '';
        if (rev.trim() !== '') {
            tasks.push(breakdownTask(rev, 'Complete revenue-generating action'));
        } else {
            const p3 = priorities[2] || '';
            tasks.push(breakdownTask(p3, 'Take action on third priority'));
        }

        return tasks;
    };

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

    // Use the explicit Daily 3 from the actual day if available, otherwise fallback to AI generated tasks based on priorities & weekly plan.
    const todayStrDash = new Date().toISOString().split('T')[0];
    let todaysLog = store.dailyLogs[todayStrDash];

    if (!todaysLog) {
        const currentPriorities = activePlan && activePlan.topActions ? activePlan.topActions : g.priorities;
        let generatedTasks = generateDaily3([0, 1, 2].map(i => currentPriorities[i] || ''), activePlan);
        todaysLog = generatedTasks.map(t => ({ text: t, done: false }));
        window._tempGeneratedTodaysLog = todaysLog; // to be saved on attachEvents
    }

    todaysLog.forEach((taskObj, i) => {
        dailyTasksHtml += `
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background-color var(--transition-fast);" class="dailyhover">
                <input type="checkbox" id="daily-task-${i}" ${taskObj.done ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--color-primary);">
                <span style="font-size: 0.95rem; font-weight: 500; ${taskObj.done ? 'text-decoration: line-through; color: var(--color-text-muted);' : ''}">${taskObj.text}</span>
            </label>
        `;
    });

    html += `
            <!-- Daily 3 Action Items -->
            <div class="card mb-6" style="border-left: 4px solid var(--color-accent);">
                 <div class="flex items-center gap-2 mb-4">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-dark)" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                     <h3 style="margin: 0;">The Daily 3</h3>
                 </div>
                 <p style="font-size: 0.9rem; color: var(--color-text-muted); margin-bottom: 1rem;">Move the needle today based on your top priorities.</p>
                 <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                     ${dailyTasksHtml}
                 </div>
            </div>

            <!--CEO Commitment-->
            <div class="card" style="background-color: var(--color-primary-light); border-color: var(--color-primary-light); text-align: center;">
                <p style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary-dark); font-weight: 600; margin-bottom: var(--spacing-sm);">${store.profile?.name ? store.profile.name + "'s" : "Your"} Commitment</p>
                <p style="font-size: 1.125rem; font-family: var(--font-heading); font-style: italic; color: var(--color-black);">"${g.statement || "I commit to leading with confidence."}"</p>
            </div>

            <!--Quick Actions-->
            <div class="mt-8 flex justify-center gap-4">
                <a href="#/review" class="btn btn-secondary">Do Friday Review</a>
            </div>
            
            <div class="mt-8 flex justify-center gap-4">
               <button id="demo-seed-btn" class="btn btn-ghost" style="font-size: 12px; color: var(--color-border);">[Dev] Load Mock Data</button>
            </div>
        </div >

        <!--Quick Sale Modal-->
        <div id="quick-sale-modal" class="modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 100; align-items: center; justify-content: center;">
            <div class="card" style="width: 100%; max-width: 400px; padding: 2rem; position: relative;">
                <button id="btn-close-quick-sale" style="position: absolute; top: 1rem; right: 1rem; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--color-text-muted);">&times;</button>
                    <h3 style="margin-bottom: 1.5rem;">Log a Sale</h3>
                    <form id="quick-sale-form">
                        <div class="form-group">
                            <label>Amount ($)</label>
                            <input type="number" id="qs-amount" min="0" step="any" class="form-control" required placeholder="0.00">
                        </div>
                        <div class="form-group">
                            <label>Source</label>
                            <select id="qs-source" class="form-control" required>
                                <option value="Instagram">Instagram</option>
                                <option value="Facebook">Facebook</option>
                                <option value="X">X</option>
                                <option value="Email">Email</option>
                                <option value="Live Session">Live Session</option>
                                <option value="DM Conversation">DM Conversation</option>
                                <option value="Referral">Referral</option>
                                <option value="Website">Website</option>
                                <option value="TikTok">TikTok</option>
                                <option value="YouTube">YouTube</option>
                                <option value="Skool Community">Skool Community</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Offer Name (Optional)</label>
                            <input type="text" id="qs-offer" class="form-control" placeholder="e.g. Digital Product Toolkit">
                        </div>
                        <div class="form-group">
                            <label>Date</label>
                            <input type="date" id="qs-date" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">Save</button>
                    </form>
                </div>
            </div>
        `;

    return html;
}

function getCoachingEngineData(store, activePlan, revInsights) {
    const day = new Date().getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday
    const userName = store.profile?.name || 'CEO';
    const streak = store.streak || 0;

    // Check Daily Tasks completion
    const todayStr = new Date().toISOString().split('T')[0];
    let allDailyChecked = true;
    const todaysLog = store.dailyLogs[todayStr];
    if (!todaysLog || todaysLog.length < 3) {
        allDailyChecked = false;
    } else {
        todaysLog.forEach(t => { if (!t.done) allDailyChecked = false; });
    }

    // --- State Priority Evaluation ---

    // 0. Quarter Reset Needed (90 days elapsed)
    if (store.weeklyPlans && store.weeklyPlans.length > 0) {
        const firstPlanDate = new Date(store.weeklyPlans[0].date);
        const daysElapsed = Math.floor((Date.now() - firstPlanDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysElapsed >= 90) {
            return {
                title: "Quarter Complete",
                message: `You've been executing this plan for ${daysElapsed} days! It's time to run your Quarter Reset, safely archive this data, and set your next 90-day focus.`,
                actionLabel: "Run Quarter Reset",
                actionHash: "#/quarter-reset",
                color: "#111111", // Black
                icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`
            };
        }
    }

    // 0.5 Monthly Review Needed
    // Rule: Prompt during the last 3 days of the month, or the 1st day of the new month
    const currentDate = new Date();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const currentDay = currentDate.getDate();
    
    let needsMonthlyReview = false;
    if (currentDay >= daysInMonth - 2 || currentDay === 1) {
        const monthlyReviews = store.monthlyReviews || [];
        const lastMonthly = monthlyReviews.length > 0 
            ? new Date(monthlyReviews[monthlyReviews.length - 1].date || 0)
            : null;
        
        // If never done or the last one was over 15 days ago (to prevent prompting again)
        if (!lastMonthly || (currentDate.getTime() - lastMonthly.getTime()) > (15 * 24 * 60 * 60 * 1000)) {
            needsMonthlyReview = true;
        }
    }

    if (needsMonthlyReview) {
        return {
            title: "Monthly Strategy Audit",
            message: `It's the end of the month, ${userName}. Before you sprint into next week, take 10 minutes to run your Monthly CEO Review to identify your bottlenecks and set your strategy.`,
            actionLabel: "Do Monthly Review",
            actionHash: "#/monthly-review",
            color: "#6941C6", // Purple
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`
        };
    }

    // 1. Missing weekly plan (Highest Priority early week)
    if (!activePlan && day >= 1 && day <= 3) {
        return {
            title: "Focus Alert",
            message: `${userName}, you haven't set your weekly plan yet. Ground yourself in your top 3 priorities before the week runs away from you.`,
            actionLabel: "Start weekly planning",
            actionHash: "#/planner",
            color: "#F2A0AE", // Alert Pink
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
        };
    }

    // 2. Missing Friday Review
    if (day === 5 || (day === 6 && activePlan)) {
        return {
            title: "Weekly Wrap-up",
            message: `It's time to review your week, ${userName}. What moved the business forward? Log your lessons and close out the week strong.`,
            actionLabel: "Do Friday Review",
            actionHash: "#/review",
            color: "#F2C21D", // Yellow
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`
        };
    }

    // 3. Revenue Celebration
    if (revInsights.totalRevenue >= revInsights.goal && revInsights.goal > 0) {
        return {
            title: "Celebration",
            message: `Incredible work, ${userName}! You've hit your quarterly revenue goal of $${revInsights.goal.toLocaleString()}. Take a moment to celebrate.`,
            actionLabel: "Review Your Wins",
            actionHash: "#/progress",
            color: "#00C2CB", // Primary WEN
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>`
        };
    }

    // 4. No Revenue Action
    if (activePlan && (!activePlan.revenueAction || activePlan.revenueAction.trim().length < 5)) {
        return {
            title: "Business Bottleneck",
            message: `${userName}, there are no revenue-generating actions in your plan this week. We can't hit your $${revInsights.goal.toLocaleString()} goal without invitations.`,
            actionLabel: "Add Revenue Action",
            actionHash: "#/planner",
            color: "#B42318", // Red
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
        };
    }

    // 5. Daily Task Celebration
    if (activePlan && allDailyChecked) {
        return {
            title: "Celebration",
            message: `Great job, ${userName}! You've completed your Daily 3. Step away from the desk and recharge, or log a sale if you closed one today!`,
            actionLabel: "Log a sale",
            actionOpenModal: true,
            color: "#00C2CB",
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
        };
    }

    // 6. Follow Up Reminder
    if (day === 4 && activePlan && activePlan.followUps && activePlan.followUps.length > 5 && !allDailyChecked) {
        return {
            title: "Focus Alert",
            message: `It's Thursday afternoon. Have you completed your scheduled follow-up conversations this week, ${userName}?`,
            actionLabel: "Start follow-up conversations",
            actionHash: "#/planner",
            color: "#F2C21D",
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`
        };
    }

    // 7. Streak Celebration
    if (streak > 0 && streak % 4 === 0 && day === 1 && activePlan) {
        return {
            title: "Momentum Celebration",
            message: `You've planned and reviewed for ${streak} weeks in a row! That consistency is exactly how you build a thriving business.`,
            actionLabel: "View your progress",
            actionHash: "#/progress",
            color: "#00C2CB",
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
        };
    }

    // 8. General momentum (Fallback)
    return {
        title: "CEO Momentum",
        message: `You are on track, ${userName}. Focus on executing your Daily 3 and trust the strategy you set for this week.`,
        actionLabel: "Complete priority action",
        actionHash: "#/planner", // or anchor to Daily 3
        color: "#111111", // Black
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`
    };
}

function dashboardAttachEvents() {
    // Nav active state
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-dashboard')?.classList.add('active');

    // CEO Focus Score calculation
    const store = getStore();
    const activePlan = store.weeklyPlans.length > 0 ? store.weeklyPlans[store.weeklyPlans.length - 1] : null;
    const scoreValEl = document.getElementById('score-val');

    if (activePlan && scoreValEl) {
        let score = 0;
        let reasons = [];
        if (activePlan.visibilityAction?.length > 5) { score += 33; reasons.push('Visibility Set'); }
        if (activePlan.revenueAction?.length > 5) { score += 34; reasons.push('Revenue Action Set'); }
        if (activePlan.followUps?.length > 2 && !activePlan.followUps.toLowerCase().includes('none')) { score += 33; reasons.push('Follow-ups Set'); }

        let color = '#B42318'; // Red
        if (score > 65) color = '#F2C21D'; // Yellow/Secondary
        if (score > 90) color = '#027A48'; // Green

        scoreValEl.textContent = `${score}%`;
        scoreValEl.style.color = color;
        scoreValEl.title = reasons.join(', ');
    } else if (scoreValEl) {
        scoreValEl.textContent = 'No Plan';
    }

    // Daily 3 state persistence using the store logic
    const todayStr = new Date().toISOString().split('T')[0];
    if (window._tempGeneratedTodaysLog) {
        updateDailyLog(todayStr, window._tempGeneratedTodaysLog);
        delete window._tempGeneratedTodaysLog;
    }

    [0, 1, 2].forEach(i => {
        const checkbox = document.getElementById(`daily-task-${i}`);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                const updatedStore = getStore();
                let log = updatedStore.dailyLogs[todayStr] || [];
                if (log[i]) {
                    log[i].done = e.target.checked;
                    updateDailyLog(todayStr, log);
                    // Rerender dashboard to apply strikethrough styling and coach engine updates safely
                    window.dispatchEvent(new Event('hashchange'));
                }
            });
        }
    });

    // Seed button
    const seedBtn = document.getElementById('demo-seed-btn');
    if (seedBtn) {
        seedBtn.addEventListener('click', () => {
            seedMockData();
            window.location.reload();
        });
    }

    // Quick Sale Modal Logic
    const modal = document.getElementById('quick-sale-modal');
    const openBtns = document.querySelectorAll('.btn-open-quick-sale');
    const btnClose = document.getElementById('btn-close-quick-sale');
    const form = document.getElementById('quick-sale-form');

    if (modal && btnClose) {
        openBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                modal.style.display = 'flex';
                const input = document.getElementById('qs-amount');
                if (input) input.focus();
            });
        });

        const closeModal = () => { modal.style.display = 'none'; };

        btnClose.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const amount = parseFloat(document.getElementById('qs-amount').value);
                const source = document.getElementById('qs-source').value;
                const offer = document.getElementById('qs-offer').value;
                const dateStr = document.getElementById('qs-date').value;

                addRevenueEntry({
                    amount,
                    source,
                    offer,
                    date: new Date(dateStr).toISOString(),
                    notes: ''
                });
                closeModal();
                window.location.reload();
            });
        }
    }
}
