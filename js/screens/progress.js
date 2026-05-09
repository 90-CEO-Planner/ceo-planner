// progress.js
import { renderNav } from '../components/nav.js';
import { getStore } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';

export function renderProgress() {
    window.setScreenModule({ attachEvents: progressAttachEvents });
    const store = getStore();
    const reviews = store.reviews;
    const monthlyReviews = store.monthlyReviews || [];
    const plansCount = store.weeklyPlans.length;
    const insight = generateInsights(store);

    return `
        ${renderNav()}
        <div class="main-content dashboard-layout">
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h2>Progress & Wins</h2>
                    <p style="color: var(--color-text-muted);">Track your CEO habits and celebrate how far you've come.</p>
                </div>
                <div class="flex gap-2">
                    <a href="#/quarter-reset" class="btn btn-secondary" style="font-size: 0.875rem; padding: 0.5rem 1rem;">Quarter Reset</a>
                    <a href="#/settings" class="btn btn-outline" style="font-size: 0.875rem; padding: 0.5rem 1rem;">⚙️ Settings</a>
                </div>
            </div>

            <!-- CEO Insight Engine -->
            <div class="card mb-6" style="border-top: 4px solid var(--color-primary);">
                <div class="flex items-center gap-2 mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    <h3 style="margin: 0; display: flex; align-items: center;">
                        Weekly CEO Insight
                        ${renderTooltip("Identifies the area most likely slowing your progress right now.", "Solving the right problem is faster than doing more work.")}
                    </h3>
                </div>
                <div style="background: var(--color-bg-main); padding: 1.25rem; border-radius: var(--radius-md); font-size: 1.05rem; line-height: 1.6; color: var(--color-black);">
                    ${insight}
                </div>
            </div>

            <!-- Stats Overview & Momentum Tracker -->
            <div class="grid-sidebar-right mb-8">
                <div class="flex-col gap-4">
                    <div class="card text-center flex-col justify-center" style="padding: 1.5rem 1rem; flex: 1; border-top: 4px solid var(--color-primary);">
                        <p style="font-size: 2.5rem; font-family: var(--font-heading); font-weight: 700; color: var(--color-primary); line-height: 1;">${store.streak}</p>
                        <p style="display: flex; align-items: center; justify-content: center; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); margin-top: 0.5rem; font-weight: 600;">
                            Week Streak
                            ${renderTooltip("The number of consecutive weeks you have completed your Friday Review.", "Momentum is a CEO's best friend. Tracking your consistency builds the habit of taking time to work ON the business, not just IN it.")}
                        </p>
                    </div>
                </div>

                <div class="card" style="border-top: 4px solid var(--color-secondary);">
                    <div class="flex items-center gap-2 mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary-dark)" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                        <h3 style="margin: 0; display: flex; align-items: center;">
                            Quarterly Milestones
                            ${renderTooltip("The three major stepping stones required to hit your 90-Day goal.", "Milestones turn a massive 90-day goal into manageable monthly deliverables so you don't procrastinate until month three.")}
                        </h3>
                    </div>
                    <p style="font-size: 0.9rem; color: var(--color-text-muted); margin-bottom: 1rem;">From your 90-Day setup.</p>
                    
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                            <input type="checkbox" id="ms-m1" style="margin-top: 0.25rem; width: 18px; height: 18px; accent-color: var(--color-primary);">
                            <span>
                                <strong style="display: block; font-size: 0.85rem; color: var(--color-primary-dark); text-transform: uppercase;">Month 1</strong>
                                ${store.goals?.milestones?.month1 || 'Not set'}
                            </span>
                        </label>
                        <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                            <input type="checkbox" id="ms-m2" style="margin-top: 0.25rem; width: 18px; height: 18px; accent-color: var(--color-primary);">
                            <span>
                                <strong style="display: block; font-size: 0.85rem; color: var(--color-primary-dark); text-transform: uppercase;">Month 2</strong>
                                ${store.goals?.milestones?.month2 || 'Not set'}
                            </span>
                        </label>
                        <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                            <input type="checkbox" id="ms-m3" style="margin-top: 0.25rem; width: 18px; height: 18px; accent-color: var(--color-primary);">
                            <span>
                                <strong style="display: block; font-size: 0.85rem; color: var(--color-primary-dark); text-transform: uppercase;">Month 3</strong>
                                ${store.goals?.milestones?.month3 || 'Not set'}
                            </span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-between mb-4">
                <h3 style="margin: 0;">Your Wins Log</h3>
                <span style="font-size: 0.9rem; color: var(--color-text-muted);">${reviews.length} reviews, ${plansCount} plans logged</span>
            </div>
            
            <p style="color: var(--color-text-muted); margin-bottom: var(--spacing-lg); font-size: 0.9rem;">Review what worked in the past. These are your breadcrumbs for success.</p>

            <div id="wins-list">
                ${reviews.length === 0 ? `
                    <div class="card text-center" style="padding: 3rem 1rem; border: 1px dashed var(--color-border); background: transparent; box-shadow: none;">
                        <p style="color: var(--color-text-muted);">No reviews complete yet. Do your first Friday Review to see your wins here.</p>
                    </div>
                ` : reviews.slice().reverse().map(r => `
                    <div class="card mb-4" style="border-left: 4px solid var(--color-secondary);">
                        <div class="flex justify-between items-center mb-2">
                            <span style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase;">
                                Week of ${new Date(r.date).toLocaleDateString()}
                            </span>
                            ${r.sales || r.leads ? `
                                <span style="font-size: 0.75rem; background: var(--color-bg-main); padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); color: var(--color-text-main); font-weight: 500;">
                                    ${r.sales ? r.sales : ''} ${r.sales && r.leads ? '|' : ''} ${r.leads ? r.leads : ''}
                                </span>
                            ` : ''}
                        </div>
                        <p style="font-weight: 500; margin-bottom: 0.5rem; display: flex; align-items: flex-start; gap: 0.5rem;">
                            <span style="color: var(--color-secondary-dark); font-size: 1.2rem; line-height: 1;">★</span>
                            ${r.workedWell}
                        </p>
                        <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--color-border);">
                            <span style="font-weight: 600;">Moved forward:</span> ${r.movedForward}
                        </p>
                    </div>
                `).join('')}
            </div>

            ${monthlyReviews.length > 0 ? `
                <div class="flex items-center justify-between mb-4 mt-8">
                    <h3 style="margin: 0;">Monthly Strategic Reviews</h3>
                    <span style="font-size: 0.9rem; color: var(--color-text-muted);">${monthlyReviews.length} months logged</span>
                </div>
                <div id="monthly-wins-list">
                    ${monthlyReviews.slice().reverse().map(mr => `
                        <div class="card mb-4" style="border-left: 4px solid var(--color-accent);">
                            <div class="mb-2">
                                <span style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase;">
                                    Month ending ${new Date(mr.date).toLocaleDateString()}
                                </span>
                            </div>
                            <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 0.5rem;"><span style="font-weight: 600;">Biggest Lead Generator:</span> ${mr.leads}</p>
                            <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 0.5rem;"><span style="font-weight: 600;">Sales Driver:</span> ${mr.sales}</p>
                            <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--color-border);">
                                <span style="font-weight: 600;">Elimination Directive:</span> Stop doing ${mr.eliminate} (draining: ${mr.drain})
                            </p>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <div class="flex items-center justify-between mb-4 mt-8">
                <h3 style="margin: 0;">Daily Actions History</h3>
                <button id="btn-export-csv" class="btn btn-ghost btn-sm" style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--color-primary-dark); cursor: pointer;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Export to Excel (CSV)
                </button>
            </div>
            <p style="color: var(--color-text-muted); margin-bottom: var(--spacing-lg); font-size: 0.9rem;">Review what tasks you completed each day.</p>
            <div id="history-list">
                ${!store.dailyLogs || Object.keys(store.dailyLogs).length === 0 ? `
                    <div class="card text-center" style="padding: 3rem 1rem; border: 1px dashed var(--color-border); background: transparent; box-shadow: none;">
                        <p style="color: var(--color-text-muted);">No daily tasks logged yet.</p>
                    </div>
                ` : Object.keys(store.dailyLogs).sort().reverse().slice(0, 90).map(dateStr => `
                    <div class="card mb-4" style="border-top: 3px solid #00C2CB;">
                        <p style="font-size: 0.85rem; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.5rem;">
                            ${new Date(dateStr).toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'})}
                        </p>
                        <ul style="list-style: none; padding-left: 0; margin-top: 0.5rem; margin-bottom: 0;">
                            ${store.dailyLogs[dateStr].map(t => `
                                <li style="display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.25rem;">
                                    <span style="color: ${t.done ? 'var(--color-primary)' : '#ccc'};">${t.done ? '☑' : '☐'}</span>
                                    <span style="font-size: 0.95rem; ${t.done ? 'text-decoration: line-through; color: var(--color-text-muted);' : ''}">${t.text}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Logic Rules Engine
function generateInsights(store) {
    const reviews = store.reviews || [];
    const plans = store.weeklyPlans || [];
    
    // Check if we have enough data
    if (reviews.length < 2 && plans.length < 2) {
        return "Not enough data yet. Complete a few more weekly plans and Friday reviews so your Coach can spot patterns and generate personalized insights.";
    }

    const recentPlans = plans.slice(-3);
    let visibilityCount = 0; let followUpCount = 0; let revActionCount = 0;

    recentPlans.forEach(p => {
        if (p.visibilityAction && p.visibilityAction.length > 5) visibilityCount++;
        if (p.followUps && p.followUps.length > 5 && !p.followUps.toLowerCase().includes('none')) followUpCount++;
        if (p.revenueAction && p.revenueAction.length > 5) revActionCount++;
    });

    // 1. Sales/Conversion Check
    if (visibilityCount >= 2 && (followUpCount === 0 || revActionCount === 0)) {
        return "<strong>Sales/Conversion Alert:</strong> You have been doing a lot of 'Visibility' and marketing actions recently, but you are failing to log 'Follow-up' or direct 'Revenue' actions. Stop marketing immediately and start scheduling sales conversations to convert your generated interest into revenue.";
    }

    // 2. Time/Energy Check
    const recentReviews = reviews.slice(-3);
    let difficultContent = false;
    recentReviews.forEach(r => {
        if (r.difficult) {
            const diff = r.difficult.toLowerCase();
            if (diff.includes('email') || diff.includes('content') || diff.includes('writing')) difficultContent = true;
        }
    });

    if (difficultContent) {
        return "<strong>Energy Drain Alert:</strong> You consistently mention that writing, emails, or content creation was difficult or draining. Consider lowering your content volume or immediately start batch-creating it on Mondays so it stops dragging down your energy all week.";
    }

    return "Your momentum looks clean. You are protecting your CEO time and focusing on revenue-generating actions. Keep executing your 90-day plan.";
}

function progressAttachEvents() {
    // Nav
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-progress')?.classList.add('active');

    // Export functionality
    const btnExport = document.getElementById('btn-export-csv');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const store = getStore();
            if (!store.dailyLogs || Object.keys(store.dailyLogs).length === 0) {
                alert("No daily actions to export.");
                return;
            }
            
            let csvContent = "Date,Task,Status\r\n";
            Object.keys(store.dailyLogs).sort().reverse().forEach(date => {
                store.dailyLogs[date].forEach(task => {
                    const taskText = task.text.replace(/"/g, '""'); // escape quotes
                    const status = task.done ? "Completed" : "Pending";
                    csvContent += `"${date}","${taskText}","${status}"\r\n`;
                });
            });
            
            // Bulletproof cross-browser Blob download
            const blob = new Blob(["\uFEFF", csvContent], { type: 'text/csv;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.style.display = 'none';
            link.href = url;
            link.download = `CEO_Actions_History_${new Date().toISOString().split('T')[0]}.csv`;
            
            document.body.appendChild(link);
            link.click();
            
            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 500);
        });
    }
}
