// revenue.js
import { renderNav } from '../components/nav.js';
import { getStore, updateRevenueSettings, addRevenueEntry, getRevenueInsights } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';

export function renderRevenue() {
    window.setScreenModule({ attachEvents: revenueAttachEvents });
    const store = getStore();
    const insights = getRevenueInsights();

    return `
        ${renderNav()}
        <div class="main-content dashboard-layout">
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h2>Revenue Tracking</h2>
                    <p style="color: var(--color-text-muted);">Monitor your progress toward your quarterly goal.</p>
                </div>
                <div style="background: var(--color-secondary-light); padding: 0.5rem 1rem; border-radius: var(--radius-full); display: flex; align-items: center; gap: 0.5rem; font-weight: 600; color: var(--color-secondary-dark);">
                    Quarter: ${insights.momentum}
                </div>
            </div>

            <!-- Top Cards -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                <div class="card" style="padding: 1.5rem; text-align: center;">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.875rem; color: var(--color-text-muted); font-weight: 600; margin-bottom: 0.5rem;">
                        Quarter Revenue Goal
                        ${renderTooltip("The total revenue you aim to generate over the 90 days.", "Setting a specific financial target makes it real. It shifts your mindset from 'I hope I make money' to 'Here is the exact number I am solving for.'")}
                    </p>
                    <h3 style="font-size: 2rem; color: var(--color-black); margin: 0;">$${insights.goal.toLocaleString()}</h3>
                </div>
                <div class="card" style="padding: 1.5rem; text-align: center; border: 2px solid var(--color-primary-light);">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.875rem; color: var(--color-primary-dark); font-weight: 600; margin-bottom: 0.5rem;">
                        This Month's Target
                        ${renderTooltip("One-third of your quarterly goal.", "Breaking the 90-day goal into a 30-day chunk makes it feel achievable and keeps you accountable right now.")}
                    </p>
                    <h3 style="font-size: 2rem; color: var(--color-primary-dark); margin: 0;">$${insights.monthTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                </div>
                <div class="card" style="padding: 1.5rem; text-align: center; border: 2px solid var(--color-accent-light);">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.875rem; color: var(--color-accent-dark); font-weight: 600; margin-bottom: 0.5rem;">
                        This Week's Target
                        ${renderTooltip("Your monthly target divided by four weeks.", "This is the number you should be solving for every single week when you write your Monday Plan.")}
                    </p>
                    <h3 style="font-size: 2rem; color: var(--color-accent-dark); margin: 0;">$${insights.weeklyTargetLength.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--spacing-lg); margin-bottom: var(--spacing-lg);">
                
                <!-- Main Content Left -->
                <div>
                   <!-- Multi-Level Progress Board -->
                   <div class="card mb-6" style="padding: 2rem;">
                       
                       <div class="flex justify-between items-end mb-4">
                           <h3 style="margin: 0; display: flex; align-items: center;">
                               This Week's Revenue
                               ${renderTooltip("Cash generated since Monday.", "It shows if your short-term actions are actually translating into sales.")}
                           </h3>
                           <div style="text-align: right;">
                               <span style="font-size: 1.75rem; font-weight: 700; color: var(--color-accent-dark);">$${insights.revenueThisWeek.toLocaleString()}</span>
                               <span style="font-size: 0.9rem; color: var(--color-text-muted); display: block;">/ $${insights.weeklyTargetLength.toLocaleString(undefined, { maximumFractionDigits: 0 })} target</span>
                           </div>
                       </div>
                       
                       ${insights.projectedRevenue < insights.goal && insights.entries.length > 2 ? `
                       <div style="background: var(--color-bg-light); padding: 0.75rem; border-radius: var(--radius-sm); border-left: 3px solid var(--color-accent); font-size: 0.85rem; margin-bottom: 1.5rem; color: var(--color-text-main);">
                           <strong style="display: flex; align-items: center;">
                               Pace Warning (Forecast)
                               ${renderTooltip("Based on your sales so far, this is where you will end the quarter if nothing changes.", "Forecasting gives you time to pivot. If the number is too low, you need to launch something, run a promo, or increase outreach today.")}
                            </strong> 
                            You are forecasting $${insights.projectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} for the quarter, which is behind your $${insights.goal.toLocaleString()} goal. Consider increasing your sales actions this week.
                       </div>
                       ` : `<div style="height: 1rem;"></div>`}

                       <!-- Monthly Progress (Primary) -->
                       <div class="mb-6">
                           <div class="flex justify-between items-end mb-2">
                               <span style="display: flex; align-items: center; font-weight: 600; font-size: 1.1rem;">
                                   This Month's Revenue Progress
                                   ${renderTooltip("Visual progress toward your 30-day milestone.", "Seeing the bar fill up provides a psychological boost and keeps momentum high.")}
                                </span>
                               <span style="font-weight: 600; color: var(--color-primary-dark); font-size: 1.1rem;">${insights.monthProgressPercent.toFixed(1)}%</span>
                           </div>
                           <div class="progress-container" style="height: 24px; background: var(--color-bg-light); border-radius: var(--radius-full); overflow: hidden; margin-bottom: 0.5rem;">
                               <div class="progress-bar" style="height: 100%; width: ${insights.monthProgressPercent}%; background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-dark) 100%); transition: width 0.5s ease-out;"></div>
                           </div>
                           <p style="font-size: 0.875rem; color: var(--color-text-muted); text-align: right;">$${insights.revenueThisMonth.toLocaleString()} / $${insights.monthTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                       </div>

                       <hr style="border: none; border-top: 1px solid var(--color-border); margin: 1.5rem 0;" />
                       
                       <!-- Quarterly Progress (Secondary) -->
                       <div>
                           <div class="flex justify-between items-end mb-2">
                               <span style="display: flex; align-items: center; font-weight: 500; font-size: 0.95rem; color: var(--color-text-main);">
                                   Quarter Revenue Goal
                                   ${renderTooltip("Visual progress toward the big 90-day win.", "Even if you miss a weekly target, looking at the macro progress helps you see that you are still moving forward overall.")}
                               </span>
                               <span style="font-weight: 600; color: var(--color-text-main); font-size: 0.95rem;">${insights.progressPercent.toFixed(1)}%</span>
                           </div>
                           <div class="progress-container" style="height: 12px; background: var(--color-bg-light); border-radius: var(--radius-full); overflow: hidden; margin-bottom: 0.5rem;">
                               <div class="progress-bar" style="height: 100%; width: ${insights.progressPercent}%; background: var(--color-secondary); transition: width 0.5s ease-out;"></div>
                           </div>
                           <div class="flex justify-between" style="font-size: 0.8rem; color: var(--color-text-muted);">
                               <span>$${insights.totalRevenue.toLocaleString()} / $${insights.goal.toLocaleString()}</span>
                               <span>${insights.salesRemaining} sales needed.</span>
                           </div>
                       </div>
                   </div>

                   <!-- Insights -->
                   <div class="card insight-card" style="background-color: var(--color-primary-light); border-color: var(--color-primary-light);">
                        <div class="flex items-center gap-2 mb-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-dark)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                            <h3 style="color: var(--color-primary-dark); margin: 0;">CEO Insight</h3>
                        </div>
                        <p style="color: var(--color-black); font-size: 0.95rem; line-height: 1.5;">${insights.insightText}</p>
                   </div>

                   <!-- History Chart (Visual CSS) -->
                   <div class="card mt-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="mb-0">Revenue History</h3>
                            <div class="chart-toggles flex gap-2" style="background: var(--color-bg-light); padding: 0.25rem; border-radius: var(--radius-md);">
                                <button class="btn btn-ghost btn-sm active-toggle" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" data-view="week">Week</button>
                                <button class="btn btn-ghost btn-sm" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" data-view="month">Month</button>
                                <button class="btn btn-ghost btn-sm" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" data-view="quarter">Quarter</button>
                            </div>
                        </div>
                        
                        <!-- The chart container which JavaScript will populate via renderChart() -->
                        <div id="revenue-chart-container" style="height: 150px; position: relative;">
                            <!-- Chart injected here -->
                        </div>
                   </div>

                   <!-- Revenue Sources Breakdown -->
                   <div class="card mt-6">
                        <h3 class="mb-4" style="display: flex; align-items: center;">
                            Revenue Sources This Month
                            ${renderTooltip("A breakdown of where your sales actually came from.", "Entrepreneurs do too many things. By tracking sources, you learn what platform or funnel makes you the most money. Double down on that and drop the rest.")}
                        </h3>
                        ${(() => {
            const sources = insights.revenueBySourceMonth || {};
            const total = Object.values(sources).reduce((a, b) => a + b, 0);

            if (total === 0) {
                return `<p style="color: var(--color-text-muted); font-size: 0.9rem;">No revenue logged this month yet. Add entries to see your top sources.</p>`;
            }

            // Define a color palette for the pie chart
            const colors = [
                '#027A48', // Primary Green
                '#F2C21D', // Accent Yellow
                '#D92D20', // Error Red
                '#1570EF', // Blue
                '#7A5AF8', // Purple
                '#F97066', // Light Red
                '#32D583', // Light Green
                '#FDB022', // Light Yellow
                '#6CE9A6', // Very Light Green
                '#98A2B3'  // Gray (Other)
            ];

            // Sort sources by amount
            const sortedSources = Object.entries(sources).sort((a, b) => b[1] - a[1]);

            // Build conic-gradient string and legend
            let conicStops = [];
            let currentDegree = 0;
            let legendHtml = '';

            sortedSources.forEach(([source, amount], index) => {
                const percentage = (amount / total) * 100;
                const degrees = (amount / total) * 360;
                const color = colors[index % colors.length];

                conicStops.push(`${color} ${currentDegree}deg ${currentDegree + degrees}deg`);
                currentDegree += degrees;

                legendHtml += `
                                    <div class="flex justify-between items-center" style="margin-bottom: 0.5rem; font-size: 0.9rem;">
                                        <div class="flex items-center gap-2">
                                            <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${color};"></div>
                                            <span>${source} (${percentage.toFixed(0)}%)</span>
                                        </div>
                                        <span style="font-weight: 600; color: var(--color-black);">$<span style="font-family: monospace;">${amount.toLocaleString()}</span></span>
                                    </div>
                                `;
            });

            const gradientStr = conicStops.join(', ');

            return `
                                <div style="display: flex; gap: 2rem; align-items: center; flex-wrap: wrap;">
                                    <div style="width: 150px; height: 150px; border-radius: 50%; background: conic-gradient(${gradientStr}); flex-shrink: 0; box-shadow: inset 0 0 0 4px white, 0 4px 6px rgba(0,0,0,0.05);"></div>
                                    <div style="flex-grow: 1; min-width: 200px;">
                                        ${legendHtml}
                                    </div>
                                </div>
                            `;
        })()}
                   </div>

                   <!-- Revenue Offers Breakdown -->
                   <div class="card mt-6">
                        <h3 class="mb-4" style="display: flex; align-items: center;">
                            Revenue by Offer This Month
                            ${renderTooltip("A breakdown of which products or services generated sales.", "Knowing exactly what people are buying right now helps you decide what to promote next week.")}
                        </h3>
                        ${(() => {
            const offers = insights.revenueByOfferMonth || {};
            const total = Object.values(offers).reduce((a, b) => a + b, 0);

            if (total === 0) {
                return `<p style="color: var(--color-text-muted); font-size: 0.9rem;">No revenue logged this month yet.</p>`;
            }

            // Define an alternate color palette for offers
            const colors = [
                '#1570EF', // Blue
                '#7A5AF8', // Purple
                '#027A48', // Primary Green
                '#F2C21D', // Accent Yellow
                '#D92D20', // Error Red
                '#F97066', // Light Red
                '#32D583', // Light Green
                '#FDB022', // Light Yellow
                '#6CE9A6', // Very Light Green
                '#98A2B3'  // Gray (Other)
            ];

            // Sort offers by amount
            const sortedOffers = Object.entries(offers).sort((a, b) => b[1] - a[1]);

            // Build conic-gradient string and legend
            let conicStops = [];
            let currentDegree = 0;
            let legendHtml = '';

            sortedOffers.forEach(([offer, amount], index) => {
                const percentage = (amount / total) * 100;
                const degrees = (amount / total) * 360;
                const color = colors[index % colors.length];

                conicStops.push(`${color} ${currentDegree}deg ${currentDegree + degrees}deg`);
                currentDegree += degrees;

                legendHtml += `
                                    <div class="flex justify-between items-center" style="margin-bottom: 0.5rem; font-size: 0.9rem;">
                                        <div class="flex items-center gap-2">
                                            <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${color};"></div>
                                            <span>${offer} (${percentage.toFixed(0)}%)</span>
                                        </div>
                                        <span style="font-weight: 600; color: var(--color-black);">$<span style="font-family: monospace;">${amount.toLocaleString()}</span></span>
                                    </div>
                                `;
            });

            const gradientStr = conicStops.join(', ');

            return `
                                <div style="display: flex; gap: 2rem; align-items: center; flex-wrap: wrap;">
                                    <div style="width: 150px; height: 150px; border-radius: 50%; background: conic-gradient(${gradientStr}); flex-shrink: 0; box-shadow: inset 0 0 0 4px white, 0 4px 6px rgba(0,0,0,0.05);"></div>
                                    <div style="flex-grow: 1; min-width: 200px;">
                                        ${legendHtml}
                                    </div>
                                </div>
                            `;
        })()}
                   </div>
                </div>

                <!-- Sidebar Right -->
                <div>
                   <!-- Settings -->
                   <div class="card mb-6">
                       <h3 class="mb-4">Revenue Settings</h3>
                       <form id="revenue-settings-form">
                           <div class="form-group">
                               <label>Quarterly Revenue Goal ($)</label>
                               <input type="number" id="rev-goal" value="${insights.goal || ''}" min="0" step="100" class="form-control" required placeholder="e.g. 10000">
                           </div>
                           <div class="form-group">
                               <label>Average Offer Price ($)</label>
                               <input type="number" id="offer-price" value="${store.revenue.averageOfferPrice || ''}" min="0" step="any" class="form-control" required placeholder="e.g. 1000">
                           </div>
                           <button type="submit" class="btn btn-outline" style="width: 100%;">Save Settings</button>
                       </form>
                   </div>

                   <!-- Log Entry Form -->
                   <div class="card" style="border-top: 4px solid var(--color-accent);">
                       <h3 class="mb-4" style="color: var(--color-accent-dark);">Log Weekly Revenue</h3>
                       <form id="log-revenue-form">
                           <div class="form-group">
                               <label>Amount Made ($)</label>
                               <input type="number" id="log-amount" min="0" step="any" class="form-control" required placeholder="0.00">
                           </div>
                           <div class="form-group">
                               <label>Date Received</label>
                               <input type="date" id="log-date" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                           </div>
                           <div class="form-group">
                               <label>Source (Where did this come from?)</label>
                               <select id="log-source" class="form-control" required>
                                   <option value="Instagram">Instagram</option>
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
                               <input type="text" id="log-offer" class="form-control" placeholder="e.g. Digital Product Toolkit">
                           </div>
                           <div class="form-group">
                               <label>Notes</label>
                               <textarea id="log-notes" class="form-control" rows="2" placeholder="Client name or extra info"></textarea>
                           </div>
                           <button type="submit" class="btn btn-primary" style="width: 100%;">Log Entry</button>
                       </form>
                   </div>
                </div>

            </div>
        </div>
        <style>
            .chart-bar:hover {
                background-color: var(--color-secondary-dark) !important;
            }
            .chart-bar:hover + .chart-tooltip, div:hover > .chart-tooltip {
                opacity: 1 !important;
            }
        </style>
    `;
}

function revenueAttachEvents() {
    // Nav active state
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-revenue')?.classList.add('active');

    const settingsForm = document.getElementById('revenue-settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const goal = parseFloat(document.getElementById('rev-goal').value);
            const price = parseFloat(document.getElementById('offer-price').value);

            updateRevenueSettings({
                quarterlyGoal: goal,
                averageOfferPrice: price
            });
            window.location.reload();
        });
    }

    const logForm = document.getElementById('log-revenue-form');
    if (logForm) {
        logForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const amount = parseFloat(document.getElementById('log-amount').value);
            const source = document.getElementById('log-source').value;
            const offer = document.getElementById('log-offer').value;
            const notes = document.getElementById('log-notes').value;
            const dateStr = document.getElementById('log-date').value;

            addRevenueEntry({
                amount,
                source,
                offer,
                notes,
                date: new Date(dateStr).toISOString()
            });
            window.location.reload();
        });
    }

    // Chart Toggles
    const chartToggles = document.querySelectorAll('.chart-toggles button');
    if (chartToggles.length > 0) {
        chartToggles.forEach(btn => {
            btn.addEventListener('click', (e) => {
                chartToggles.forEach(b => b.classList.remove('active-toggle', 'bg-white', 'shadow-sm'));
                e.target.classList.add('active-toggle', 'bg-white', 'shadow-sm');
                renderChart(e.target.getAttribute('data-view'));
            });
        });

        // Initial render
        renderChart('week');
    }
}

function renderChart(viewMode) {
    const container = document.getElementById('revenue-chart-container');
    if (!container) return;

    // Retrieve fresh insights for chart data
    const insights = getRevenueInsights();
    const entries = insights.entries || [];

    if (entries.length === 0) {
        container.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--color-text-muted); background: var(--color-bg-main); border-radius: var(--radius-md); height: 100%; display: flex; align-items: center; justify-content: center;">
                    No revenue entries yet.
                </div>
            `;
        return;
    }

    // Group entries by the requested view mode
    const grouped = {};
    entries.forEach(e => {
        const date = new Date(e.date);
        let key = '';
        let label = '';

        if (viewMode === 'week') {
            // Approximate grouping by week start (Sunday) to end (Saturday)
            const startOfWeek = new Date(date);
            startOfWeek.setDate(date.getDate() - date.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            key = startOfWeek.toISOString().split('T')[0];
            label = `${startOfWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        } else if (viewMode === 'month') {
            // Group by year and month
            key = `${date.getFullYear()}-${date.getMonth()}`;
            // Show full month name
            label = date.toLocaleDateString(undefined, { month: 'long' });
        } else if (viewMode === 'quarter') {
            // Group by quarter
            const q = Math.floor((date.getMonth() + 3) / 3);
            key = `${date.getFullYear()}-Q${q}`;
            // Just show Q1, Q2 etc without year
            label = `Q${q}`;
        }

        if (!grouped[key]) grouped[key] = { amount: 0, label, date: date.getTime() };
        grouped[key].amount += parseFloat(e.amount) || 0;
    });

    // Convert to array and sort chronologically
    const chartData = Object.values(grouped).sort((a, b) => a.date - b.date);

    const maxAmount = Math.max(...chartData.map(d => d.amount));

    container.innerHTML = `
            <div class="revenue-chart" style="display: flex; gap: 12px; align-items: flex-end; height: 100%; padding-top: 1rem; border-bottom: 1px solid var(--color-border);">
                ${chartData.map(d => {
        const heightPct = maxAmount > 0 ? (d.amount / maxAmount) * 100 : 0;
        return `
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; group">
                        <div style="font-size: 0.7rem; color: var(--color-text-muted); margin-bottom: 4px; opacity: 0; transition: opacity 0.2s; white-space: nowrap;" class="chart-tooltip">$${d.amount.toLocaleString()}</div>
                        <div class="chart-bar" style="width: 100%; max-width: 50px; height: ${heightPct}%; background-color: var(--color-secondary); border-radius: 4px 4px 0 0; min-height: 4px; transition: height 0.5s, background-color 0.2s;"></div>
                        <div style="font-size: 0.65rem; color: var(--color-text-muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;">${d.label}</div>
                    </div>
                    `;
    }).join('')}
            </div>
        `;
}
