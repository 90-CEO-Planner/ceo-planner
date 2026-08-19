// revenue.js
import { renderNav } from '../components/nav.js';
import { getStore, updateQuickOffers, addRevenueEntry, deleteRevenueEntry, getRevenueInsights, getFunnelInsights, getPipelineInsights, PIPELINE_STAGES, PIPELINE_PROBABILITIES, CONTACT_SOURCES, getChannelFunnel, NOT_ATTRIBUTED, addLeadEntry, deleteLeadEntry, addMetricSnapshot, deleteMetricSnapshot, getLocalDateString, getWeekStart, parseDateInput, formatAmount } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';
import { showToast, showConfirm, rerenderScreen } from '../components/toast.js';
import { proTeaser, proLock, proCardHeading, proBadge, PRO_CARD_HEADING_STYLE, canUseLeadPipeline, canExportPdf, canUseUnlimitedOffers, QUICK_OFFER_BASE_LIMIT, IMPORT_SOURCES_LABEL, IMPORT_SOON_NOTE } from '../components/proGate.js';
import { escapeText } from '../liveAI.js';
import { showPdfReportModal, rememberAiReport } from '../components/pdfReport.js';
import { canConnectStripe, fetchStripeConnection, syncStripeSales } from '../stripeImport.js';
import { canConnectPayPal, fetchPayPalConnection, syncPayPalSales } from '../paypalImport.js';
import { refreshImportedSales, getImportedSalesCache } from '../importedSales.js';

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

// How many 1-Tap offer slots the form is currently showing. Set by the render
// from what is saved, then grown by the "Add another offer" button on Pro.
//
// The render is authoritative rather than this variable: an empty slot somebody
// added and never filled disappears on the next re-render, which is the
// predictable behaviour. The button itself does NOT re-render — it appends one
// slot to the DOM, because rebuilding the form would wipe whatever is typed in
// the other slots and not yet saved.
let quickOfferSlots = QUICK_OFFER_BASE_LIMIT;

// One slot, used by both the render and the Add button so the two cannot drift.
// Fields are found by class rather than by an indexed id: appending a slot must
// not depend on the indexes still lining up.
function renderQuickOfferSlot(index, offer) {
    const o = offer || { name: '', price: '', source: 'Instagram' };
    return `
        <div data-offer-slot style="background: var(--color-bg-light); padding: 0.75rem; border-radius: var(--radius-sm); margin-bottom: 0.75rem;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--color-text-main); display: block; margin-bottom: 0.25rem;">Slot ${index + 1}</label>
            <input type="text" class="form-control qo-name" placeholder="Offer Name (e.g. Mastermind)" value="${escapeText(o.name)}" style="margin-bottom: 0.25rem; font-size: 0.8rem;">
            <div style="display: flex; gap: 0.5rem;">
                <input type="number" class="form-control qo-price" placeholder="Price" value="${escapeText(o.price)}" style="font-size: 0.8rem;" step="any">
                <input type="text" class="form-control qo-source" placeholder="Default Source" value="${escapeText(o.source)}" style="font-size: 0.8rem;">
            </div>
        </div>
    `;
}

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

    // How many sales the revenue goal actually asks for, at the three horizons a
    // founder plans against. Every figure comes from getRevenueInsights so this
    // card can never disagree with the goal and progress shown above it.
    //
    // The whole thing hangs on an average offer price. Without one the numbers
    // are all zero, so the card explains what is missing and where to set it
    // rather than announcing that she needs to make no sales at all.
    let salesTargetCardHtml = '';
    if (insights.goal > 0) {
        salesTargetCardHtml = insights.hasOfferPrice
            ? `
            <div class="card mb-6" style="padding: 1.5rem 2rem;">
                <div class="flex justify-between items-center mb-4" style="flex-wrap: wrap; gap: 0.5rem;">
                    <h3 style="margin: 0; display: flex; align-items: center;">
                        Sales You Need
                        ${renderTooltip(
                            `How many sales it takes to reach your ${currency}${insights.goal.toLocaleString()} quarter goal, at your average offer price of ${currency}${insights.averageOfferPrice.toLocaleString()}.`,
                            'A revenue goal is hard to act on. A number of sales is not. Each figure is rounded up, so hitting it always clears the target rather than landing just under.'
                        )}
                    </h3>
                    <p style="margin: 0; font-size: 0.8rem; color: var(--color-text-muted);">
                        Based on ${currency}${insights.averageOfferPrice.toLocaleString()} per sale
                    </p>
                </div>

                <!-- Deliberately not .grid-cols-3: that collapses to a single
                     column on mobile, which turns three short numbers into three
                     tall stacked blocks. They are small enough to stay side by
                     side at every width. -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
                    <div style="text-align: center; padding: 1rem; background: var(--color-bg-light); border-radius: 10px;">
                        <p style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; margin: 0 0 0.35rem 0; text-transform: uppercase;">Per Week</p>
                        <h3 style="font-size: 2rem; color: var(--color-primary-dark); margin: 0;">${insights.salesRequiredPerWeek}</h3>
                    </div>
                    <div style="text-align: center; padding: 1rem; background: var(--color-bg-light); border-radius: 10px;">
                        <p style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; margin: 0 0 0.35rem 0; text-transform: uppercase;">Per Month</p>
                        <h3 style="font-size: 2rem; color: var(--color-primary-dark); margin: 0;">${insights.salesRequiredPerMonth}</h3>
                    </div>
                    <div style="text-align: center; padding: 1rem; background: var(--color-bg-light); border-radius: 10px;">
                        <p style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; margin: 0 0 0.35rem 0; text-transform: uppercase;">This Quarter</p>
                        <h3 style="font-size: 2rem; color: var(--color-primary-dark); margin: 0;">${insights.salesRequired}</h3>
                    </div>
                </div>

                <p style="margin: 1rem 0 0 0; font-size: 0.9rem; color: var(--color-text-main); text-align: center; line-height: 1.5;">
                    ${insights.salesRemaining === 0
                        ? `You've covered all ${insights.salesRequired} sales for this quarter. Everything from here is ahead of target.`
                        : `${insights.salesMade} of ${insights.salesRequired} covered so far, <strong>${insights.salesRemaining} to go</strong> with ${insights.weeksRemaining} ${insights.weeksRemaining === 1 ? 'week' : 'weeks'} left.`}
                </p>
            </div>
            `
            : `
            <div class="card mb-6" style="padding: 1.5rem 2rem; border-left: 4px solid var(--color-accent);">
                <h3 style="margin: 0 0 0.5rem 0;">Sales You Need</h3>
                <p style="margin: 0; font-size: 0.9rem; color: var(--color-text-main); line-height: 1.5;">
                    Set your average offer price in <a href="#/settings" style="color: var(--color-primary-dark); font-weight: 600;">Settings</a>
                    and this will show how many sales a week, a month and a quarter it takes to reach your
                    ${currency}${insights.goal.toLocaleString()} goal.
                </p>
            </div>
            `;
    }

    // Calls and closes both arrive from three places now: leads logged in bulk,
    // monthly snapshots, and the named pipeline. That sum lives in
    // getFunnelInsights rather than here, so this screen, the pipeline screen,
    // the AI Coach and the executive report cannot drift apart — which they had:
    // the Coach was still dividing total sales by total calls and quoting
    // impossible close rates long after this screen had been corrected.
    //
    // ⚠️ Read totals from `funnel`. Do not re-sum store.leads.entries here — that
    // is what this line used to do, and it is why the lead count on this page
    // would have ignored the pipeline entirely.
    const funnel = getFunnelInsights();
    const { totalCalls, totalCloses, anyClosesEverLogged, totalLeads } = funnel;

    // Core calculations
    const leads = store.leads?.entries || [];
    const leadGoal = parseFloat(store.leads?.quarterlyGoal) || 0;
    const leadProgressPercent = leadGoal > 0 ? (totalLeads / leadGoal) * 100 : 0;

    // Shown wherever the lead count is, but only once both sources are in play.
    // "62 leads" is confusing when you remember typing 50; "50 logged in bulk,
    // 12 named contacts" is not.
    const leadSplitNote = (funnel.contactLeads > 0 && funnel.bulkLeads > 0)
        ? `${funnel.bulkLeads.toLocaleString()} logged in bulk, ${funnel.contactLeads.toLocaleString()} named ${funnel.contactLeads === 1 ? 'contact' : 'contacts'}`
        : '';

    // Sales logged through this app's own pipeline. Payments imported from Stripe
    // are deliberately excluded from this particular count: it is used below as a
    // stand-in for "how many calls closed", and a subscription renewal that
    // arrived overnight was never a booked call. Counting them sent the close rate
    // to 550% on an account with eight imported sales and two calls.
    const salesCount = (insights.entries || []).filter(e => !e.imported).length;
    const metrics = store.metrics || [];
    
    const effectiveCloses = Math.max(salesCount, totalCloses);

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
    // recorded against them. getFunnelInsights decides which, so the Coach reaches
    // the same conclusion from the same data.
    const callCloseRate = funnel.callCloseRate === null
        ? null
        : funnel.callCloseRate.toFixed(1);
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
                        ${canExportPdf() ? `
                        <button id="btn-report-pdf" class="btn btn-outline btn-sm" style="display: flex; align-items: center; gap: 0.5rem;">
                            ${proBadge()}
                            📄 PDF Report
                            ${renderTooltip("Your quarter laid out as a branded report: your logo, your numbers, the weekly chart, where the revenue came from and what is still open in your pipeline.", "It opens as a preview you can print — choose 'Save as PDF' as the destination to keep a copy. Generate the AI Executive Report first and its write-up is included.", "bottom")}
                        </button>
                        ` : proLock('pdf-export', '📄 PDF Report')}
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
                    ${leadSplitNote ? `
                    <p style="font-size: 0.7rem; color: var(--color-text-muted); margin: 0.5rem 0 0 0; line-height: 1.35;">${leadSplitNote}</p>` : ''}
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

            ${salesTargetCardHtml}

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
                           <div class="flex justify-between" style="font-size: 0.8rem; color: var(--color-text-muted); gap: 1rem; flex-wrap: wrap;">
                               <span>${totalLeads.toLocaleString()} / ${leadGoal.toLocaleString()} leads</span>
                               ${leadSplitNote ? `<span>${leadSplitNote}</span>` : ''}
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
                            <h3 class="mb-0">Monthly Funnel</h3>
                            ${renderTooltip(
                                "Where people fall out on the way to buying from you. Plenty of website visitors but almost no calls means the problem is your site or your offer, not your selling. Plenty of calls but few closes means the opposite. Knowing which it is saves you fixing the wrong thing for a month.",
                                "Once a month, open the Snapshot tab on the right and log your website visitors, calls booked and how many closed. Turn on the monthly reminder in Settings if you would rather not remember. For a written breakdown of what these numbers mean and what to do next, press AI Executive Report at the top of this page.",
                                "bottom",
                                { what: 'What this answers', why: 'How to use it' }
                            )}
                        </div>
                        ${renderSnapshotFunnel(metrics, insights.entries, currency)}
                   </div>

                   <!-- Which channel earns -->
                   <div class="card mt-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="mb-0">Which Channel Earns</h3>
                            ${renderTooltip(
                                "Which of your channels actually turns into money, rather than which one is loudest. A channel with fewer leads that closes most of them is usually worth more of your week than a busy one that rarely converts.",
                                "Nothing extra to log. It builds from the Source you pick when logging a sale and the Lead Source you type when logging leads, so the more consistently you name them, the sharper this gets. Not attributed holds imported payments and anything logged without a source.",
                                "bottom",
                                { what: 'What this answers', why: 'How to use it' }
                            )}
                        </div>
                        ${renderChannelFunnel(currency)}
                   </div>

                   <!-- Which offer sells -->
                   <div class="card mt-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="mb-0">Which Offer Sells</h3>
                            ${renderTooltip(
                                "Which of your offers is actually bringing the money in this month, so you can see what people want rather than what you assumed they wanted.",
                                "Built from the Offer Name you enter when logging a sale, so name your offers consistently to keep this clean. It shows this month only, which is what makes it different from Which Channel Earns — that one compares where people came from, over all time.",
                                "bottom",
                                { what: 'What this answers', why: 'How to use it' }
                            )}
                        </div>
                        ${renderPieChart(insights.revenueByOfferMonth || {}, currency)}
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
                       ? `<div id="revenue-import-panel" class="card mb-6" style="padding: 1.25rem; font-size: 0.875rem; color: var(--color-text-muted);">Checking…</div>`
                       : proTeaser(
                           'payment-import',
                           'Never log a sale by hand again',
                           `Connect ${IMPORT_SOURCES_LABEL} once. Every sale appears here the moment it happens.${IMPORT_SOON_NOTE}`,
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
                               <!-- Built from CONTACT_SOURCES in store.js, which the
                                    pipeline screen also renders. The list used to be
                                    hardcoded here while the pipeline took free text,
                                    so the same channel could arrive under two
                                    spellings and split into two rows in "Which
                                    Channel Earns". -->
                               <select id="log-source" class="form-control" required>
                                   ${CONTACT_SOURCES.map(s => `<option value="${s}">${s}</option>`).join('')}
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
                               <label>Of Those, How Many Closed</label>
                               <input type="number" id="metric-closes" min="0" step="1" class="form-control" required placeholder="e.g. 3">
                               <p style="font-size: 0.75rem; color: var(--color-text-muted); margin: 0.35rem 0 0;">
                                   How many of those calls turned into a sale. This is what your call close rate is worked out from.
                               </p>
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
                          <div id="quick-offer-slots">
                          ${(() => {
                              const saved = store.revenue?.quickOffers || [];
                              // Never fewer than the base three, and never fewer
                              // than what is already saved: an account that drops
                              // back to base still sees and can edit the offers
                              // it added while it had Pro.
                              quickOfferSlots = Math.max(QUICK_OFFER_BASE_LIMIT, saved.length);
                              return Array.from({ length: quickOfferSlots },
                                  (_, i) => renderQuickOfferSlot(i, saved[i])).join('');
                          })()}
                          </div>
                          ${canUseUnlimitedOffers()
                              // Same shape as the Stripe and pipeline cards above:
                              // proTeaser deletes itself once the account has the
                              // feature, so the control it was advertising takes
                              // its place rather than leaving a hole where the
                              // useful thing should be.
                              ? `<button type="button" id="add-quick-offer" class="btn btn-ghost btn-sm" style="width: 100%; border: 1px dashed var(--color-border); color: var(--color-text-muted); margin-bottom: 0.75rem;">+ Add another offer</button>`
                              : proTeaser(
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
                       ${canUseLeadPipeline()
                           // Same shape as the Stripe panel above: once the
                           // account has the feature, proTeaser deletes itself,
                           // and leaving the hole would take away the one useful
                           // control on the card. A live summary and a way in
                           // takes its place.
                           ? renderPipelineSummary(currency)
                           : proTeaser(
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

// The human label for a stage in the CSV export. The stored keys are slugs
// ('call-booked'), and an export is read by a person, not by this app.
function stageLabelForCsv(key) {
    const stage = PIPELINE_STAGES.find(s => s.key === key);
    return stage ? stage.label : (key || '');
}

// Blank, not "Unknown", when no confidence was set. An export is data, and an
// empty cell filters and pivots correctly where an invented word does not.
function probabilityLabelForCsv(key) {
    const p = PIPELINE_PROBABILITIES.find(x => x.key === key);
    return p ? p.label : '';
}

// The named-pipeline summary that replaces the teaser once the account has the
// feature. Deliberately small: it answers "is anyone waiting on me" and gets out
// of the way. The board itself lives at #/pipeline, because five stage columns
// need more width than this sidebar has.
//
// Every number here comes from getPipelineInsights, which is the same source the
// pipeline screen reads. No counting is done in this file.
function renderPipelineSummary(currency) {
    const pipeline = getPipelineInsights();
    // ⚠️ Read the assembled list, never re-add the categories. This line used to
    // be `followUpsDue.length + goneQuiet.length`, and the moment a third
    // category (an overdue close date) was added it silently undercounted — this
    // card said 2 while the pipeline screen said 3, from the same data.
    const needsYou = pipeline.needsYou.length;

    const body = pipeline.total === 0
        ? `<p style="font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 0.75rem 0;">
               Nothing in your pipeline yet. Add the person you spoke to most recently.
           </p>`
        : `<p style="font-size: 0.85rem; color: var(--color-text-main); margin: 0 0 0.75rem 0; line-height: 1.5;">
               ${pipeline.openCount} open ${pipeline.openCount === 1 ? 'deal' : 'deals'}${pipeline.openValue > 0 ? ` worth ${currency}${formatAmount(pipeline.openValue)}` : ''}.
               ${needsYou > 0
                   ? `<strong style="color: var(--color-accent-dark);">${needsYou} ${needsYou === 1 ? 'needs' : 'need'} you today.</strong>`
                   : 'Nobody is waiting on you.'}
           </p>`;

    return `
        <div class="card mt-4" style="padding: 1.25rem; border-left: 3px solid var(--color-primary);">
            <p style="${PRO_CARD_HEADING_STYLE}">${proCardHeading('lead-pipeline', 'Your lead pipeline')}</p>
            ${body}
            <a href="#/pipeline" class="btn btn-outline btn-sm" style="width: 100%; text-align: center;">Open pipeline</a>
        </div>
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

// The Monthly Metric Snapshots card.
//
// This used to be a list of three unrelated numbers per month with a small arrow
// beside each. The numbers are actually a funnel — visitors, then the ones who
// booked a call, then the ones who bought — and printing them side by side left
// the reader to do the division in her head. It was also the only thing on a page
// of charts that visualised nothing.
//
// So: the two conversion rates worked out, a trend so you can see which direction
// they are going, and the funnel drawn to scale so a narrow step is obvious at a
// glance. The point of logging traffic every month is to find out which stage is
// leaking, and that is a question about rates, not counts.
function renderSnapshotFunnel(metrics, allSales, currency) {
    if (!metrics || metrics.length === 0) {
        return '<p style="color: var(--color-text-muted); font-size: 0.9rem;">Nothing logged yet. Log your first snapshot on the Snapshot tab, and the second one gives you a trend.</p>';
    }

    // A rate needs something to divide by, and closes were only added to the
    // snapshot form later — so both "no calls that month" and "closes never
    // recorded" have to come back as null and print as a dash, never as 0%.
    const rate = (num, den) => {
        if (!(den > 0) || num === undefined || num === null) return null;
        return (num / den) * 100;
    };
    const pct = (v) => v === null ? '&mdash;' : `${v.toFixed(v < 10 ? 1 : 0)}%`;

    // Sales for the same month, counted from entries already logged. Not everyone
    // who uses this app books calls — a digital product seller goes straight from
    // visitor to sale — so the funnel has to end somewhere universal. Sales is the
    // one stage every business has, and it needs no extra input because the sales
    // are already there with dates on them.
    const salesFor = (dateStr) => {
        const d = new Date(dateStr);
        const inMonth = (allSales || []).filter(s => {
            const sd = new Date(s.date);
            return sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear();
        });
        return {
            count: inMonth.length,
            revenue: inMonth.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
        };
    };

    const sorted = metrics.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const rows = sorted.map(m => {
        const sales = salesFor(m.date);
        const calls = parseFloat(m.calls) || 0;
        return {
            date: m.date,
            id: m.id,
            traffic: parseFloat(m.traffic) || 0,
            calls,
            closes: (m.closes === undefined || m.closes === null) ? null : (parseFloat(m.closes) || 0),
            social: parseFloat(m.social) || 0,
            salesCount: sales.count,
            salesRevenue: sales.revenue,
            // The call stages are hidden entirely for a month with no calls, rather
            // than shown as two empty rows. Someone who never gets on a call should
            // not have to read past a stage that will always be blank for them.
            usesCalls: calls > 0,
            month: new Date(m.date).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
        };
    }).map(r => ({
        ...r,
        visitorToCall: rate(r.calls, r.traffic),
        callToClose: rate(r.closes, r.calls),
        callToSale: rate(r.salesCount, r.calls),
        visitorToSale: rate(r.salesCount, r.traffic)
    }));

    // Trend: both series are percentages, so they share a 0-100 scale and can be
    // compared honestly. Charting the raw counts instead would put traffic in the
    // thousands next to closes in single figures and tell you nothing.
    const trendMonths = rows.slice(-6);
    const trendSeries = (label, key, colour) => `
        <div style="margin-bottom: 0.75rem;">
            <p style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; margin: 0 0 0.35rem;">${label}</p>
            <div style="display: flex; gap: 0.35rem; align-items: flex-end; height: 46px;">
                ${trendMonths.map(r => {
                    const v = r[key];
                    const h = v === null ? 0 : Math.max(2, Math.min(100, v));
                    return `
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.2rem;" title="${r.month}: ${v === null ? 'not recorded' : v.toFixed(1) + '%'}">
                        <div style="width: 100%; height: 34px; display: flex; align-items: flex-end;">
                            <div style="width: 100%; height: ${h}%; background: ${v === null ? 'var(--color-border)' : colour}; border-radius: 3px 3px 0 0;"></div>
                        </div>
                        <span style="font-size: 0.6rem; color: var(--color-text-muted);">${r.month}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;

    const trend = trendMonths.length > 1 ? `
        <div style="margin-bottom: 1.25rem;">
            ${trendSeries('Website visitors who booked a call', 'visitorToCall', 'var(--color-primary)')}
            ${trendSeries('Calls that closed', 'callToClose', 'var(--color-secondary)')}
        </div>` : '';

    // Newest month first in the list below, which is the one being acted on.
    const monthRows = rows.slice().reverse().map((r, i) => {
        const prev = rows.slice().reverse()[i + 1];
        const delta = (now, before) => {
            if (now === null || before === null || before === undefined) return '';
            const d = now - before;
            if (Math.abs(d) < 0.05) return `<span style="font-size: 0.7rem; color: var(--color-text-muted);">same</span>`;
            const up = d > 0;
            return `<span style="font-size: 0.7rem; color: ${up ? 'var(--color-primary-dark)' : 'var(--color-error)'};">${up ? '↑' : '↓'} ${Math.abs(d).toFixed(1)} pts</span>`;
        };

        // Each bar shows the conversion FROM THE STEP ABOVE, not a share of
        // traffic.
        //
        // Scaling everything to traffic looked right on paper and was useless in
        // practice: 12 calls out of 1,500 visitors is 0.8%, and 3 closes is 0.2%,
        // so both bars hit the minimum width and rendered identical. A funnel
        // where every stage looks the same length tells you nothing.
        //
        // Against the previous step, closes read 25% of calls, which is a bar you
        // can actually see and compare month to month. The percentage is printed
        // beside it either way, so the bar carries the gist and the text carries
        // the precision.
        const stepWidth = (num, den) => {
            if (!(den > 0) || num === null || num === undefined) return 0;
            return Math.max(1, Math.min(100, (num / den) * 100));
        };
        const bar = (label, count, width, colour, note) => `
            <div style="margin-bottom: 0.4rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 0.15rem;">
                    <span><strong style="color: var(--color-black);">${label}</strong> ${count}</span>
                    <span>${note}</span>
                </div>
                <div style="height: 10px; background: rgba(16,24,40,0.08); border-radius: 5px; overflow: hidden;">
                    <div style="height: 100%; width: ${width}%; background: ${colour}; border-radius: 5px;"></div>
                </div>
            </div>`;

        return `
        <div style="padding-bottom: 1rem; border-bottom: 1px solid var(--color-border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span style="font-weight: 600; color: var(--color-black);">${new Date(r.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                <button type="button" class="btn btn-ghost btn-sm btn-delete-metric" data-id="${r.id}" style="padding: 0.25rem 0.5rem; color: var(--color-text-muted);" title="Delete Entry">🗑️</button>
            </div>
            ${/* Solid colours only. Two attempts at this bar used --color-border and
                  then --color-primary-light (#E5F9FA), both of which are near-white
                  and rendered as an empty track on an empty track. The top of the
                  funnel is always 100% wide, so if it is not clearly filled it just
                  looks like nothing was recorded. */''}
            ${bar('Website visitors', r.traffic.toLocaleString(), 100, 'var(--color-primary-dark)', '')}
            ${r.usesCalls ? `
                ${bar('Booked a call', r.calls.toLocaleString(), stepWidth(r.calls, r.traffic), 'var(--color-primary)', `${pct(r.visitorToCall)} of visitors ${delta(r.visitorToCall, prev?.visitorToCall)}`)}
                ${bar('Calls closed', r.closes === null ? 'not recorded' : r.closes.toLocaleString(), stepWidth(r.closes, r.calls), 'var(--color-secondary)', r.closes === null ? '' : `${pct(r.callToClose)} of calls ${delta(r.callToClose, prev?.callToClose)}`)}
            ` : ''}
            ${bar(
                'Sales',
                `${r.salesCount.toLocaleString()} &middot; ${currency}${formatAmount(r.salesRevenue)}`,
                stepWidth(r.salesCount, r.usesCalls ? r.calls : r.traffic),
                'var(--color-secondary-dark)',
                `${pct(r.usesCalls ? r.callToSale : r.visitorToSale)} of ${r.usesCalls ? 'calls' : 'visitors'} ${delta(r.usesCalls ? r.callToSale : r.visitorToSale, r.usesCalls ? prev?.callToSale : prev?.visitorToSale)}`
            )}
            <p style="font-size: 0.75rem; color: var(--color-text-muted); margin: 0.5rem 0 0;">Social audience ${r.social.toLocaleString()}</p>
        </div>`;
    }).join('');

    return `${trend}<div style="display: flex; flex-direction: column; gap: 1rem;">${monthRows}</div>`;
}

// Which channel earns. Built entirely from data already logged against leads and
// sales, so there is nothing extra to fill in.
function renderChannelFunnel(currency) {
    const channels = getChannelFunnel();
    const real = channels.filter(c => c.label !== NOT_ATTRIBUTED);

    if (channels.length === 0) {
        return '<p style="color: var(--color-text-muted); font-size: 0.9rem;">Nothing to compare yet. Log a few sales and leads with their sources and your channels will appear here.</p>';
    }

    const pct = (v) => v === null ? '&mdash;' : `${v.toFixed(v < 10 ? 1 : 0)}%`;
    const maxRevenue = Math.max(...channels.map(c => c.revenue), 0);

    // A bar per channel, sized by revenue, with the funnel rates underneath. The
    // bar is the point: it answers "which of these is actually big" before you
    // have read a single number.
    const rows = channels.map(c => {
        const unattributed = c.label === NOT_ATTRIBUTED;
        const width = maxRevenue > 0 ? Math.max(c.revenue > 0 ? 2 : 0, (c.revenue / maxRevenue) * 100) : 0;
        const colour = unattributed ? 'var(--color-border)' : 'var(--color-primary)';

        return `
        <div style="margin-bottom: 0.9rem; ${unattributed ? 'opacity: 0.8;' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span style="font-weight: 600; color: var(--color-black); font-size: 0.875rem;">${c.label}</span>
                <span style="font-weight: 600; color: var(--color-black); font-size: 0.875rem;">${currency}${formatAmount(c.revenue)}</span>
            </div>
            <div style="height: 10px; background: var(--color-bg-light); border-radius: 5px; overflow: hidden; margin-bottom: 0.25rem;">
                <div style="height: 100%; width: ${width}%; background: ${colour}; border-radius: 5px;"></div>
            </div>
            <div style="font-size: 0.72rem; color: var(--color-text-muted);">
                ${unattributed
                    ? 'Imported payments and anything logged without a source. Not a channel, a gap.'
                    : `${c.leads ? c.leads.toLocaleString() + ' leads' : 'no leads logged'} &middot; ${c.calls.toLocaleString()} calls (${pct(c.callRate)}) &middot; ${c.hasClosesLogged ? c.closes.toLocaleString() + ' closed (' + pct(c.closeRate) + ')' : 'closes not logged'}`}
            </div>
            ${c.similarTo && c.similarTo.length ? `<div style="font-size: 0.72rem; color: #B54708; margin-top: 0.2rem;">Might be the same channel as ${c.similarTo.join(', ')}. Kept separate, since only you can say.</div>` : ''}
        </div>`;
    }).join('');

    // Only worth saying when there is something to compare against.
    const best = real.filter(c => c.closeRate !== null).sort((a, b) => b.closeRate - a.closeRate)[0];
    const takeaway = (real.length > 1 && best)
        ? `<p style="font-size: 0.8rem; color: var(--color-text-muted); margin: 0.75rem 0 0;"><strong style="color: var(--color-black);">${best.label}</strong> closes the highest share of its calls at ${best.closeRate.toFixed(0)}%. Worth asking what you do differently there.</p>`
        : '';

    return `${rows}${takeaway}`;
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
        // Same funnel figures the Revenue screen shows, so the report cannot quote
        // a close rate that contradicts the card the user is looking at.
        const funnel = getFunnelInsights();

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
        
        Recent Monthly Funnel Snapshots:
        ${metrics.slice(-3).map(m => {
            const closes = (m.closes === undefined || m.closes === null) ? 'not recorded' : m.closes;
            const toCall = m.traffic > 0 ? ((m.calls / m.traffic) * 100).toFixed(1) + '%' : 'n/a';
            const toClose = (m.calls > 0 && m.closes !== undefined && m.closes !== null)
                ? ((m.closes / m.calls) * 100).toFixed(1) + '%'
                : 'n/a';
            return `Date: ${new Date(m.date).toLocaleDateString()}, Website Visitors: ${m.traffic}, Calls Booked: ${m.calls} (${toCall} of visitors), Calls Closed: ${closes} (${toClose} of calls), Social Audience: ${m.social}`;
        }).join('\n')}
        ${funnel.callCloseRate === null
            ? 'Overall call close rate: not recorded yet. The user has logged calls but not how many closed, so do not quote or estimate a close rate — tell her to log it.'
            : `Overall call close rate: ${funnel.callCloseRate.toFixed(1)}% (${funnel.totalCloses} closed from ${funnel.totalCalls} calls).`}
        
        Recent Revenue Sources:
        ${insights.entries.slice(-5).map(e => `Source: ${e.source}, Amount: ${e.amount}`).join('\n')}
        `;

        const data = await window.invokeChat([{ role: 'user', content: prompt }]);

        const reportText = data.choices[0].message.content;
        aiContent.innerHTML = window.marked.parse(reportText);

        // Hand it to the branded report, so exporting after generating a summary
        // sends the numbers and the write-up about them together rather than as
        // two separate things the reader has to join up. Session-scoped: closing
        // the tab forgets it, exactly as closing this modal always has.
        rememberAiReport(reportText);
        
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

// The import panel in the Revenue sidebar, for accounts that have the feature.
//
// This replaces the teaser strip, which deletes itself once a feature is live for
// you. That is correct for an advert and wrong for the slot: the moment the
// import starts working is the moment you want a button to pull new sales in, not
// an empty gap where the explanation used to be.
//
// Covers BOTH processors. It was Stripe-only until PayPal landed, and the two
// things that had to change are the two that would have been wrong rather than
// merely incomplete: the heading said "Stripe connected" whoever was connected,
// and the button synced Stripe whether or not Stripe was the one with sales
// waiting.
async function paintRevenueImportPanel() {
    const host = document.getElementById('revenue-import-panel');
    if (!host) return;

    // Asked together rather than one after the other: this is a sidebar panel on
    // a screen that is already doing a lot, and two sequential round trips before
    // it can say anything is two too many.
    const [stripe, paypal] = await Promise.all([
        fetchStripeConnection(),
        canConnectPayPal() ? fetchPayPalConnection() : Promise.resolve({ state: 'none', conn: null }),
    ]);

    // Couldn't find out. Say so quietly and leave it - this is a sidebar panel,
    // not somewhere to start a troubleshooting flow, and offering "connect
    // Stripe" to someone who already has would be actively wrong.
    //
    // Only when BOTH are unknown. One processor answering is enough to paint a
    // useful panel, and refusing to show a working PayPal connection because the
    // Stripe read timed out would be losing information we already have.
    if (stripe.state === 'unknown' && paypal.state === 'unknown') {
        host.innerHTML = `
            <p style="${PRO_CARD_HEADING_STYLE}">${proCardHeading('payment-import', 'Sales import')}</p>
            <p style="margin: 0; line-height: 1.5;">Couldn't check your connection just now. Nothing has been lost, it'll retry when you reload.</p>
        `;
        return;
    }

    const connected = [];
    if (stripe.state === 'connected') connected.push({ name: 'Stripe', conn: stripe.conn, sync: syncStripeSales });
    if (paypal.state === 'connected') connected.push({ name: 'PayPal', conn: paypal.conn, sync: syncPayPalSales });

    // Both remaining states head with proCardHeading, the shared wrapper that owns
    // the PRO chip. Building this heading by hand is how the badge went missing
    // when this panel replaced the teaser strip.
    if (!connected.length) {
        // Names PayPal only when PayPal can actually be connected. Offering it
        // while it is still behind its flag would be the exact "promised in the
        // UI, not built" problem that put item 10 on the plan in the first place.
        const what = canConnectPayPal() ? 'Connect Stripe or PayPal once' : 'Connect Stripe once';
        host.innerHTML = `
            <p style="${PRO_CARD_HEADING_STYLE}">${proCardHeading('payment-import', 'Stop logging sales by hand')}</p>
            <p style="margin: 0 0 1rem 0; line-height: 1.5;">Importing your sales automatically is part of Pro. ${what} and they appear here on their own.</p>
            <a href="#/account" class="btn btn-outline btn-sm" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Connect &rarr;</a>
        `;
        return;
    }

    const names = connected.map(c => c.name).join(' and ');

    // The other processor, when only one is connected.
    //
    // Without this the panel goes quiet about PayPal the moment Stripe is
    // working, so someone who takes money through both would never learn the
    // second half exists — the Revenue screen is exactly where you notice sales
    // missing, and it was the one screen that stopped offering the answer.
    const missing = [];
    if (stripe.state === 'none') missing.push('Stripe');
    if (canConnectPayPal() && paypal.state === 'none') missing.push('PayPal');

    const addOther = missing.length
        ? `<p style="margin: 0 0 1rem 0; line-height: 1.5;">
               Also taking payments through ${missing.join(' or ')}?
               <a href="#/account" style="color: var(--color-primary-dark); font-weight: 600;">Connect ${missing.join(' or ')} →</a>
           </p>`
        : '';

    // The combined count is right here, unlike on the Account screen where each
    // processor has its own panel and must claim only its own sales. This one
    // sentence covers everything that arrived on its own.
    const count = getImportedSalesCache().length;

    // The most recent successful check across everything connected. Two dates in
    // a sidebar strip is more precision than the sentence can carry; the Account
    // screen is where each connection reports for itself.
    const syncedTimes = connected
        .map(c => c.conn.last_synced_at)
        .filter(Boolean)
        .map(t => new Date(t).getTime());
    const lastSynced = syncedTimes.length
        ? new Date(Math.max(...syncedTimes)).toLocaleDateString()
        : 'not yet';

    const errors = connected
        .filter(c => c.conn.last_sync_error)
        .map(c => `<p style="margin: 0 0 1rem 0; color: #B42318;">${c.name} last attempt failed: ${c.conn.last_sync_error}</p>`)
        .join('');

    host.innerHTML = `
        <p style="${PRO_CARD_HEADING_STYLE}">${proCardHeading('payment-import', `${names} connected`)}</p>
        <p style="margin: 0 0 1rem 0; line-height: 1.5;">
            ${count} ${count === 1 ? 'sale' : 'sales'} imported automatically, part of your Pro plan. Last checked ${lastSynced}.
        </p>
        ${addOther}
        ${errors}
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
            <button type="button" id="btn-revenue-import-sync" class="btn btn-outline btn-sm" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600;">Import sales now</button>
            <a href="#/account" style="font-size: 0.8rem; color: var(--color-text-muted); text-decoration: underline;">Manage</a>
        </div>
    `;

    document.getElementById('btn-revenue-import-sync')?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Importing...';

        // Every connected processor, in parallel. One button that syncs only one
        // of two connections would leave the other silently stale.
        const results = await Promise.all(connected.map(c => c.sync()));

        const failures = [];
        let importedTotal = 0;
        results.forEach((result, i) => {
            if (result.error) failures.push(`${connected[i].name}: ${result.error}`);
            else importedTotal += result.imported || 0;
        });

        // A failure on one side does not hide a success on the other, so both are
        // reported rather than the first one found.
        if (failures.length) showToast(failures.join(' '), 'error');

        if (!importedTotal) {
            if (!failures.length) showToast('Up to date, nothing new to import.', 'success');
            paintRevenueImportPanel();
            return;
        }

        const sales = `${importedTotal} ${importedTotal === 1 ? 'sale' : 'sales'}`;
        if (!failures.length) showToast(`Imported ${sales} from ${names}.`, 'success');
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
        else paintRevenueImportPanel();
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

            const calls = parseFloat(document.getElementById('metric-calls').value) || 0;
            const closes = parseFloat(document.getElementById('metric-closes').value) || 0;

            // Caught here rather than quietly clamped later. More closes than calls
            // is a typo every time, and silently changing someone's number to make
            // the sum work is how a figure nobody trusts ends up on the dashboard.
            if (closes > calls) {
                showToast(`You can't close more calls than you booked. You entered ${closes} closed from ${calls} booked.`, 'error');
                document.getElementById('metric-closes').focus();
                return;
            }

            addMetricSnapshot({
                traffic: parseFloat(document.getElementById('metric-traffic').value),
                calls,
                closes,
                social: parseFloat(document.getElementById('metric-social').value),
                date: parseDateInput(document.getElementById('metric-date').value).toISOString()
            });
            showToast('Snapshot saved');
            rerenderScreen();
        });
    }

    // Add one more offer slot. Appends to the DOM rather than re-rendering the
    // screen, because a re-render rebuilds the form from what is *saved* and
    // would throw away anything typed into the other slots first.
    const addOfferBtn = document.getElementById('add-quick-offer');
    if (addOfferBtn) {
        addOfferBtn.addEventListener('click', () => {
            const slots = document.getElementById('quick-offer-slots');
            if (!slots) return;
            slots.insertAdjacentHTML('beforeend', renderQuickOfferSlot(quickOfferSlots, null));
            quickOfferSlots += 1;
            const added = slots.lastElementChild?.querySelector('.qo-name');
            if (added) added.focus();
        });
    }

    const quickOffersForm = document.getElementById('quick-offers-form');
    if (quickOffersForm) {
        quickOffersForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Read the slots that are actually on the page rather than counting
            // to a fixed number: Pro can have added one since the render. Empty
            // slots are dropped, as they always were, so the saved list stays
            // dense and the 1-Tap dropdowns index straight into it.
            const offers = [];
            document.querySelectorAll('#quick-offer-slots [data-offer-slot]').forEach(slot => {
                const name = slot.querySelector('.qo-name').value.trim();
                const price = slot.querySelector('.qo-price').value;
                const source = slot.querySelector('.qo-source').value.trim();
                if (name) {
                    offers.push({ name, price, source });
                }
            });
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

    // The branded report (Pro item 8). The button only exists for accounts that
    // pass canExportPdf(), and the modal checks the same rule again.
    const btnReportPdf = document.getElementById('btn-report-pdf');
    if (btnReportPdf) {
        // Refresh imported sales FIRST. Both exports read getRevenueInsights(),
        // which merges the in-memory imported-sales cache -- so a report built
        // before that cache is warm silently omits every Stripe and PayPal sale
        // and shows only what was typed by hand. The screen hydrates it on load,
        // but that is a race rather than a guarantee, and a report that quietly
        // under-reports revenue is the worst possible thing for this file to
        // produce. One await removes the whole class of problem.
        btnReportPdf.addEventListener('click', async () => {
            await refreshImportedSales();
            showPdfReportModal();
        });
    }

    // CSV Export Logic
    const btnReportCsv = document.getElementById('btn-report-csv');
    if (btnReportCsv) {
        btnReportCsv.addEventListener('click', async () => {
            // Same guarantee as the PDF button above.
            await refreshImportedSales();
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

            // The three pipeline columns are APPENDED, never inserted. Anyone
            // with a saved spreadsheet, a pivot table or a formula built on last
            // month's export keeps working; inserting a column mid-table would
            // silently move every one after it.
            //
            // Pipeline Value has its own column rather than going in Amount on
            // purpose: Amount holds money that arrived, and a deal that might
            // close is not that. Summing the Amount column has to stay a true
            // answer to "what did I make".
            let csvContent = row([
                'Type', 'Date', 'Amount', 'Currency', 'Source', 'Offer',
                'Calls', 'Closes', 'Traffic', 'Social Audience',
                'Counts Toward This Quarter', 'Notes',
                'Contact Name', 'Stage', 'Pipeline Value',
                'Likelihood', 'Expected Close Date', 'Next Step'
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
                    // Closes stays blank for snapshots taken before the field
                    // existed, rather than becoming a 0 that would read as a real
                    // month of no closes once it is in a spreadsheet.
                    m.calls || 0, (m.closes === undefined || m.closes === null) ? '' : m.closes,
                    m.traffic || 0, m.social || 0,
                    inQuarter(m.date), ''
                ]);
            });

            // The named pipeline. Dated by when the contact was created, so the
            // quarter column means the same thing it does on every other row.
            // Calls and Closes carry the same 1-or-0 the funnel counts, so a
            // spreadsheet totalling those columns reaches the same figure the
            // app shows rather than a different one.
            (store.contacts || []).forEach(c => {
                csvContent += row([
                    'Contact', isoDate(c.createdAt), '', '',
                    c.source || '', c.offer || '',
                    (c.reached && c.reached['call-booked']) ? 1 : 0,
                    c.stage === 'won' ? 1 : 0,
                    '', '',
                    inQuarter(c.createdAt), c.notes || '',
                    c.name || '', stageLabelForCsv(c.stage), parseFloat(c.value) || 0,
                    probabilityLabelForCsv(c.probability), c.closeDate || '', c.nextSteps || ''
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
