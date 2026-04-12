// revenue.js
import { renderNav } from '../components/nav.js';
import { getStore, updateRevenueSettings, addRevenueEntry, deleteRevenueEntry, getRevenueInsights, updateLeadGoal, addLeadEntry, deleteLeadEntry, addMetricSnapshot, deleteMetricSnapshot } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';

export function renderRevenue() {
    window.setScreenModule({ attachEvents: revenueAttachEvents });
    const store = getStore();
    const insights = getRevenueInsights();
    
    const currency = store.settings?.currency || '$';
    
    // Core calculations
    const leads = store.leads?.entries || [];
    const totalLeads = leads.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    const leadGoal = parseFloat(store.leads?.quarterlyGoal) || 0;
    const leadProgressPercent = leadGoal > 0 ? (totalLeads / leadGoal) * 100 : 0;
    
    const salesCount = insights.entries ? insights.entries.length : 0;
    const metrics = store.metrics || [];
    
    const totalCalls = metrics.reduce((sum, m) => sum + (parseFloat(m.calls) || 0), 0);
    
    // Conversion Rates
    const leadToSaleConversion = totalLeads > 0 ? ((salesCount / totalLeads) * 100).toFixed(1) : 0;
    const callBookingRate = totalLeads > 0 ? ((totalCalls / totalLeads) * 100).toFixed(1) : 0;
    const callCloseRate = totalCalls > 0 ? ((salesCount / totalCalls) * 100).toFixed(1) : (salesCount > 0 ? 100 : 0);

    return `
        ${renderNav()}
        <div class="main-content dashboard-layout">
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h2>Revenue & Sales Analytics</h2>
                    <p style="color: var(--color-text-muted);">Monitor your pipeline, conversions, and growth metrics.</p>
                </div>
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <div style="position: relative;" id="report-dropdown-wrapper">
                        <button class="btn btn-primary btn-sm" id="btn-toggle-report" style="display: flex; align-items: center; gap: 0.5rem;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            Generate Report
                        </button>
                        <div id="report-dropdown-menu" style="display: none; position: absolute; top: 100%; right: 0; margin-top: 0.5rem; background: white; border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 100; min-width: 200px; overflow: hidden;">
                            <button id="btn-report-csv" style="display: block; width: 100%; text-align: left; padding: 0.75rem 1rem; border: none; background: none; font-size: 0.9rem; color: var(--color-black); cursor: pointer; border-bottom: 1px solid var(--color-bg-light);" onmouseover="this.style.background='var(--color-bg-light)'" onmouseout="this.style.background='none'">
                                📊 Raw Data Export (.csv)
                            </button>
                            <button id="btn-report-ai" style="display: block; width: 100%; text-align: left; padding: 0.75rem 1rem; border: none; background: none; font-size: 0.9rem; color: var(--color-primary-dark); cursor: pointer; font-weight: 500;" onmouseover="this.style.background='var(--color-bg-light)'" onmouseout="this.style.background='none'">
                                🤖 AI Executive Report
                            </button>
                        </div>
                    </div>
                    <div style="background: var(--color-secondary-light); padding: 0.5rem 1rem; border-radius: var(--radius-full); display: flex; align-items: center; gap: 0.5rem; font-weight: 600; color: var(--color-secondary-dark);">
                        Quarter: ${insights.momentum}
                    </div>
                </div>
            </div>

            <!-- Top Cards -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                <div class="card" style="padding: 1.5rem; text-align: center;">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase;">
                        Quarter Revenue Goal
                    </p>
                    <h3 style="font-size: 1.75rem; color: var(--color-black); margin: 0;">${currency}${insights.goal.toLocaleString()}</h3>
                </div>
                <div class="card" style="padding: 1.5rem; text-align: center; border: 2px solid var(--color-primary-light);">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--color-primary-dark); font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase;">
                        Quarter Lead Goal
                    </p>
                    <h3 style="font-size: 1.75rem; color: var(--color-primary-dark); margin: 0;">${totalLeads.toLocaleString()} / ${leadGoal.toLocaleString()}</h3>
                </div>
                <div class="card" style="padding: 1.5rem; text-align: center; border: 2px solid var(--color-accent-light);">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--color-accent-dark); font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase;">
                        Lead-to-Sale Conversion
                    </p>
                    <h3 style="font-size: 1.75rem; color: var(--color-accent-dark); margin: 0;">${leadToSaleConversion}%</h3>
                </div>
                <div class="card" style="padding: 1.5rem; text-align: center;">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase;">
                        Call Close Rate
                    </p>
                    <h3 style="font-size: 1.75rem; color: var(--color-black); margin: 0;">${callCloseRate}%</h3>
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
                               <span style="font-size: 1.75rem; font-weight: 700; color: var(--color-accent-dark);">${currency}${insights.revenueThisWeek.toLocaleString()}</span>
                               <span style="font-size: 0.9rem; color: var(--color-text-muted); display: block;">/ ${currency}${insights.weeklyTargetLength.toLocaleString(undefined, { maximumFractionDigits: 0 })} target</span>
                           </div>
                       </div>
                       
                       ${insights.projectedRevenue < insights.goal && insights.entries.length > 2 ? `
                       <div style="background: var(--color-bg-light); padding: 0.75rem; border-radius: var(--radius-sm); border-left: 3px solid var(--color-accent); font-size: 0.85rem; margin-bottom: 1.5rem; color: var(--color-text-main);">
                           <strong style="display: flex; align-items: center;">
                               Pace Warning (Forecast)
                               ${renderTooltip("Based on your sales so far, this is where you will end the quarter if nothing changes.", "Forecasting gives you time to pivot. If the number is too low, you need to launch something, run a promo, or increase outreach today.")}
                            </strong> 
                            You are forecasting ${currency}${insights.projectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} for the quarter, which is behind your ${currency}${insights.goal.toLocaleString()} goal. Consider increasing your sales actions this week.
                       </div>
                       ` : `<div style="height: 1rem;"></div>`}

                       <!-- Monthly Progress (Primary) -->
                       <div class="mb-6">
                           <div class="flex justify-between items-end mb-2">
                               <span style="display: flex; align-items: center; font-weight: 600; font-size: 1.1rem;">
                                   This Month's Revenue Progress
                                </span>
                               <span style="font-weight: 600; color: var(--color-primary-dark); font-size: 1.1rem;">${insights.monthProgressPercent.toFixed(1)}%</span>
                           </div>
                           <div class="progress-container" style="height: 24px; background: var(--color-bg-light); border-radius: var(--radius-full); overflow: hidden; margin-bottom: 0.5rem;">
                               <div class="progress-bar" style="height: 100%; width: ${insights.monthProgressPercent}%; background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-dark) 100%); transition: width 0.5s ease-out;"></div>
                           </div>
                           <p style="font-size: 0.875rem; color: var(--color-text-muted); text-align: right;">${currency}${insights.revenueThisMonth.toLocaleString()} / ${currency}${insights.monthTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                       </div>

                       <hr style="border: none; border-top: 1px solid var(--color-border); margin: 1.5rem 0;" />
                       
                       <!-- Quarterly Lead Progress -->
                       <div>
                           <div class="flex justify-between items-end mb-2">
                               <span style="display: flex; align-items: center; font-weight: 500; font-size: 0.95rem; color: var(--color-text-main);">
                                   Quarter Lead Goal
                               </span>
                               <span style="font-weight: 600; color: var(--color-text-main); font-size: 0.95rem;">${leadProgressPercent.toFixed(1)}%</span>
                           </div>
                           <div class="progress-container" style="height: 12px; background: var(--color-bg-light); border-radius: var(--radius-full); overflow: hidden; margin-bottom: 0.5rem;">
                               <div class="progress-bar" style="height: 100%; width: ${leadProgressPercent}%; background: var(--color-secondary); transition: width 0.5s ease-out;"></div>
                           </div>
                           <div class="flex justify-between" style="font-size: 0.8rem; color: var(--color-text-muted);">
                               <span>${totalLeads.toLocaleString()} / ${leadGoal.toLocaleString()} leads</span>
                           </div>
                       </div>
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
                        <div id="revenue-chart-container" style="height: 150px; position: relative;"></div>
                   </div>
                   
                   <!-- Monthly Snapshots -->
                   <div class="card mt-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="mb-0">Monthly Metric Snapshots</h3>
                        </div>
                        ${metrics.length === 0 ? '<p style="color: var(--color-text-muted); font-size: 0.9rem;">No monthly snapshots logged yet.</p>' : `
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            ${(() => {
                                const sortedMetrics = metrics.slice().sort((a,b) => new Date(a.date) - new Date(b.date));
                                return sortedMetrics.slice().reverse().map((m, index) => {
                                    const prev = sortedMetrics.slice().reverse()[index + 1];
                                    const getDiffHtml = (current, previous) => {
                                        if (previous === undefined || previous === null) return '';
                                        const diff = current - previous;
                                        if (diff > 0) return `<span style="color: var(--color-primary-dark); font-size: 0.7rem;">(↑ ${diff.toLocaleString()})</span>`;
                                        if (diff < 0) return `<span style="color: var(--color-error); font-size: 0.7rem;">(↓ ${Math.abs(diff).toLocaleString()})</span>`;
                                        return `<span style="color: var(--color-text-muted); font-size: 0.7rem;">(-)</span>`;
                                    };
                                    return `
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border);">
                                        <div style="flex: 1;">
                                            <span style="font-weight: 600; color: var(--color-black); display: block;">${new Date(m.date).toLocaleDateString(undefined, {month:'long', year:'numeric'})}</span>
                                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem;">
                                                <span style="font-size: 0.8rem; color: var(--color-text-muted);"><strong>Traffic:</strong> ${m.traffic.toLocaleString()} ${getDiffHtml(m.traffic, prev?.traffic)}</span>
                                                <span style="font-size: 0.8rem; color: var(--color-text-muted);"><strong>Calls:</strong> ${m.calls} ${getDiffHtml(m.calls, prev?.calls)}</span>
                                                <span style="font-size: 0.8rem; color: var(--color-text-muted);"><strong>Social:</strong> ${m.social.toLocaleString()} ${getDiffHtml(m.social, prev?.social)}</span>
                                            </div>
                                        </div>
                                        <button type="button" class="btn btn-ghost btn-sm btn-delete-metric" data-id="${m.id}" style="padding: 0.25rem 0.5rem; color: var(--color-text-muted);" title="Delete Entry">🗑️</button>
                                    </div>
                                    `;
                                }).join('');
                            })()}
                        </div>
                        `}
                   </div>

                   <!-- Revenue Sources Breakdown -->
                   <div class="card mt-6">
                        <h3 class="mb-4" style="display: flex; align-items: center;">
                            Revenue Sources This Month
                        </h3>
                        ${renderPieChart(insights.revenueBySourceMonth || {}, currency)}
                   </div>
                </div>

                <!-- Sidebar Right -->
                <div>
                   <!-- Multi-Form Tabs -->
                   <div class="card" style="border-top: 4px solid var(--color-accent); padding: 1.5rem;">
                       <div class="flex gap-2 mb-4" style="border-bottom: 1px solid var(--color-border); padding-bottom: 0.5rem;">
                           <button class="btn btn-ghost btn-sm active" id="tab-rev" style="color: var(--color-primary-dark); font-weight: 600;">💰 Sale</button>
                           <button class="btn btn-ghost btn-sm" id="tab-lead" style="color: var(--color-text-muted);">👥 Leads</button>
                           <button class="btn btn-ghost btn-sm" id="tab-metric" style="color: var(--color-text-muted);">📊 Snapshot</button>
                       </div>

                       <!-- Log Revenue Form -->
                       <form id="log-revenue-form" class="log-form active">
                           <div class="form-group">
                               <label>Amount Made (${currency})</label>
                               <input type="number" id="log-amount" min="0" step="any" class="form-control" required placeholder="0.00">
                           </div>
                           <div class="form-group">
                               <label>Date Received</label>
                               <input type="date" id="log-date" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                           </div>
                           <div class="form-group">
                               <label>Source</label>
                               <select id="log-source" class="form-control" required>
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
                                   <option value="Other">Other</option>
                               </select>
                           </div>
                           <div class="form-group">
                               <label>Offer Name (Optional)</label>
                               <input type="text" id="log-offer" class="form-control" placeholder="e.g. Digital Product Toolkit">
                           </div>
                           <button type="submit" class="btn btn-primary" style="width: 100%;">Log Sale</button>
                       </form>

                       <!-- Log Leads Form -->
                       <form id="log-leads-form" class="log-form" style="display: none;">
                           <div class="form-group">
                               <label>Total Leads Generated</label>
                               <input type="number" id="lead-amount" min="1" step="1" class="form-control" required placeholder="e.g. 50">
                           </div>
                           <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                               <div>
                                   <label>Calls Booked</label>
                                   <input type="number" id="lead-calls" min="0" step="1" class="form-control" value="0" placeholder="0">
                               </div>
                               <div>
                                   <label>Closes (Sales)</label>
                                   <input type="number" id="lead-closes" min="0" step="1" class="form-control" value="0" placeholder="0">
                               </div>
                           </div>
                           <div class="form-group">
                               <label>Date</label>
                               <input type="date" id="lead-date" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                           </div>
                           <div class="form-group">
                               <label>Lead Source</label>
                               <input type="text" id="lead-source" class="form-control" required placeholder="e.g. Meta Ads, Webinar, IG Story">
                           </div>
                           <button type="submit" class="btn btn-secondary" style="width: 100%;">Log Leads</button>
                       </form>
                       
                       <!-- Log Metric Snapshot Form -->
                       <form id="log-metric-form" class="log-form" style="display: none;">
                           <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 1rem;">Log your metrics once a month to track big-picture growth.</p>
                           <div class="form-group">
                               <label>Website Traffic (Visitors)</label>
                               <input type="number" id="metric-traffic" min="0" step="1" class="form-control" required placeholder="e.g. 1500">
                           </div>
                           <div class="form-group">
                               <label>Sales Calls Booked</label>
                               <input type="number" id="metric-calls" min="0" step="1" class="form-control" required placeholder="e.g. 12">
                           </div>
                           <div class="form-group">
                               <label>Total Social Audience</label>
                               <input type="number" id="metric-social" min="0" step="1" class="form-control" required placeholder="e.g. 4500">
                           </div>
                           <div class="form-group">
                               <label>Snapshot Date</label>
                               <input type="date" id="metric-date" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                           </div>
                           <button type="submit" class="btn btn-outline" style="width: 100%;">Save Snapshot</button>
                       </form>
                   </div>
                   
                   <!-- Pipeline Visuals / Recent Entities -->
                   <div class="card mt-6">
                       <h3 class="mb-4">Recent Pipeline Events</h3>
                       <div style="display:flex; flex-direction: column; gap: 0.75rem; max-height: 400px; overflow-y: auto;" class="custom-scroll">
                           ${[...insights.entries, ...leads].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 15).map(e => {
                               const isSale = !!e.offer || typeof e.source === 'string' && e.amount.toString().includes('0'); // Crude check
                               const isExplicitSale = Object.keys(e).includes('offer');
                               if (isExplicitSale) {
                                   return `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border);">
                                        <div>
                                            <span style="font-weight: 600; color: var(--color-black); display: block;">${currency}${parseFloat(e.amount).toLocaleString()}</span>
                                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">SALE • ${new Date(e.date).toLocaleDateString()} • ${e.source}</span>
                                        </div>
                                        <button type="button" class="btn btn-ghost btn-sm btn-delete-revenue" data-id="${e.id}" style="padding: 0.25rem; color: var(--color-text-muted);">🗑️</button>
                                    </div>
                                   `;
                               } else {
                                   return `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border);">
                                        <div>
                                            <span style="font-weight: 600; color: var(--color-secondary-dark); display: block;">+${parseFloat(e.amount).toLocaleString()} Leads</span>
                                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">LEADS • ${new Date(e.date).toLocaleDateString()} • ${e.source}</span>
                                            ${(e.calls > 0 || e.closes > 0) ? `<div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 0.25rem;">📞 ${e.calls || 0} Calls &nbsp;&nbsp; 💰 ${e.closes || 0} Closes</div>` : ''}
                                        </div>
                                        <button type="button" class="btn btn-ghost btn-sm btn-delete-lead" data-id="${e.id}" style="padding: 0.25rem; color: var(--color-text-muted);">🗑️</button>
                                    </div>
                                   `;
                               }
                           }).join('')}
                           ${(insights.entries.length === 0 && leads.length === 0) ? '<p style="font-size: 0.9rem; color: var(--color-text-muted);">No pipeline events logged.</p>' : ''}
                       </div>
                   </div>

                </div>
            </div>

            <!-- AI Report Modal -->
            <div id="ai-report-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999; align-items: center; justify-content: center; padding: 2rem;">
                <div class="card" style="width: 100%; max-width: 800px; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; position: relative;">
                    <div class="flex justify-between items-center mb-4 pb-4" style="border-bottom: 1px solid var(--color-border);">
                        <h2 style="margin:0;">Executive Summary</h2>
                        <button id="btn-close-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--color-text-muted);">&times;</button>
                    </div>
                    <div id="ai-report-content" class="custom-scroll" style="padding: 1rem; min-height: 200px;">
                        <div style="text-align: center; padding: 3rem 0;">
                            <div class="spinner" style="margin: 0 auto 1rem auto; width: 40px; height: 40px; border: 4px solid var(--color-bg-light); border-top: 4px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                            <h3 style="color: var(--color-text-main);">Analyzing Pipeline Data...</h3>
                            <p style="color: var(--color-text-muted);">The AI Coach is reviewing your revenue, leads, and conversions.</p>
                        </div>
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

function renderPieChart(sources, currency) {
    const total = Object.values(sources).reduce((a, b) => a + b, 0);

    if (total === 0) return `<p style="color: var(--color-text-muted); font-size: 0.9rem;">No revenue logged this month yet.</p>`;

    const colors = ['#027A48', '#F2C21D', '#D92D20', '#1570EF', '#7A5AF8', '#F97066', '#32D583', '#FDB022', '#6CE9A6', '#98A2B3'];
    const sortedSources = Object.entries(sources).sort((a, b) => b[1] - a[1]);

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
                <span style="font-weight: 600; color: var(--color-black);">${currency}<span style="font-family: monospace;">${amount.toLocaleString()}</span></span>
            </div>
        `;
    });

    return `
        <div style="display: flex; gap: 2rem; align-items: center; flex-wrap: wrap;">
            <div style="width: 150px; height: 150px; border-radius: 50%; background: conic-gradient(${conicStops.join(', ')}); flex-shrink: 0; box-shadow: inset 0 0 0 4px white, 0 4px 6px rgba(0,0,0,0.05);"></div>
            <div style="flex-grow: 1; min-width: 200px;">${legendHtml}</div>
        </div>
    `;
}

function revenueAttachEvents() {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-revenue')?.classList.add('active');

    const toggleTabs = [
        { id: 'tab-rev', formId: 'log-revenue-form' },
        { id: 'tab-lead', formId: 'log-leads-form' },
        { id: 'tab-metric', formId: 'log-metric-form' }
    ];

    toggleTabs.forEach(t => {
        document.getElementById(t.id)?.addEventListener('click', (e) => {
            // Unset all
            toggleTabs.forEach(tab => {
                document.getElementById(tab.id).style.color = 'var(--color-text-muted)';
                document.getElementById(tab.id).style.fontWeight = 'normal';
                document.getElementById(tab.formId).style.display = 'none';
            });
            // Set active
            e.target.style.color = 'var(--color-primary-dark)';
            e.target.style.fontWeight = '600';
            document.getElementById(t.formId).style.display = 'block';
        });
    });

    const logRevForm = document.getElementById('log-revenue-form');
    if (logRevForm) {
        logRevForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addRevenueEntry({
                amount: parseFloat(document.getElementById('log-amount').value),
                source: document.getElementById('log-source').value,
                offer: document.getElementById('log-offer').value,
                date: new Date(document.getElementById('log-date').value).toISOString()
            });
            window.location.reload();
        });
    }

    const logLeadForm = document.getElementById('log-leads-form');
    if (logLeadForm) {
        logLeadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addLeadEntry({
                amount: parseFloat(document.getElementById('lead-amount').value),
                calls: parseFloat(document.getElementById('lead-calls').value) || 0,
                closes: parseFloat(document.getElementById('lead-closes').value) || 0,
                source: document.getElementById('lead-source').value,
                date: new Date(document.getElementById('lead-date').value).toISOString()
            });
            window.location.reload();
        });
    }

    const logMetricForm = document.getElementById('log-metric-form');
    if (logMetricForm) {
        logMetricForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addMetricSnapshot({
                traffic: parseFloat(document.getElementById('metric-traffic').value),
                calls: parseFloat(document.getElementById('metric-calls').value),
                social: parseFloat(document.getElementById('metric-social').value),
                date: new Date(document.getElementById('metric-date').value).toISOString()
            });
            window.location.reload();
        });
    }

    document.querySelectorAll('.btn-delete-revenue').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm("Delete this revenue entry?")) {
                if (deleteRevenueEntry(e.currentTarget.getAttribute('data-id'))) window.location.reload();
            }
        });
    });

    document.querySelectorAll('.btn-delete-lead').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm("Delete this lead entry?")) {
                if (deleteLeadEntry(e.currentTarget.getAttribute('data-id'))) window.location.reload();
            }
        });
    });

    document.querySelectorAll('.btn-delete-metric').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm("Delete this metric snapshot?")) {
                if (deleteMetricSnapshot(e.currentTarget.getAttribute('data-id'))) window.location.reload();
            }
        });
    });

    const chartToggles = document.querySelectorAll('.chart-toggles button');
    if (chartToggles.length > 0) {
        chartToggles.forEach(btn => {
            btn.addEventListener('click', (e) => {
                chartToggles.forEach(b => b.classList.remove('active-toggle', 'bg-white', 'shadow-sm'));
                e.target.classList.add('active-toggle', 'bg-white', 'shadow-sm');
                renderChart(e.target.getAttribute('data-view'));
            });
        });
        renderChart('week');
    }

    // Report Dropdown Logic
    const btnToggleReport = document.getElementById('btn-toggle-report');
    const reportMenu = document.getElementById('report-dropdown-menu');
    
    if (btnToggleReport && reportMenu) {
        btnToggleReport.addEventListener('click', (e) => {
            e.stopPropagation();
            reportMenu.style.display = reportMenu.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', () => {
            reportMenu.style.display = 'none';
        });
    }

    // AI Report Generation
    const btnReportAi = document.getElementById('btn-report-ai');
    const aiModal = document.getElementById('ai-report-modal');
    const aiContent = document.getElementById('ai-report-content');
    const btnCloseModal = document.getElementById('btn-close-modal');

    if (btnReportAi) {
        btnReportAi.addEventListener('click', async () => {
            aiModal.style.display = 'flex';
            aiContent.innerHTML = `
                <div style="text-align: center; padding: 3rem 0;">
                    <div class="spinner" style="margin: 0 auto 1rem auto; width: 40px; height: 40px; border: 4px solid var(--color-bg-light); border-top: 4px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <h3 style="color: var(--color-text-main);">Evaluating Pipeline Data...</h3>
                    <p style="color: var(--color-text-muted);">The AI Coach is drafting your strategic briefing.</p>
                </div>
            `;

            try {
                const store = getStore();
                const insights = getRevenueInsights();
                const leads = store.leads?.entries || [];
                const metrics = store.metrics || [];
                
                let prompt = `Analyze this exact SaaS / Business revenue data and provide a brutally honest Executive Summary.
                
                Formatting: Use markdown. Break the report into 3 sections:
                1. 📊 The Data Snapshot (Summarize the numbers clearly)
                2. 🔍 The Funnel Diagnosis (Where is the bottleneck? Are they failing to capture leads, book calls, or close sales?)
                3. ⚡ Immediate Directive (Exactly what they must do this week to fix the primary bottleneck)
                
                Data:
                Current Quarter Revenue Goal: ${store.revenue?.quarterlyGoal}
                Total Revenue Generated: ${insights.totalRevenue}
                Total Core Sales Made: ${insights.entries?.length || 0}
                
                Current Quarter Lead Goal: ${store.leads?.quarterlyGoal}
                Total Leads Generated: ${leads.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0)}
                
                Recent Monthly Snapshots (Traffic / Calls / Socials):
                ${metrics.slice(-3).map(m => `Date: ${new Date(m.date).toLocaleDateString()}, Traffic: ${m.traffic}, Calls Booked: ${m.calls}, Social Audience: ${m.social}`).join('\n')}
                
                Recent Revenue Sources:
                ${insights.entries.slice(-5).map(e => `Source: ${e.source}, Amount: ${e.amount}`).join('\n')}
                `;

                const { data, error } = await window.db.functions.invoke('chat', {
                    body: { messages: [{ role: 'user', content: prompt }] }
                });

                if (error) throw new Error(error.message);
                if (data.error) throw new Error(data.error.message || data.error);

                aiContent.innerHTML = window.marked.parse(data.choices[0].message.content);

            } catch(e) {
                aiContent.innerHTML = `<p style="color: var(--color-error); text-align: center;">Warning: The AI Coach failed to analyze the data. Error: ${e.message}</p>`;
            }
        });
    }

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            aiModal.style.display = 'none';
        });
    }

    // CSV Export Logic
    const btnReportCsv = document.getElementById('btn-report-csv');
    if (btnReportCsv) {
        btnReportCsv.addEventListener('click', () => {
            const store = getStore();
            const insights = getRevenueInsights();
            const entries = insights.entries || [];
            const leads = store.leads?.entries || [];
            const metrics = store.metrics || [];
            
            let csvContent = "--- REVENUE (SALES) ---\r\nDate,Amount,Source,Offer\r\n";
            entries.forEach(e => {
                csvContent += `"${new Date(e.date).toLocaleDateString()}","${e.amount}","${(e.source || '').replace(/"/g, '""')}","${(e.offer || '').replace(/"/g, '""')}"\r\n`;
            });
            
            csvContent += "\r\n--- LEADS GENERATED ---\r\nDate,Amount,Source\r\n";
            leads.forEach(e => {
                csvContent += `"${new Date(e.date).toLocaleDateString()}","${e.amount}","${(e.source || '').replace(/"/g, '""')}"\r\n`;
            });

            csvContent += "\r\n--- MONTHLY SNAPSHOTS ---\r\nDate,Traffic,Calls Booked,Social Audience\r\n";
            metrics.forEach(m => {
                csvContent += `"${new Date(m.date).toLocaleDateString()}","${m.traffic}","${m.calls}","${m.social}"\r\n`;
            });
            
            const blob = new Blob(["\uFEFF", csvContent], { type: 'text/csv;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.style.display = 'none';
            link.href = url;
            link.download = `Analytics_Export_${new Date().toISOString().split('T')[0]}.csv`;
            
            document.body.appendChild(link);
            link.click();
            
            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 500);
        });
    }
}

function renderChart(viewMode) {
    const container = document.getElementById('revenue-chart-container');
    if (!container) return;

    const insights = getRevenueInsights();
    const entries = insights.entries || [];
    const store = getStore();
    const currency = store.settings?.currency || '$';

    if (entries.length === 0) {
        container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--color-text-muted); background: var(--color-bg-main); border-radius: var(--radius-md); height: 100%; display: flex; align-items: center; justify-content: center;">No revenue entries yet.</div>`;
        return;
    }

    const grouped = {};
    entries.forEach(e => {
        const date = new Date(e.date);
        let key = '', label = '';
        if (viewMode === 'week') {
            const start = new Date(date); start.setDate(date.getDate() - date.getDay());
            const end = new Date(start); end.setDate(start.getDate() + 6);
            key = start.toISOString().split('T')[0];
            label = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        } else if (viewMode === 'month') {
            key = `${date.getFullYear()}-${date.getMonth()}`;
            label = date.toLocaleDateString(undefined, { month: 'short' });
        } else {
            const q = Math.floor((date.getMonth() + 3) / 3);
            key = `${date.getFullYear()}-Q${q}`;
            label = `Q${q}`;
        }
        if (!grouped[key]) grouped[key] = { amount: 0, label, date: date.getTime() };
        grouped[key].amount += parseFloat(e.amount) || 0;
    });

    const chartData = Object.values(grouped).sort((a, b) => a.date - b.date);
    const maxAmount = Math.max(...chartData.map(d => d.amount));

    container.innerHTML = `
        <div class="revenue-chart" style="display: flex; gap: 12px; align-items: flex-end; height: 100%; padding-top: 1rem; border-bottom: 1px solid var(--color-border);">
            ${chartData.map(d => {
                const heightPct = maxAmount > 0 ? (d.amount / maxAmount) * 100 : 0;
                return `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; group">
                    <div style="font-size: 0.7rem; color: var(--color-text-muted); margin-bottom: 4px; opacity: 0; transition: opacity 0.2s; white-space: nowrap;" class="chart-tooltip">${currency}${d.amount.toLocaleString()}</div>
                    <div class="chart-bar" style="width: 100%; max-width: 50px; height: ${heightPct}%; background-color: var(--color-secondary); border-radius: 4px 4px 0 0; min-height: 4px; transition: height 0.5s, background-color 0.2s;"></div>
                    <div style="font-size: 0.65rem; color: var(--color-text-muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;">${d.label}</div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}
