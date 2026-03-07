// progress.js
import { renderNav } from '../components/nav.js';
import { getStore } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';

export function renderProgress() {
    window.setScreenModule({ attachEvents: progressAttachEvents });
    const store = getStore();
    const reviews = store.reviews;
    const plansCount = store.weeklyPlans.length;

    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 800px;">
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

            <!-- Stats Overview & Momentum Tracker -->
            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: var(--spacing-lg); margin-bottom: var(--spacing-xl);">
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
                ` : reviews.reverse().map(r => `
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
        </div>
    `;
}

function progressAttachEvents() {
    // Nav
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-progress')?.classList.add('active');
}
