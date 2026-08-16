// revenue.js
import { renderNav } from '../components/nav.js';
import { getStore, updateQuickOffers, addRevenueEntry, deleteRevenueEntry, getRevenueInsights, addLeadEntry, deleteLeadEntry, addMetricSnapshot, deleteMetricSnapshot, getLocalDateString, getWeekStart, parseDateInput, formatAmount } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';
import { showToast, showConfirm, rerenderScreen } from '../components/toast.js';
import { proTeaser, proLock } from '../components/proGate.js';
import { canConnectStripe, refreshImportedSales, getImportedSalesCache, fetchStripeConnection, syncStripeSales } from '../stripeImport.js';

// Pipeline list state. Module level so it survives a re-render — delete an entry
// on page 3 of the list and you stay on page 3 instead of being thrown back to
// the top, which is what the old full page reload did.
let pipelineFilter = 'all'; // 'all' | 'sale' | 'lead'
let pipelineLimit = 15;
const PIPELINE_PAGE_SIZE = 15;

// Which logging tab is open. Module level for the same reason as the pipeline
// state above: saving re-renders the screen, and the tab should not move.
let activeLogTab = 'tab-rev';

// How many imported sales this render drew. attachEvents compares the freshly
// fetched count against it and only re-renders when it has changed, which stops
// the refresh-then-rerender pair from looping forever.
let importedCountAtRender = 0;

export function renderRevenue() {
    window.setScreenModule({ attachEvents: revenueAttachEvents });
    const store = getStore();
    const insights = getRevenueInsights();
    importedCountAtRender = getImportedSalesCache().length;
    
    const currency = store.settings?.currency || '$';

    const firstVisitDone = localStorage.getItem('first_revenue_visit_done') === 'true';
    let firstVisitTooltipHtml = '';
    if (!firstVisitDone) {
        firstVisitTooltipHtml = `
            <div id="revenue-first-visit-card" class="card mb-6" style="background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-bg-main) 100%); border-left: 4px solid var(--color-primary); padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; box-shadow: var(--shadow-sm); border-radius: 12px; border: 1px solid var(--color-border);">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="font-size: 2.25rem;">📈</div>
                    <div>
                        <h4 style="margin: 0 0 0.25rem 0; font-size: 1.05rem; color: var(--color-primary-dark); font-weight: 700;">First Visit Guide</h4>
                        <p style="margin: 0; font-size: 0.95rem; color: var(--color-text-main); line-height: 1.5;">
                            This is your command centre. Log your first lead now — it only takes one tap, and watching your pipeline fill up is seriously motivating. Try it ➡️
                        </p>
                    </div>
                </div>
                <button id="btn-close-revenue-tooltip" class="btn btn-sm btn-ghost" style="font-size: 1.25rem; color: var(--color-text-muted); cursor: pointer; align-self: flex-start; padding: 0.25rem 0.5rem; background: none; border: none;">&times;</button>
            </div>
        `;
    }
    
    // Core calculations
    const leads = store.leads?.entries || [];
    const totalLeads = leads.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    const leadGoal = parseFloat(store.leads?.quarterlyGoal) || 0;
    const leadProgressPercent = leadGoal > 0 ? (totalLeads / leadGoal) * 100 : 0;
    
    // Sales logged through this app's own pipeline. Payments imported from Stripe
    // are deliberately excluded from this particular count: it is used below as a
    // stand-in for "how many calls closed", and a subscription renewal that
    // arrived overnight was never a booked call. Counting them sent the close rate
    // to 550% on an account with eight imported sales and two calls.
    const salesCount = (insights.entries || []).filter(e => !e.imported).length;
    const metrics = store.metrics || [];
    
    const snapshotCalls = metrics.reduce((sum, m) => sum + (parseFloat(m.calls) || 0), 0);
    const leadCalls = leads.reduce((sum, l) => sum + (parseFloat(l.calls) || 0), 0);
    const leadCloses = leads.reduce((sum, l) => sum + (parseFloat(l.closes) || 0), 0);
    const totalCalls = snapshotCalls + leadCalls;
    const effectiveCloses = Math.max(salesCount, leadCloses);

    // Has a close ever been recorded, on any lead, at any time?
    //
    // An empty "closes" box is ambiguous: it can mean none of them closed, or it
    // can mean nobody wrote it down. The app cannot tell the two apart, and
    // printing 0% picks the more damaging reading and states it as fact. On a
    // screen someone opens to judge how their business is going, a wrong 0% is
    // worse than a wrong 150%: the broken number makes the app look untrustworthy,
    // the discouraging one makes the person feel it about themselves.
    //
    // So: until at least one close exists anywhere, the close rate reports nothing
    // and asks for the missing input instead. After that, a 0% for a given period
    // is a real zero and is shown as one.
    const anyClosesEverLogged = leads.some(l => (parseFloat(l.closes) || 0) > 0);
    
    // Conversion Rates
    //
    // Every one of these is a proportion of something, so none can exceed 100%.
    // Using the sales count as a stand-in for closes is a kindness to people who
    // log their sales but never fill in the "closes" box — but three sales against
    // two calls then reported a 150% close rate, which is not a flattering number,
    // it is an obviously broken one that makes the whole page look untrustworthy.
    //
    // Capping keeps the convenience without the impossible figure: you cannot
    // close more calls than you booked, or convert more leads than you had.
    const leadToSaleConversion = totalLeads > 0
        ? ((Math.min(effectiveCloses, totalLeads) / totalLeads) * 100).toFixed(1)
        : 0;
    const callBookingRate = totalLeads > 0
        ? ((Math.min(totalCalls, totalLeads) / totalLeads) * 100).toFixed(1)
        : 0;
    // No calls logged means there is no close rate to report. This used to return
    // 100% off a single sale and zero calls, which read as a perfect record.
    //
    // This one counts closes ONLY, never falling back to the sales count. It is
    // the answer to "of the calls I had, how many turned into a sale", and a sale
    // that never involved a call has no business in it. The fallback made the
    // number easier to fill in and impossible to trust: a good month of Instagram
    // sales would push it up without a single extra call being closed.
    //
    // null means "no answer to give", and renders as an em dash rather than a
    // number. Two ways to get there: no calls at all, or calls with no close ever
    // recorded against them. See anyClosesEverLogged above for why the second one
    // is not reported as 0%.
    const callCloseRate = (totalCalls > 0 && anyClosesEverLogged)
        ? ((Math.min(leadCloses, totalCalls) / totalCalls) * 100).toFixed(1)
        : null;
    // Which of the two "no answer" cases we are in, so the card can ask for the
    // thing that is actually missing instead of showing a bare dash.
    const closeRateNeedsCloses = totalCalls > 0 && !anyClosesEverLogged;

    return `
        ${renderNav()}
        <div class="main-content dashboard-layout">
            <div class="flex justify-between items-center mb-6" style="position: relative; z-index: 49;">
                <div>
                    <h2>Revenue & Sales Analytics</h2>
                    <p style="color: var(--color-text-muted);">Monitor your pipeline, conversions, and growth metrics.</p>
                </div>
                <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button id="btn-report-csv" class="btn btn-outline btn-sm" style="display: flex; align-items: center; gap: 0.5rem;">
                            📊 Export CSV
                        </button>
                        ${proLock('pdf-export', '📄 PDF Report')}
                        <button id="btn-report-ai" class="btn btn-primary btn-sm" style="display: flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); border: none; box-shadow: var(--shadow-sm);">
                            🤖 AI Executive Report
                            ${renderTooltip("A comprehensive, AI-generated analysis of your business's financial health, sales pipeline, and growth bottlenecks.", "It synthesizes your traffic, calls, conversions, and revenue into a clear strategy briefing and lists specific, high-priority tasks to help you optimize your funnel.", "bottom")}
                        </button>
                    </div>
                    <div style="background: var(--color-secondary-light); padding: 0.5rem 1rem; border-radius: var(--radius-full); display: flex; align-items: center; gap: 0.5rem; font-weight: 600; color: var(--color-secondary-dark);">
                        Quarter: ${insights.momentum}
                        ${renderTooltip("Your quarterly revenue momentum score, comparing your current pace against your target goal.", "It tells you if you are ahead, on track, behind, or if you need to log more entries ('Not enough data') to compute a realistic projection.", "bottom")}
                    </div>
                </div>
            </div>

            ${firstVisitTooltipHtml}

            <!-- Top Cards -->
            <div class="grid-cols-4 mb-6">
                <div class="card" style="padding: 1.5rem; text-align: center;">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase;">
                        Quarter Revenue Goal
                    </p>
                    <h3 style="font-size: 1.75rem; color: var(--color-black); margin: 0;">${currency}${insights.goal.toLocaleString()}</h3>
                    ${insights.revenueBeforeQuarter > 0 ? `
                    <p style="font-size: 0.7rem; color: var(--color-text-muted); margin: 0.5rem 0 0 0; line-height: 1.35;">
                        Plus ${currency}${insights.revenueBeforeQuarter.toLocaleString(undefined, { maximumFractionDigits: 2 })} logged before this quarter started, kept in your history but not counted towards this goal.
                    </p>` : ''}
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
                    <h3 style="font-size: 1.75rem; color: var(--color-black); margin: 0;">${callCloseRate === null ? '&mdash;' : callCloseRate + '%'}</h3>
                    ${closeRateNeedsCloses ? `
                    <p style="font-size: 0.7rem; color: var(--color-text-muted); margin: 0.5rem 0 0 0; line-height: 1.35;">
                        You've logged calls but no closes yet. Add how many closed when you log a lead and this fills in.
                    </p>
                    ` : ''}
                </div>
            </div>

            <div class="grid-sidebar mb-6">
                
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
                   ${canConnectStripe()
                       // Accounts that actually have the feature get a working
                       // panel here rather than nothing. proTeaser deletes itself
                       // once a feature is live for you, which is right for an
                       // advert but left a hole on the screen where the most
                       // useful control should be. Painted in attachEvents,
                       // because the connection state is an async read.
                       ? `<div id="revenue-stripe-panel" class="card mb-6" style="padding: 1.25rem; font-size: 0.875rem; color: var(--color-text-muted);">Checking Stripe…</div>`
                       : proTeaser(
                           'payment-import',
                           'Never log a sale by hand again',
                           'Connect Stripe once. Every sale appears here the moment it happens. (PayPal coming soon)',
                           null
                       )}

                   <!-- Multi-Form Tabs -->
                   <div class="card" style="border-top: 4px solid var(--color-accent); padding: 1.5rem;">
                       <div class="flex gap-2 mb-4" style="border-bottom: 1px solid var(--color-border); padding-bottom: 0.5rem; flex-wrap: wrap;">
                           <button class="btn btn-ghost btn-sm active" id="tab-rev" style="color: var(--color-primary-dark); font-weight: 600;">💰 Sale</button>
                           <button class="btn btn-ghost btn-sm" id="tab-lead" style="color: var(--color-text-muted);">👥 Leads</button>
                           <button class="btn btn-ghost btn-sm" id="tab-metric" style="color: var(--color-text-muted);">📊 Snapshot</button>
                           <button class="btn btn-ghost btn-sm" id="tab-quick-settings" style="color: var(--color-text-muted);">⚡ 1-Tap</button>
                       </div>

                       <!-- Log Revenue Form -->
                       <div id="rev-tab-wrapper" class="log-form active">
                           ${(store.revenue?.quickOffers && store.revenue.quickOffers.length > 0) ? `
                           <div style="margin-bottom: 1.5rem;">
                               <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                                   <p style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; color: var(--color-text-muted); margin: 0;">⚡ 1-Tap Log Sale</p>
                                   ${renderTooltip("Select your product from the dropdown and click '+ Log' to instantly record a sale without filling the manual form.", "What is this?")}
                               </div>
                               <div style="display: flex; gap: 0.4rem; flex-wrap: nowrap; align-items: stretch;">
                                   <select id="rev-1tap-select" class="form-control" style="flex-grow: 1; font-size: 0.8rem; padding: 0.35rem 0.5rem; height: auto; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background-color: var(--color-bg-light); cursor: pointer; min-width: 0;">
                                       ${store.revenue.quickOffers.map((o, idx) => `<option value="${idx}">${o.name} (${o.price > 0 ? currency + parseFloat(o.price).toLocaleString() : 'Free'})</option>`).join('')}
                                   </select>
                                   <button type="button" class="btn btn-outline btn-1tap-sale-rev-dropdown" style="padding: 0.35rem 0.75rem; font-size: 0.85rem; border-color: var(--color-primary-light); color: var(--color-primary-dark); font-weight: 600; white-space: nowrap; flex-shrink: 0; outline: none; box-shadow: none;">
                                       + Log
                                   </button>
                               </div>
                               <div style="margin: 1rem 0; border-top: 1px dashed var(--color-border); text-align: center; position: relative;">
                                   <span style="background: white; padding: 0 0.5rem; color: var(--color-text-muted); font-size: 0.8rem; position: relative; top: -0.6rem;">OR MANUAL ENTRY</span>
                               </div>
                           </div>
                           ` : ''}
                           <form id="log-revenue-form">
                               <div class="form-group">
                                   <label>Amount Made (${currency})</label>
                               <input type="number" id="log-amount" min="0" step="any" class="form-control" required placeholder="0.00">
                           </div>
                           <div class="form-group">
                                <label>Date Received</label>
                                <input type="date" id="log-date" class="form-control" required value="${getLocalDateString()}">
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
                       </div>

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
                                <input type="date" id="lead-date" class="form-control" required value="${getLocalDateString()}">
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
                                <input type="date" id="metric-date" class="form-control" required value="${getLocalDateString()}">
                           </div>
                           <button type="submit" class="btn btn-outline" style="width: 100%;">Save Snapshot</button>
                       </form>

                       <!-- Quick Offers Settings Form -->
                       <form id="quick-offers-form" class="log-form" style="display: none;">
                          <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 1rem;">Setup your core products for 1-Tap entry on the Dashboard.</p>
                          ${[0,1,2].map(i => {
                              const o = (store.revenue?.quickOffers || [])[i] || {name: '', price: '', source: 'Instagram'};
                              return `
                              <div style="background: var(--color-bg-light); padding: 0.75rem; border-radius: var(--radius-sm); margin-bottom: 0.75rem;">
                                  <label style="font-size: 0.75rem; font-weight: 600; color: var(--color-text-main); display: block; margin-bottom: 0.25rem;">Slot ${i+1}</label>
                                  <input type="text" id="qo-name-${i}" placeholder="Offer Name (e.g. Mastermind)" value="${o.name}" class="form-control" style="margin-bottom: 0.25rem; font-size: 0.8rem;">
                                  <div style="display: flex; gap: 0.5rem;">
                                      <input type="number" id="qo-price-${i}" placeholder="Price" value="${o.price}" class="form-control" style="font-size: 0.8rem;" step="any">
                                      <input type="text" id="qo-source-${i}" placeholder="Default Source" value="${o.source}" class="form-control" style="font-size: 0.8rem;">
                                  </div>
                              </div>
                              `;
                          }).join('')}
                          ${proTeaser(
                              'unlimited-offers',
                              'Room for every offer you sell',
                              'Three slots is the base limit. Pro lifts it, so today\'s sale is always one tap away.'
                          )}
                          <button type="submit" class="btn btn-outline" style="width: 100%; border-color: var(--color-accent); color: var(--color-accent-dark);">Save Quick Actions</button>
                       </form>
                   </div>
                   
                   <!-- Pipeline Visuals / Recent Entities -->
                   <div class="card mt-6">
                       <div class="flex justify-between items-center mb-4 flex-mobile-col" style="gap: 0.75rem;">
                           <h3 style="margin: 0;">Recent Pipeline Events</h3>
                           <div style="display: flex; gap: 0.25rem; background: var(--color-bg-main); padding: 0.25rem; border-radius: var(--radius-full);">
                               ${[['all', 'All'], ['sale', 'Sales'], ['lead', 'Leads']].map(([value, label]) => `
                                   <button type="button" class="btn btn-sm btn-pipeline-filter" data-filter="${value}" style="padding: 0.25rem 0.75rem; font-size: 0.8rem; border-radius: var(--radius-full); ${pipelineFilter === value ? 'background: var(--color-white); color: var(--color-primary-dark); font-weight: 600; box-shadow: var(--shadow-sm);' : 'background: transparent; color: var(--color-text-muted);'}">${label}</button>
                               `).join('')}
                           </div>
                       </div>
                       ${renderPipelineEvents(insights.entries, leads, currency)}
                       ${proTeaser(
                           'lead-pipeline',
                           'Know exactly who to follow up today',
                           'Track leads by name through booked, proposal and won, and see who has gone quiet.'
                       )}
                   </div>

                </div>
            </div>

            <!-- AI Report Modal -->
            <div id="ai-report-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999; align-items: center; justify-content: center; padding: 2rem;">
                <div class="card" style="width: 100%; max-width: 800px; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; position: relative;">
                    <div class="flex justify-between items-center mb-4 pb-4" style="border-bottom: 1px solid var(--color-border);">
                        <h2 style="margin:0;">Executive Summary</h2>
                        <div style="display: flex; gap: 1rem; align-items: center;">
                            <button id="btn-download-ai-report" class="btn btn-outline btn-sm" style="display: none; align-items: center; gap: 0.5rem;">⬇️ Download (.txt)</button>
                            <button id="btn-close-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--color-text-muted);">&times;</button>
                        </div>
                    </div>
                    <div id="ai-report-content" class="custom-scroll" style="padding: 1rem; min-height: 200px;">
                        <div style="text-align: center; padding: 3rem 0;">
                            <div class="spinner" style="margin: 0 auto 1rem auto; width: 40px; height: 40px; border: 4px solid var(--color-bg-light); border-top: 4px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                            <h3 style="color: var(--color-text-main);">Analyzing Pipeline Data...</h3>
                            <p style="color: var(--color-text-muted);">The Executive AI Coach is reviewing your revenue, leads, and conversions.</p>
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

// The pipeline feed: sales and leads on one timeline, filtered and paged.
// Sale-vs-lead used to be inferred from whether an entry happened to have an
// 'offer' key, which quietly filed any sale logged without an offer name under
// leads. Entries now carry an explicit type; the `|| ` fallbacks cover a store
// object read before the migration in getStore() has run.
function renderPipelineEvents(entries, leads, currency) {
    const events = [
        ...(entries || []).map(e => ({ ...e, type: e.type || 'sale' })),
        ...(leads || []).map(e => ({ ...e, type: e.type || 'lead' }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const filtered = pipelineFilter === 'all' ? events : events.filter(e => e.type === pipelineFilter);
    const visible = filtered.slice(0, pipelineLimit);
    const remaining = filtered.length - visible.length;

    if (filtered.length === 0) {
        const emptyCopy = events.length === 0
            ? 'No pipeline events logged.'
            : (pipelineFilter === 'sale' ? 'No sales logged yet.' : 'No leads logged yet.');
        return `<p style="font-size: 0.9rem; color: var(--color-text-muted);">${emptyCopy}</p>`;
    }

    const rows = visible.map(e => {
        if (e.type === 'sale') {
            // Imported sales are owned by Stripe, not by the store. The bin icon
            // deletes by id from store.revenue.entries, and an imported id ("stripe:…")
            // is not in there — the button would do nothing at all. Showing a
            // control that silently fails is worse than not showing it, so
            // imported rows get a quiet label instead.
            const displayAmount = e.refunded && e.grossAmount != null ? e.grossAmount : e.amount;
            const badge = e.imported
                ? `<span style="font-size: 0.7rem; font-weight: 600; color: var(--color-primary-dark); background: var(--color-primary-light); padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.4rem; vertical-align: middle;">STRIPE</span>`
                : '';
            const refundNote = e.refunded
                ? `<span style="font-size: 0.7rem; font-weight: 600; color: #B42318; background: #FEF3F2; padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.4rem; vertical-align: middle;">REFUNDED</span>`
                : '';
            const duplicateNote = e.possibleDuplicate
                ? `<div style="font-size: 0.75rem; color: #B54708; margin-top: 0.25rem;">Possibly the same sale you logged by hand. Both are shown, and both are counted.</div>`
                : '';

            return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border);">
                    <div>
                        <span style="font-weight: 600; color: var(--color-black); display: block;">
                            <span style="${e.refunded ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${currency}${formatAmount(displayAmount)}</span>${badge}${refundNote}
                        </span>
                        <span style="font-size: 0.8rem; color: var(--color-text-muted);">SALE • ${new Date(e.date).toLocaleDateString()}${e.source ? ' • ' + e.source : ''}${e.offer ? ' • ' + e.offer : ''}</span>
                        ${duplicateNote}
                    </div>
                    ${e.imported
                        ? `<span title="Imported from Stripe. Manage it in Stripe, or disconnect on the Account screen." style="font-size: 0.75rem; color: var(--color-text-muted); padding: 0.25rem; white-space: nowrap;">auto</span>`
                        : `<button type="button" class="btn btn-ghost btn-sm btn-delete-revenue" data-id="${e.id}" style="padding: 0.25rem; color: var(--color-text-muted);">🗑️</button>`}
                </div>
            `;
        }
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border);">
                <div>
                    <span style="font-weight: 600; color: var(--color-secondary-dark); display: block;">+${parseFloat(e.amount).toLocaleString()} Leads</span>
                    <span style="font-size: 0.8rem; color: var(--color-text-muted);">LEADS • ${new Date(e.date).toLocaleDateString()}${e.source ? ' • ' + e.source : ''}</span>
                    ${(e.calls > 0 || e.closes > 0) ? `<div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 0.25rem;">📞 ${e.calls || 0} Calls &nbsp;&nbsp; 💰 ${e.closes || 0} Closes</div>` : ''}
                </div>
                <button type="button" class="btn btn-ghost btn-sm btn-delete-lead" data-id="${e.id}" style="padding: 0.25rem; color: var(--color-text-muted);">🗑️</button>
            </div>
        `;
    }).join('');

    return `
        <div style="display:flex; flex-direction: column; gap: 0.75rem; max-height: 400px; overflow-y: auto;" class="custom-scroll">
            ${rows}
        </div>
        <div class="flex justify-between items-center mt-4" style="font-size: 0.8rem; color: var(--color-text-muted);">
            <span>Showing ${visible.length} of ${filtered.length}</span>
            ${remaining > 0
                ? `<button type="button" id="btn-pipeline-more" class="btn btn-outline btn-sm" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;">Show ${Math.min(remaining, PIPELINE_PAGE_SIZE)} more</button>`
                : (filtered.length > PIPELINE_PAGE_SIZE ? `<button type="button" id="btn-pipeline-less" class="btn btn-ghost btn-sm" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;">Show less</button>` : '')}
        </div>
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

window.generateAiReport = async function() {
    const aiModal = document.getElementById('ai-report-modal');
    const aiContent = document.getElementById('ai-report-content');
    if (!aiModal || !aiContent) return;

    // Close the dropdown menu
    const menu = document.getElementById('report-dropdown-menu');
    if (menu) menu.style.display = 'none';

    const btnDownload = document.getElementById('btn-download-ai-report');
    if (btnDownload) btnDownload.style.display = 'none';

    aiModal.style.display = 'flex';
    aiContent.innerHTML = `
        <div style="text-align: center; padding: 3rem 0;">
            <div class="spinner" style="margin: 0 auto 1rem auto; width: 40px; height: 40px; border: 4px solid var(--color-bg-light); border-top: 4px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <h3 style="color: var(--color-text-main);">Evaluating Pipeline Data...</h3>
            <p style="color: var(--color-text-muted);">The Executive AI Coach is drafting your strategic briefing.</p>
        </div>
    `;

    try {
        const store = window.currentScreenModuleStore || JSON.parse(localStorage.getItem('ceoPlanner_store') || '{}');
        const insights = getRevenueInsights();
        const currency = store.settings?.currency || '$';
        const leads = store.leads?.entries || [];
        const metrics = store.metrics || [];
        
        // Tone deliberately matches the 90-day plan prompt in aiService.js. Asking
        // for "brutally honest" produced reports calling a week-one founder's
        // numbers "abysmal" and "a failure", which is not what this audience is
        // paying for and is a fast route to a cancelled subscription.
        // Currency must be stated: without it the model defaults to $ and a UK
        // user who set £ gets their own figures back in dollars.
        let prompt = `Analyze this business revenue data and provide a clear, honest Executive Summary.

        Tone: direct and specific, warm rather than harsh. Name problems plainly and
        without euphemism, but never insult the reader or their results. They are a
        founder doing their best with limited time. If the numbers are early or thin,
        say so as context rather than as failure.

        Currency: all money figures below are in ${currency}. Use the ${currency}
        symbol throughout your report and never substitute another currency.

        Formatting: Use markdown. Break the report into 3 sections:
        1. 📊 The Data Snapshot (Summarize the numbers clearly)
        2. 🔍 The Funnel Diagnosis (Where is the bottleneck? Are they failing to capture leads, book calls, or close sales?)
        3. ⚡ Immediate Directive (Exactly what they must do this week to fix the primary bottleneck)

        Data:
        Business stage: ${store.profile?.stage || 'not stated'}
        Weeks elapsed in this 90-day quarter: ${insights.weeksElapsed} of 12
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
            body: { messages: [{ role: 'user', content: prompt }] },
        });

        if (error) throw new Error(await window.readFunctionError(error));
        if (data.error) throw new Error(data.error.message || data.error);

        const reportText = data.choices[0].message.content;
        aiContent.innerHTML = window.marked.parse(reportText);
        
        // Enable download button
        if (btnDownload) {
            btnDownload.style.display = 'flex';
            btnDownload.onclick = () => {
                const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `AI_Executive_Report_${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                }, 500);
            };
        }

    } catch(e) {
        aiContent.innerHTML = `<p style="color: var(--color-error); text-align: center;">Warning: The Executive AI Coach failed to analyze the data. Error: ${e.message}</p>`;
    }
};

window.closeAiModal = function() {
    const aiModal = document.getElementById('ai-report-modal');
    if (aiModal) aiModal.style.display = 'none';
};

// Document click listener removed

// The Stripe panel in the Revenue sidebar, for accounts that have the import.
//
// This replaces the teaser strip, which deletes itself once a feature is live for
// you. That is correct for an advert and wrong for the slot: the moment Stripe
// starts working is the moment you want a button to pull new sales in, not an
// empty gap where the explanation used to be.
async function paintRevenueStripePanel() {
    const host = document.getElementById('revenue-stripe-panel');
    if (!host) return;

    const conn = await fetchStripeConnection();

    if (!conn) {
        host.innerHTML = `
            <p style="margin: 0 0 0.75rem 0; font-weight: 600; color: var(--color-black);">Stop logging sales by hand</p>
            <p style="margin: 0 0 1rem 0; line-height: 1.5;">Connect Stripe once and your sales appear here on their own.</p>
            <a href="#/account" class="btn btn-outline btn-sm" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Connect Stripe →</a>
        `;
        return;
    }

    const count = getImportedSalesCache().length;
    const lastSynced = conn.last_synced_at
        ? new Date(conn.last_synced_at).toLocaleDateString()
        : 'not yet';

    host.innerHTML = `
        <p style="margin: 0 0 0.5rem 0; font-weight: 600; color: var(--color-black);">Stripe connected</p>
        <p style="margin: 0 0 1rem 0; line-height: 1.5;">
            ${count} ${count === 1 ? 'sale' : 'sales'} imported. Last checked ${lastSynced}.
        </p>
        ${conn.last_sync_error ? `<p style="margin: 0 0 1rem 0; color: #B42318;">Last attempt failed: ${conn.last_sync_error}</p>` : ''}
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
            <button type="button" id="btn-revenue-stripe-sync" class="btn btn-outline btn-sm" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Import sales now</button>
            <a href="#/account" style="font-size: 0.8rem; color: var(--color-text-muted); text-decoration: underline;">Manage</a>
        </div>
    `;

    document.getElementById('btn-revenue-stripe-sync')?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Importing…';
        const result = await syncStripeSales();
        if (result.error) {
            showToast(result.error, 'error');
            paintRevenueStripePanel();
            return;
        }
        if (!result.imported) {
            showToast('Up to date, nothing new to import.', 'success');
            paintRevenueStripePanel();
            return;
        }
        const sales = `${result.imported} ${result.imported === 1 ? 'sale' : 'sales'}`;
        showToast(`Imported ${sales} from Stripe.`, 'success');
        // New sales change every figure on this screen, so re-read them and
        // repaint the whole thing rather than only this corner of it.
        await refreshImportedSales();
        rerenderScreen();
    });
}

function revenueAttachEvents() {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-revenue')?.classList.add('active');

    // Pull imported Stripe sales into the in-memory cache, then re-render once so
    // the figures include them. The first paint of this screen uses whatever was
    // already cached, which is why the totals do not flicker on later visits.
    //
    // Only re-render when the count actually changes, otherwise this would loop:
    // rerenderScreen fires hashchange, which runs attachEvents, which lands here.
    refreshImportedSales().then(sales => {
        if (sales.length !== importedCountAtRender) rerenderScreen();
        else paintRevenueStripePanel();
    }).catch(() => { /* decoration on top of the user's own data, never fatal */ });

    const closeTooltipBtn = document.getElementById('btn-close-revenue-tooltip');
    if (closeTooltipBtn) {
        closeTooltipBtn.addEventListener('click', () => {
            localStorage.setItem('first_revenue_visit_done', 'true');
            const card = document.getElementById('revenue-first-visit-card');
            if (card) card.style.display = 'none';
        });
    }

    const toggleTabs = [
        { id: 'tab-rev', formId: 'rev-tab-wrapper' },
        { id: 'tab-lead', formId: 'log-leads-form' },
        { id: 'tab-metric', formId: 'log-metric-form' },
        { id: 'tab-quick-settings', formId: 'quick-offers-form' }
    ];

    // Show whichever tab the user was last on. Saving a lead re-renders the screen,
    // which used to drop them back on the Sale form — so logging three lead batches
    // in a row meant re-selecting the Leads tab every single time.
    const activateTab = (tabId) => {
        const target = toggleTabs.find(t => t.id === tabId) || toggleTabs[0];
        toggleTabs.forEach(tab => {
            const btn = document.getElementById(tab.id);
            const form = document.getElementById(tab.formId);
            if (!btn || !form) return;
            const isActive = tab.id === target.id;
            btn.style.color = isActive ? 'var(--color-primary-dark)' : 'var(--color-text-muted)';
            btn.style.fontWeight = isActive ? '600' : 'normal';
            form.style.display = isActive ? 'block' : 'none';
        });
    };

    toggleTabs.forEach(t => {
        document.getElementById(t.id)?.addEventListener('click', (e) => {
            activeLogTab = t.id;
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

    // Restore the tab the user was on before the last save re-rendered the screen
    activateTab(activeLogTab);

    const logRevForm = document.getElementById('log-revenue-form');
    if (logRevForm) {
        logRevForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const amount = parseFloat(document.getElementById('log-amount').value);
            addRevenueEntry({
                amount,
                source: document.getElementById('log-source').value,
                offer: document.getElementById('log-offer').value,
                date: parseDateInput(document.getElementById('log-date').value).toISOString()
            });
            const currency = getStore().settings?.currency || '$';
            showToast(`Sale logged: ${currency}${formatAmount(amount)}`);
            rerenderScreen();
        });
    }

    document.querySelector('.btn-1tap-sale-rev-dropdown')?.addEventListener('click', (e) => {
        const select = document.getElementById('rev-1tap-select');
        if (!select) return;
        const idx = select.value;
        const btn = e.currentTarget;
        const store = getStore();
        const offerConf = store.revenue?.quickOffers?.[idx];
        
        if (offerConf) {
            btn.innerHTML = '✅ Logged!';
            btn.style.backgroundColor = '#E1FDF4';
            btn.style.color = '#027A48';
            btn.style.borderColor = '#027A48';
            addRevenueEntry({
                amount: parseFloat(offerConf.price) || 0,
                source: offerConf.source || 'Revenue Page 1-Tap',
                offer: offerConf.name,
                date: new Date().toISOString(),
                notes: '1-Tap entry'
            });
            const currency = store.settings?.currency || '$';
            showToast(`Sale logged: ${currency}${formatAmount(offerConf.price)}`);
            setTimeout(() => { rerenderScreen(); }, 600);
        }
    });

    const logLeadForm = document.getElementById('log-leads-form');
    if (logLeadForm) {
        logLeadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const leadCount = parseFloat(document.getElementById('lead-amount').value);
            addLeadEntry({
                amount: leadCount,
                calls: parseFloat(document.getElementById('lead-calls').value) || 0,
                closes: parseFloat(document.getElementById('lead-closes').value) || 0,
                source: document.getElementById('lead-source').value,
                date: parseDateInput(document.getElementById('lead-date').value).toISOString()
            });
            showToast(`${leadCount.toLocaleString()} lead${leadCount === 1 ? '' : 's'} logged`);
            rerenderScreen();
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
                date: parseDateInput(document.getElementById('metric-date').value).toISOString()
            });
            showToast('Snapshot saved');
            rerenderScreen();
        });
    }

    const quickOffersForm = document.getElementById('quick-offers-form');
    if (quickOffersForm) {
        quickOffersForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const offers = [];
            for (let i = 0; i < 3; i++) {
                const name = document.getElementById(`qo-name-${i}`).value.trim();
                const price = document.getElementById(`qo-price-${i}`).value;
                const source = document.getElementById(`qo-source-${i}`).value.trim();
                if (name) {
                    offers.push({ name, price, source });
                }
            }
            updateQuickOffers(offers);
            showToast('1-Tap offers saved. They are ready on your Dashboard.');
            rerenderScreen();
        });
    }

    // One handler shape for all three deletions: confirm, delete, tell them, redraw.
    const bindDelete = (selector, deleteFn, question, successMessage) => {
        document.querySelectorAll(selector).forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const ok = await showConfirm(question, { title: 'Delete entry', confirmText: 'Delete', danger: true });
                if (!ok) return;
                if (deleteFn(id)) {
                    showToast(successMessage);
                    rerenderScreen();
                } else {
                    showToast("That entry couldn't be deleted. Please refresh and try again.", 'error');
                }
            });
        });
    };

    bindDelete('.btn-delete-revenue', deleteRevenueEntry, 'This removes the sale from your revenue totals and charts.', 'Sale deleted');
    bindDelete('.btn-delete-lead', deleteLeadEntry, 'This removes the leads from your pipeline totals.', 'Lead entry deleted');
    bindDelete('.btn-delete-metric', deleteMetricSnapshot, 'This removes the snapshot from your traffic and conversion figures.', 'Snapshot deleted');

    // Pipeline feed: filter and paging
    document.querySelectorAll('.btn-pipeline-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            pipelineFilter = e.currentTarget.getAttribute('data-filter');
            pipelineLimit = PIPELINE_PAGE_SIZE; // a new filter starts at the top
            rerenderScreen();
        });
    });

    document.getElementById('btn-pipeline-more')?.addEventListener('click', () => {
        pipelineLimit += PIPELINE_PAGE_SIZE;
        rerenderScreen();
    });

    document.getElementById('btn-pipeline-less')?.addEventListener('click', () => {
        pipelineLimit = PIPELINE_PAGE_SIZE;
        rerenderScreen();
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

    // AI Report Generation
    const btnReportAi = document.getElementById('btn-report-ai');
    if (btnReportAi) {
        btnReportAi.addEventListener('click', () => {
            if (window.generateAiReport) {
                window.generateAiReport();
            }
        });
    }

    // Close AI Modal
    const btnCloseModal = document.getElementById('btn-close-modal');
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            if (window.closeAiModal) {
                window.closeAiModal();
            }
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
            const currency = store.settings?.currency || '$';
            const quarterStart = store.quarterStartDate ? new Date(store.quarterStartDate) : null;

            // One table rather than three stacked sections. Sections meant the file
            // could not be sorted, filtered or pivoted without cutting it up first,
            // which defeats the point of exporting to a spreadsheet at all.
            //
            // Deliberately no totals row: it would sit inside the data and break
            // sorting and pivot tables. Spreadsheets can sum a column themselves.
            const cell = (v) => {
                if (v === null || v === undefined) return '';
                const s = String(v);
                return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            const row = (arr) => arr.map(cell).join(',') + '\r\n';

            // ISO dates: toLocaleDateString() emits d/m/y, which Excel misreads as
            // m/d/y on a US locale and silently mangles every date past the 12th.
            const isoDate = (d) => getLocalDateString(new Date(d));

            const inQuarter = (d) => quarterStart
                ? (new Date(d).getTime() >= quarterStart.getTime() ? 'Yes' : 'No')
                : '';

            let csvContent = row([
                'Type', 'Date', 'Amount', 'Currency', 'Source', 'Offer',
                'Calls', 'Closes', 'Traffic', 'Social Audience',
                'Counts Toward This Quarter', 'Notes'
            ]);

            entries.forEach(e => {
                csvContent += row([
                    'Sale', isoDate(e.date), parseFloat(e.amount) || 0, currency,
                    e.source || '', e.offer || '', '', '', '', '',
                    inQuarter(e.date), e.notes || ''
                ]);
            });

            leads.forEach(e => {
                csvContent += row([
                    'Lead', isoDate(e.date), parseFloat(e.amount) || 0, '',
                    e.source || '', '', e.calls || 0, e.closes || 0, '', '',
                    inQuarter(e.date), e.notes || ''
                ]);
            });

            metrics.forEach(m => {
                csvContent += row([
                    'Snapshot', isoDate(m.date), '', '', '', '',
                    m.calls || 0, '', m.traffic || 0, m.social || 0,
                    inQuarter(m.date), ''
                ]);
            });

            try {
                const blob = new Blob(["\uFEFF", csvContent], { type: 'text/csv;charset=utf-8' });
                // Fallback to data URI if blob fails
                const url = window.URL ? window.URL.createObjectURL(blob) : 'data:text/csv;charset=utf-8,' + encodeURIComponent("\uFEFF" + csvContent);
                const link = document.createElement('a');
                link.style.display = 'none';
                link.href = url;
                const bizSlug = (store.profile?.businessName || 'CEO-Planner')
                    .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);
                link.download = `${bizSlug}_Revenue_${getLocalDateString()}.csv`;
                
                document.body.appendChild(link);
                link.click();
                
                setTimeout(() => {
                    document.body.removeChild(link);
                    if (window.URL) window.URL.revokeObjectURL(url);
                }, 500);
            } catch (err) {
                console.error("CSV Download Error:", err);
                showToast("We couldn't download the CSV. Opening it in a new tab instead.", 'error');
                
                // Absolute fallback for highly restrictive browsers
                window.open('data:text/csv;charset=utf-8,' + encodeURIComponent("\uFEFF" + csvContent));
            }
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
            const start = getWeekStart(date);
            const end = new Date(start); end.setDate(start.getDate() + 6);
            key = getLocalDateString(start);
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
                    <div style="font-size: 0.75rem; font-weight: 600; color: var(--color-black); margin-bottom: 4px; white-space: nowrap;">${currency}${d.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div class="chart-bar" style="width: 100%; max-width: 50px; height: ${heightPct}%; background-color: var(--color-secondary); border-radius: 4px 4px 0 0; min-height: 4px; transition: height 0.5s, background-color 0.2s;"></div>
                    <div style="font-size: 0.65rem; font-weight: 600; color: var(--color-text-muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;">${d.label}</div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}
