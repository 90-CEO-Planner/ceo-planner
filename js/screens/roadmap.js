// roadmap.js
import { renderNav } from '../components/nav.js';
import { getStore, saveStore } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';

export function renderRoadmap() {
    window.setScreenModule({ attachEvents: roadmapAttachEvents });
    const store = getStore();

    // Ensure we have a plan to display
    const weeks = store.weeklyPlans.filter(p => p.generated);
    if (weeks.length === 0) {
        return `
            ${renderNav()}
            <div class="main-content" style="max-width: 800px; padding-top: 5vh; text-align: center;">
                <h2>No 90-Day Plan Found</h2>
                <p style="color: var(--color-text-muted);">You haven't generated a plan yet. Please go to your dashboard to generate one.</p>
                <a href="#/dashboard" class="btn btn-primary mt-4">Go to Dashboard</a>
            </div>
        `;
    }

    const themes = store.monthlyThemes || {};
    const redFlags = store.redFlags || [];
    const checklist = store.setupChecklist || [];
    const summary = weeks.length > 0 && weeks[0].summary ? weeks[0].summary : "Your 90-day roadmap is ready."; // Not stored at top level currently, but we can just use the store if we need, wait... wait, summary is NOT saved in store. I need to fix applyGeneratedPlan to save summary and calibration!

    // Wait, let me fix applyGeneratedPlan to save summary and calibration.
    // I'll display a generic message here if it's missing, but I will fix store.js in the next step.
    const planSummary = store.planSummary || "Your 90-Day Roadmap has been generated based on your strategy mode and current bottleneck.";
    const planCalibration = store.planCalibration || "Calibrated for your specific stage.";

    return `
        ${renderNav()}
        <div class="main-content dashboard-layout">
            <div style="margin-bottom: 2rem;">
                <h2>Your 90-Day Roadmap</h2>
                <p style="color: var(--color-text-muted); font-size: 1.1rem; line-height: 1.5;">${planSummary}</p>
                <div style="background: var(--color-primary-light); color: var(--color-primary-dark); padding: 0.75rem 1rem; border-radius: var(--radius-sm); font-size: 0.9rem; font-weight: 500; border-left: 3px solid var(--color-primary); margin-top: 1rem;">
                    ${planCalibration}
                </div>
            </div>

            <!-- Monthly Themes -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 2.5rem;">
                <div class="card" style="border-top: 4px solid var(--color-primary);">
                    <h4 style="color: var(--color-primary-dark); margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.8rem;">Month 1: Foundation</h4>
                    <p style="font-size: 0.95rem; margin: 0;">${themes.month1 || 'Not set'}</p>
                </div>
                <div class="card" style="border-top: 4px solid var(--color-secondary);">
                    <h4 style="color: var(--color-secondary-dark); margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.8rem;">Month 2: Momentum</h4>
                    <p style="font-size: 0.95rem; margin: 0;">${themes.month2 || 'Not set'}</p>
                </div>
                <div class="card" style="border-top: 4px solid var(--color-accent);">
                    <h4 style="color: var(--color-accent-dark); margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.8rem;">Month 3: Conversion</h4>
                    <p style="font-size: 0.95rem; margin: 0;">${themes.month3 || 'Not set'}</p>
                </div>
            </div>

            <!-- Setup Checklist -->
            <div class="card mb-6" style="border-left: 4px solid var(--color-black);">
                <h3 style="margin-bottom: 1rem;">Week 1 Setup Checklist</h3>
                <p style="font-size: 0.9rem; color: var(--color-text-muted); margin-bottom: 1rem;">Complete these foundational items before diving into your weekly cadence.</p>
                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                    ${checklist.map((item, index) => `
                        <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer; padding: 0.5rem; background: ${item.done ? 'var(--color-bg-light)' : 'transparent'}; border-radius: var(--radius-sm); transition: background 0.2s;">
                            <input type="checkbox" class="setup-checkbox" data-index="${index}" ${item.done ? 'checked' : ''} style="margin-top: 0.25rem; width: 18px; height: 18px; accent-color: var(--color-primary);">
                            <div style="${item.done ? 'text-decoration: line-through; color: var(--color-text-muted);' : ''}">
                                <span style="display: inline-block; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; background: var(--color-bg-light); padding: 0.1rem 0.4rem; border-radius: 4px; margin-bottom: 0.25rem; color: var(--color-text-main);">${item.category || 'task'} • ~${item.estimatedMinutes || 15}m</span>
                                <span style="display: block;">${item.task}</span>
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>

            <!-- Red Flags -->
            <div class="card mb-6" style="border-left: 4px solid #FCA5A5;">
                <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    Red Flags & Course Correction
                    ${renderTooltip("Red flags are leading indicators that you're veering off track.", "Course correction tells you exactly what to do when you hit that red flag so you can recover quickly.")}
                </h3>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                        <thead>
                            <tr style="border-bottom: 2px solid var(--color-border); text-align: left;">
                                <th style="padding: 0.75rem 0.5rem; color: var(--color-text-muted); font-weight: 600;">Metric</th>
                                <th style="padding: 0.75rem 0.5rem; color: var(--color-text-muted); font-weight: 600;">Threshold</th>
                                <th style="padding: 0.75rem 0.5rem; color: var(--color-text-muted); font-weight: 600;">Frequency</th>
                                <th style="padding: 0.75rem 0.5rem; color: var(--color-text-muted); font-weight: 600;">Corrective Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${redFlags.map(rf => `
                                <tr style="border-bottom: 1px solid var(--color-border);">
                                    <td style="padding: 0.75rem 0.5rem; font-weight: 500;">${rf.metric}</td>
                                    <td style="padding: 0.75rem 0.5rem; color: #DC2626;">${rf.threshold}</td>
                                    <td style="padding: 0.75rem 0.5rem;"><span style="background: var(--color-bg-light); padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.8rem; text-transform: uppercase;">${rf.checkFrequency}</span></td>
                                    <td style="padding: 0.75rem 0.5rem;">${rf.correctiveAction}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 12-Week Roadmap -->
            <div style="margin-top: 3rem; margin-bottom: 1.5rem;">
                <h3 style="margin-bottom: 0.5rem;">12-Week Execution Plan</h3>
                <p style="font-size: 0.9rem; color: var(--color-text-muted); font-style: italic;">Note: Your weekly priorities and triplet tasks will automatically populate your "Daily 3" list on the Dashboard to guide your daily focus.</p>
            </div>
            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                ${weeks.sort((a,b) => a.weekNumber - b.weekNumber).map(w => `
                    <div class="card" style="border-left: 4px solid ${w.applied ? '#10B981' : '#E5E7EB'}; opacity: ${w.applied ? '0.7' : '1'};">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border);">
                            <div>
                                <h4 style="margin: 0; color: var(--color-black); font-size: 1.2rem;">Week ${w.weekNumber} <span style="font-size: 0.9rem; font-weight: normal; color: var(--color-text-muted); ml-2">— Month ${w.monthIndex}</span></h4>
                                <p style="font-weight: 500; color: var(--color-primary-dark); margin: 0.5rem 0 0 0;">Focus: ${w.winCondition}</p>
                            </div>
                            ${w.applied ? '<span style="background: #D1FAE5; color: #065F46; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">COMPLETED</span>' : ''}
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                            <div>
                                <p style="font-size: 0.8rem; text-transform: uppercase; color: var(--color-text-muted); font-weight: 600; margin-bottom: 0.5rem;">Top 3 Priorities</p>
                                <ul style="padding-left: 1.25rem; margin: 0; font-size: 0.9rem;">
                                    ${(w.topActions || []).map(p => `<li>${p}</li>`).join('')}
                                </ul>
                            </div>
                            <div>
                                <p style="font-size: 0.8rem; text-transform: uppercase; color: var(--color-text-muted); font-weight: 600; margin-bottom: 0.5rem;">The Triplet</p>
                                <div style="font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.5rem;">
                                    <div><span style="font-weight: 600; color: var(--color-secondary-dark);">Vis:</span> ${w.visibilityAction}</div>
                                    <div><span style="font-weight: 600; color: var(--color-accent-dark);">Rev:</span> ${w.revenueAction}</div>
                                    <div><span style="font-weight: 600; color: var(--color-primary-dark);">F/Up:</span> ${w.followUps}</div>
                                </div>
                            </div>
                        </div>

                        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed var(--color-border); font-size: 0.9rem;">
                            <p style="margin-bottom: 0.5rem;"><strong>Daily Micro-Tasks:</strong> ${(w.daily3 || []).join(' | ')}</p>
                            <p style="margin: 0;"><strong>Success Check:</strong> ${w.successCheck || 'Completed the week.'}</p>
                        </div>
                    </div>
                `).join('')}
            </div>

        </div>
    `;
}

function roadmapAttachEvents() {
    // Checkbox state persistence
    document.querySelectorAll('.setup-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            const store = getStore();
            if (store.setupChecklist && store.setupChecklist[index]) {
                store.setupChecklist[index].done = e.target.checked;
                saveStore(store);
                
                // Visual update without full re-render
                const container = e.target.closest('label');
                if (e.target.checked) {
                    container.style.background = 'var(--color-bg-light)';
                    container.querySelector('div').style.textDecoration = 'line-through';
                    container.querySelector('div').style.color = 'var(--color-text-muted)';
                } else {
                    container.style.background = 'transparent';
                    container.querySelector('div').style.textDecoration = 'none';
                    container.querySelector('div').style.color = 'inherit';
                }
            }
        });
    });
}
