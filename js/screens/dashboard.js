import { getStore, getRevenueInsights, addRevenueEntry, updateDailyLog, addLeadEntry, applyGeneratedPlan, updateProfile, getLocalDateString, parseDateInput, getWeekStart, getWeeksElapsed, planSourceKey, getActivePlan } from '../store.js';
import { renderNav } from '../components/nav.js';
import { renderTooltip } from '../components/tooltip.js';
import { generate90DayActionPlan } from '../aiService.js';
import { showToast, showConfirm, rerenderScreen } from '../components/toast.js';
import { proTeaser, proLock, canRegenerateWeek } from '../components/proGate.js';
import { showWeekRegenModal } from '../components/weekRegen.js';
import { canUseLiveAI, getCachedLive, daily3Fingerprint, advisorFingerprint, hydrateDaily3, hydrateAdvisorPulses, liveAINote } from '../liveAI.js';

export function renderDashboard() {
    window.setScreenModule({ attachEvents: dashboardAttachEvents });
    const store = getStore();
    const g = store.goals;
    const streak = store.streak;
    const revInsights = getRevenueInsights();
    const currency = store.settings?.currency || '$';
    
    // Core calculations for KPI Clarity
    const leads = store.leads?.entries || [];
    const totalLeads = leads.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    const salesCount = revInsights.entries ? revInsights.entries.length : 0;
    const leadToSaleConversion = totalLeads > 0 ? ((salesCount / totalLeads) * 100).toFixed(1) : 0;
    
    const quickOffers = store.revenue?.quickOffers || [];

    // --- Activation Strategy Prompts ---
    let setupBannerHtml = '';
    if (!g.focus) {
        setupBannerHtml = `
            <div style="background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-dark) 100%); color: white; padding: 0.75rem 1.5rem; text-align: center; font-size: 0.95rem; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 0.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); position: relative; z-index: 10;">
                <span>You haven't set your 90-Day Vision yet — your Daily 3 is waiting.</span>
                <a href="#/wizard" style="color: white; text-decoration: underline; font-weight: 700; display: inline-flex; align-items: center; gap: 0.25rem;">Set it up now (3 mins) 🎯</a>
            </div>
        `;
    }

    // Trial countdown, driven by the real expiry date from the database rather
    // than a locally stored start date. Nobody is charged automatically now,
    // because there is no card on file, so this has to be an invitation.
    let trialWarningHtml = '';
    const trialEndsAtStr = localStorage.getItem('ceo_trial_ends_at');
    const subStatus = localStorage.getItem('ceo_sub_status');

    if (trialEndsAtStr && subStatus === 'trialing') {
        const trialEnd = new Date(trialEndsAtStr);
        const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000));

        // Start nudging in the last five days
        if (daysLeft <= 5) {
            const endDate = trialEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const dayWord = daysLeft === 1 ? 'day' : 'days';
            trialWarningHtml = `
                <div style="background: #FFF3CD; border-bottom: 1px solid #FFEBAA; color: #856404; padding: 0.75rem 1.5rem; text-align: center; font-size: 0.95rem; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 0.5rem; flex-wrap: wrap; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); position: relative; z-index: 10;">
                    <span>Your free trial ends in ${daysLeft} ${dayWord}, on ${endDate}. Your plans and streaks stay safe, you just need a plan to keep using them.</span>
                    <a href="#/billing" style="color: #533F03; text-decoration: underline; font-weight: 700; display: inline-flex; align-items: center; gap: 0.25rem;">Choose your plan</a>
                </div>
            `;
        }
    }
    // ------------------------------------

    // The active weekly plan, or null. getActivePlan() is the single copy of
    // this rule; it used to be pasted here, again below, and in weeklyPlanner.
    const activePlan = getActivePlan(store);

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

    // The Quiet Advisor, worked out once rather than once per card. This used to
    // be called separately inside each of the two pulse blocks below, which ran
    // the whole engine twice per render and meant the two cards could in
    // principle disagree about the same store.
    //
    // The deterministic engine keeps its job: it decides WHICH situation the
    // founder is in and what colour that is. On Pro the words are then rewritten
    // about her actual business — see liveAI.js — but the diagnosis and the
    // colour stay arithmetic, so a red alert always means the numbers said so.
    const advisorPulses = getQuietAdvisorPulses(store, revInsights, leadToSaleConversion, activePlan);

    if (canUseLiveAI()) {
        const advisorRequest = {
            dateStr: getLocalDateString(),
            revenue: advisorPulses.revenue ? advisorPulses.revenue.title : null,
            pipeline: advisorPulses.pipeline ? advisorPulses.pipeline.title : null
        };
        const cachedPulses = getCachedLive(
            'advisor-pulses',
            advisorFingerprint(advisorRequest.dateStr, advisorRequest.revenue, advisorRequest.pipeline)
        );

        if (cachedPulses) {
            // Straight into the markup, so a returning visitor never sees the
            // generic line flick over to the personal one.
            ['revenue', 'pipeline'].forEach(key => {
                const live = cachedPulses[key];
                if (advisorPulses[key] && live && typeof live.message === 'string') {
                    advisorPulses[key].message = live.message.trim();
                }
            });
        } else if (advisorRequest.revenue || advisorRequest.pipeline) {
            window._liveAIAdvisor = advisorRequest;
        }
    }

    let html = `
        ${renderNav()}
        ${setupBannerHtml}
        ${trialWarningHtml}
        <div class="main-content dashboard-layout">
            <div class="flex justify-between items-center mb-6 flex-mobile-col" style="gap: 1rem; align-items: flex-start;">
                <div>
                    <h2>Welcome back, ${store.profile?.name || 'CEO'}</h2>
                    <p style="color: var(--color-text-muted);">Stay focused on your 90-day outcome.</p>
                </div>
                <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.25rem;">
                        <div id="dash-regen-spinner" class="spinner" style="display: none; width: 16px; height: 16px; border: 2px solid var(--color-bg-light); border-top: 2px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        <button class="btn btn-outline btn-sm btn-regenerate-plan" style="display: flex; align-items: center; gap: 0.25rem;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                            Regenerate Plan
                        </button>
                    </div>
                    ${canRegenerateWeek() ? `
                        <button class="btn btn-outline btn-sm btn-redo-week" style="display: flex; align-items: center; gap: 0.4rem;">
                            <span class="pro-badge">PRO</span>
                            Redo one week
                        </button>
                    ` : proLock('week-regen', 'Redo one week')}
                    <button class="btn btn-primary btn-sm btn-open-quick-sale" style="display: flex; align-items: center; gap: 0.25rem;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Log a Sale
                    </button>
                    <div style="background: var(--color-secondary-light); padding: 0.5rem 1rem; border-radius: var(--radius-full); display: flex; align-items: center; gap: 0.5rem; font-weight: 600; color: var(--color-secondary-dark);">
                        Plan: ${store.planningStreak || 0}w | Review: ${streak}w
                        ${renderTooltip("Your weekly CEO cadence streaks. 'Plan' is consecutive weeks you have generated a Monday Plan; 'Review' is consecutive weeks you have completed a Friday Review.", "Maintaining this weekly habit helps you stay aligned with your 90-day trajectory. Missing a week resets the streak.")}
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
            <div class="grid-cols-3 mb-6">
                
                <!-- KPI 1: Revenue & Cash Flow -->
                <div class="card" style="border-top: 4px solid var(--color-primary-dark); display: flex; flex-direction: column;">
                    <div style="flex-grow: 1;">
                        <h3 style="display: flex; align-items: center; margin: 0 0 0.5rem 0; font-size: 0.95rem; color: var(--color-text-main); font-weight: 500;">
                            Quarterly Revenue
                        </h3>
                        <div style="font-size: 2rem; font-weight: 700; color: var(--color-black); line-height: 1.2;">
                            ${currency}${revInsights.totalRevenue.toLocaleString()}
                        </div>
                        <div class="flex justify-between items-center mt-2 mb-1">
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">Progress: ${revInsights.progressPercent.toFixed(1)}%</span>
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">${currency}${revInsights.goal.toLocaleString()}</span>
                        </div>
                        <div class="progress-container" style="height: 6px; background: var(--color-bg-light); border-radius: var(--radius-full); overflow: hidden;">
                            <div class="progress-bar" style="height: 100%; width: ${revInsights.progressPercent}%; background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);"></div>
                        </div>
                        <div style="margin-top: 1rem; font-size: 0.85rem; color: var(--color-text-muted); display: flex; justify-content: space-between;">
                            <span>Weekly Pace: <strong style="${revInsights.projectedRevenue >= revInsights.goal ? 'color: var(--color-primary-dark);' : ''}">${currency}${revInsights.revenueThisWeek.toLocaleString()}</strong></span>
                            <span>Target: ${currency}${revInsights.weeklyTargetLength.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                    </div>
                    
                    <!-- Quiet Advisor Pulse: Revenue -->
                    ${(() => {
                        const pulse = advisorPulses.revenue;
                        if (!pulse || sessionStorage.getItem('dismissPulse_revenue') === 'true') return '';
                        return `
                        <div style="margin-top: 0.75rem; background: #F8FAFC; border-left: 3px solid ${pulse.color}; padding: 0.75rem; border-radius: 4px; display: flex; justify-content: space-between; align-items:flex-start;">
                            <div>
                                <span style="font-size: 0.7rem; text-transform: uppercase; font-weight: 700; color: ${pulse.color}; letter-spacing: 0.05em; margin-bottom: 0.15rem; display: block;">${pulse.title}</span>
                                <p id="pulse-revenue-message" style="font-size: 0.8rem; color: var(--color-text-main); margin: 0; line-height: 1.3;">${pulse.message}</p>
                            </div>
                            <button class="btn-dismiss-pulse" data-pulse-id="revenue" style="background: none; border: none; color: var(--color-text-muted); font-size: 1rem; cursor: pointer; line-height: 1; padding: 0 0 0 0.5rem;">&times;</button>
                        </div>
                        `;
                    })()}
                    
                    <!-- Quick Actions Section -->
                    <div style="margin-top: 1.5rem; border-top: 1px solid var(--color-border); padding-top: 1rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                            <p style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; color: var(--color-text-muted); margin: 0;">⚡ 1-Tap Log Sale</p>
                            ${renderTooltip("Select your product from the dropdown and click '+ Log' to instantly record a sale and update your pipeline without leaving the dashboard.", "")}
                        </div>
                        ${quickOffers.length > 0 ? `
                        <div style="display: flex; gap: 0.4rem; flex-wrap: nowrap; align-items: stretch;">
                            <select id="dashboard-1tap-select" class="form-control" style="flex-grow: 1; font-size: 0.8rem; padding: 0.35rem 0.5rem; height: auto; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background-color: var(--color-bg-light); cursor: pointer; min-width: 0;">
                                ${quickOffers.map((o, idx) => `<option value="${idx}">${o.name} (${o.price > 0 ? currency + parseFloat(o.price).toLocaleString() : 'Free'})</option>`).join('')}
                            </select>
                            <button class="btn btn-outline btn-1tap-sale-dropdown" style="padding: 0.35rem 0.75rem; font-size: 0.85rem; border-color: var(--color-primary-light); color: var(--color-primary-dark); font-weight: 600; white-space: nowrap; flex-shrink: 0; outline: none; box-shadow: none;">
                                + Log
                            </button>
                        </div>
                        ` : `
                            <button class="btn btn-sm btn-ghost btn-add-quick-offer" style="border: 1px dashed var(--color-border); color: var(--color-text-muted); width: 100%;" onclick="window.location.hash='#/revenue'">+ Setup Quick Offers</button>
                        `}
                    </div>
                </div>

                <!-- KPI 2: Pipeline & Conversion -->
                <div class="card" style="border-top: 4px solid var(--color-secondary); display: flex; flex-direction: column;">
                    <div style="flex-grow: 1;">
                        <h3 style="display: flex; align-items: center; margin: 0 0 0.5rem 0; font-size: 0.95rem; color: var(--color-text-main); font-weight: 500;">
                            Pipeline Leads & Conversion
                        </h3>
                        <div style="font-size: 2rem; font-weight: 700; color: var(--color-black); line-height: 1.2;">
                            ${totalLeads.toLocaleString()} <span style="font-size: 1rem; color: var(--color-text-muted); font-weight: 500;">Leads</span>
                        </div>
                        
                        <div style="margin-top: 1.5rem; display: flex; align-items: center; justify-content: space-between;">
                             <span style="font-size: 0.85rem; color: var(--color-text-muted);">Lead-to-Sale Conversion</span>
                             <span style="font-size: 1.25rem; font-weight: 700; color: var(--color-secondary-dark);">${leadToSaleConversion}%</span>
                        </div>
                        <div style="margin-top: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
                             <span style="font-size: 0.85rem; color: var(--color-text-muted);">Total Closes YTD</span>
                             <span style="font-size: 1.1rem; font-weight: 600; color: var(--color-black);">${salesCount}</span>
                        </div>
                    </div>
                    
                    <!-- Quiet Advisor Pulse: Pipeline -->
                    ${(() => {
                        const pulse = advisorPulses.pipeline;
                        if (!pulse || sessionStorage.getItem('dismissPulse_pipeline') === 'true') return '';
                        return `
                        <div style="margin-top: 0.75rem; background: #F8FAFC; border-left: 3px solid ${pulse.color}; padding: 0.75rem; border-radius: 4px; display: flex; justify-content: space-between; align-items:flex-start;">
                            <div>
                                <span style="font-size: 0.7rem; text-transform: uppercase; font-weight: 700; color: ${pulse.color}; letter-spacing: 0.05em; margin-bottom: 0.15rem; display: block;">${pulse.title}</span>
                                <p id="pulse-pipeline-message" style="font-size: 0.8rem; color: var(--color-text-main); margin: 0; line-height: 1.3;">${pulse.message}</p>
                            </div>
                            <button class="btn-dismiss-pulse" data-pulse-id="pipeline" style="background: none; border: none; color: var(--color-text-muted); font-size: 1rem; cursor: pointer; line-height: 1; padding: 0 0 0 0.5rem;">&times;</button>
                        </div>
                        `;
                    })()}
                    
                    <!-- Quick Actions Section -->
                    <div style="margin-top: 1.5rem; border-top: 1px solid var(--color-border); padding-top: 1rem;">
                        <p style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; color: var(--color-text-muted); margin-bottom: 0.5rem;">⚡ 1-Tap Log Leads</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                             <button class="btn btn-sm btn-outline btn-1tap-lead" style="color: var(--color-secondary-dark); border-color: var(--color-secondary-light);" data-amount="1">+ 1 Lead</button>
                             <button class="btn btn-sm btn-outline btn-1tap-lead" style="color: var(--color-secondary-dark); border-color: var(--color-secondary-light);" data-amount="5">+ 5 Leads</button>
                             <button class="btn btn-sm btn-outline btn-1tap-lead" style="color: var(--color-secondary-dark); border-color: var(--color-secondary-light); grid-column: span 2;" data-amount="10">+ 10 Leads</button>
                        </div>
                    </div>
                </div>

                <!-- KPI 3: Status & Focus -->
                <div class="card" style="border-top: 4px solid var(--color-accent); display: flex; flex-direction: column;">
                    <div style="flex-grow: 1;">
                       <p style="display: flex; align-items: center; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); font-weight: 600; margin-bottom: var(--spacing-sm);">
                           90-Day Focus Goal
                       </p>
                       <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem;">${g.focus || 'Not set'}</h3>
                       
                       <p style="display: flex; align-items: center; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); font-weight: 600; margin-bottom: var(--spacing-sm);">
                           This Week's Plan
                       </p>
                       ${activePlan ? `
                           <span style="background: #E1FDF4; color: #027A48; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 600; display: inline-block; margin-bottom: 0.5rem;">Active</span>
                           <p style="font-size: 0.9rem; color: var(--color-text-main); margin-bottom: 0;">${activePlan.visibilityAction || 'Visibility Action'}</p>
                           <a href="#/planner" style="font-size: 0.85rem; color: var(--color-primary-dark); font-weight: 500; display: inline-block; margin-top: 0.5rem;">View Full Plan →</a>
                       ` : `
                           <span style="background: #FEE4E2; color: #B42318; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 600; display: inline-block; margin-bottom: 0.5rem;">Needs Planning</span>
                           <p style="font-size: 0.85rem; color: var(--color-text-muted);">You haven't planned your week yet.</p>
                           <a href="#/planner" style="font-size: 0.85rem; color: var(--color-primary-dark); font-weight: 500; display: inline-block; margin-top: 0.5rem;">Plan Now →</a>
                       `}
                    </div>
                    
                    <div style="margin-top: 1.5rem; background: var(--color-bg-light); padding: 1rem; border-radius: var(--radius-sm); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25rem;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 0.25rem;">
                            <span style="font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">CEO Weekly Score</span>
                            ${renderTooltip("This score tracks the completion percentage of your Daily 3 tasks for the active week.", "Consistently executing your Daily 3 tasks keeps you focused on your high-priority goals and builds momentum.")}
                        </div>
                        <div id="score-val" style="font-size: 1.8rem; font-weight: 700; margin-top: 0.1rem;">Calculating...</div>
                        <div id="score-details" style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 500; margin-top: 0.1rem;">0 of 0 tasks completed</div>
                    </div>
                </div>
            </div>
    `;
    // Replaced the entire block above with the new KPI 3-column layout

    let dailyTasksHtml = "";

    // Helper to generate daily actionable steps from priorities and weekly plans
    const generateDaily3 = (priorities, plan) => {
        const tasks = [];
        const usedTasks = new Set();
        
        // `slot` picks the generic phrasing deterministically instead of
        // re-rolling at random, which is what produced the "(Part 2)" suffixes:
        // two priorities landing on the same random sentence.
        const addTask = (text, fallback) => {
            const slot = tasks.length;
            let t = breakdownTask(text, fallback, slot);
            let attempts = 0;
            while (usedTasks.has(t) && attempts < 10) {
                t = breakdownTask(text, fallback, slot + attempts + 1);
                attempts++;
            }
            if (usedTasks.has(t)) {
                t = t + ' (Part 2)';
            }
            usedTasks.add(t);
            tasks.push(t);
        };

        // Analyze Priority 1
        const p1 = priorities[0] || '';
        addTask(p1, 'Focus block on top priority');

        // Analyze Priority 2
        const p2 = priorities[1] || '';
        addTask(p2, 'Execute next step for second priority');

        // Analyze Revenue Action based on Weekly Plan vs Priorities
        const rev = plan && plan.revenueAction ? plan.revenueAction : '';
        if (rev.trim() !== '') {
            addTask(rev, 'Complete revenue-generating action');
        } else {
            const p3 = priorities[2] || '';
            addTask(p3, 'Take action on third priority');
        }

        return tasks;
    };

    // Deterministic stand-in for Math.random() when choosing a phrasing.
    //
    // The Daily 3 is built during render and only written to the store later, in
    // attachEvents. Anything that stops that write landing — a full localStorage
    // quota, which saveStore swallows into a console error, or a render whose
    // attachEvents never runs — used to mean a fresh roll of the dice on the next
    // load, so the day's tasks changed under the user on every refresh.
    //
    // Seeding the choice from the date, the slot and the task text means a given
    // day always produces the same three tasks. Persistence is now an
    // optimisation and a place to keep the tick state, not the thing the wording
    // depends on.
    function pickOption(options, seedText, slot) {
        const seed = `${getLocalDateString()}|${slot}|${seedText}`;
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
        }
        return options[Math.abs(hash) % options.length];
    }

    function breakdownTask(taskText, fallback, slot = 0) {
        if (!taskText || taskText.trim() === '') return fallback;
        const lower = taskText.toLowerCase();

        // Check business type
        const model = (store.profile?.businessModel || '').toLowerCase();
        const niche = (store.profile?.industryNiche || '').toLowerCase();
        const isPhysicalOrEcom = model.match(/e-commerce|ecommerce|product|physical|retail|shop|store|handmade|craft/) || 
                                 niche.match(/candle|product|shop|store|handmade|craft|soap|knit|art|jewelry/);

        if (isPhysicalOrEcom) {
            if (lower.match(/launch|new|collection/)) {
                const options = ['Draft email sequence announcing your new product collection', 'Take teaser product photos of the new items', 'Set up the new product pages or listings on your store website', 'Outline the launch day promotion timeline'];
                return pickOption(options, taskText, slot);
            }
            if (lower.match(/email|newsletter/)) {
                const options = ['Draft the weekly newsletter highlighting one best-selling product', 'Set up an automated cart-abandonment email sequence', 'Write a welcome email for new shop signups offering a discount'];
                return pickOption(options, taskText, slot);
            }
            if (lower.match(/post|reel|tiktok|content|video/)) {
                const options = ['Record a behind-the-scenes video showing how your products are made/poured', 'Create a photo post styling your products beautifully in a home environment', 'Engage with 15 ideal customers or decor/niche creators on Instagram'];
                return pickOption(options, taskText, slot);
            }
            if (lower.match(/lead|magnet|freebie|opt-in/)) {
                const options = ['Design a popup signup incentive offering free shipping or 10% off', 'Create a short product guide or quiz to help buyers choose the right scent/style', 'Set up a newsletter subscription form at your checkout page'];
                return pickOption(options, taskText, slot);
            }
            if (lower.match(/sales|sell|close|revenue|income|offer/)) {
                const options = ['Create a limited-time product bundle or special discount code', 'Pitch your product line to a local boutique or physical retail shop for wholesale', 'Optimize your checkout page by adding a simple bump or add-on product'];
                return pickOption(options, taskText, slot);
            }
            if (lower.match(/website|landing page|store/)) {
                const options = ['Review your online store landing page on mobile and optimize the load time', 'Add customer photo reviews to your best-selling product pages', 'Test your checkout flow end-to-end to ensure zero friction for buyers'];
                return pickOption(options, taskText, slot);
            }
            if (lower.match(/market|fair|booth|local/)) {
                const options = ['Research local craft fairs, seasonal markets, or pop-up events and submit applications', 'Design or refine your physical booth table layout and signage', 'Print a QR code display to collect email signups at your checkout counter'];
                return pickOption(options, taskText, slot);
            }
        }

        // Context-Aware Keyword Matching for Daily Actions (Service-based Fallback)
        if (lower.match(/launch|beta/)) {
            const options = ['Draft the launch email sequence', 'Create a list of VIPs to invite to the beta', 'Outline the core offer for the launch', 'Set up the checkout or registration page'];
            return pickOption(options, taskText, slot);
        }
        if (lower.match(/podcast|collab|pitch/)) {
            const options = ['Research 3-5 potential podcasts/creators and draft a custom pitch', 'Follow up with past podcast hosts for a second appearance', 'Outline 3 new podcast topics to pitch'];
            return pickOption(options, taskText, slot);
        }
        if (lower.match(/course|program|module/)) {
            const options = ['Outline the curriculum or record the first module for the course', 'Review student feedback to improve the next module', 'Draft the sales page copy for your program'];
            return pickOption(options, taskText, slot);
        }
        if (lower.match(/email|newsletter|sequence/)) {
            const options = ['Draft the outline and first draft of the email sequence', 'Write 2 engaging emails for your newsletter', 'Review email metrics and optimize the subject lines'];
            return pickOption(options, taskText, slot);
        }
        if (lower.match(/post|reel|tiktok|content|video/)) {
            const options = ['Script or outline 3 pieces of content and batch record/write them', 'Repurpose your top-performing post into a short video script', 'Engage with 10 ideal clients before posting your content'];
            return pickOption(options, taskText, slot);
        }
        if (lower.match(/lead|magnet|freebie|opt-in/)) {
            const options = ['Design the core asset for the lead magnet (PDF, video outline, checklist)', 'Draft the opt-in page copy for your new freebie', 'Plan the 3-part welcome sequence for new subscribers'];
            return pickOption(options, taskText, slot);
        }
        if (lower.match(/sales|sell|close|revenue|income/)) {
            const options = ['Identify 5 warm leads from recent interactions and send a personalized DM/email', 'Follow up with 3 prospects who ghosted or said "not right now"', 'Review your sales process to identify and fix one bottleneck'];
            return pickOption(options, taskText, slot);
        }
        if (lower.match(/webinar|masterclass|live/)) {
            const options = ['Draft the slide deck outline focusing on the core problem and solution', 'Promote your upcoming live session on your main social channel', 'Write the follow-up email sequence for webinar attendees'];
            return pickOption(options, taskText, slot);
        }
        if (lower.match(/website|landing page|sales page/)) {
            const options = ['Draft the copy for the top three sections of the page (Headline, Problem, Solution)', 'Review your landing page on mobile and optimize the call-to-action', 'Source 3 fresh testimonials to add to your sales page'];
            return pickOption(options, taskText, slot);
        }
        if (lower.match(/hire|va|delegate/)) {
            const options = ['Document the step-by-step SOP for the task you want to delegate', 'Draft the job description and post it on your preferred platform', 'Review applications or conduct a 15-minute interview'];
            return pickOption(options, taskText, slot);
        }
        if (lower.match(/brand|niche|messaging/)) {
            const options = ['Write down 3 core beliefs your brand stands for to use in upcoming messaging', 'Review your social media bios and update them for clarity', 'Identify 3 common objections from your audience and draft responses'];
            return pickOption(options, taskText, slot);
        }

        // Nothing matched, so the priority is described in words this engine does
        // not recognise. These keep the user's own wording intact and lead with a
        // verb she can act on today.
        //
        // The previous version cut her text off at 30 characters and prefixed it
        // with "Outline the first three actionable steps for:" — which read as
        // filler, and turned a priority of "a" into a whole sentence of nothing.
        const subject = taskText.trim();
        const genericOptions = [
            `Decide the very next step for "${subject}" and take it today`,
            `Spend 60 focused minutes moving "${subject}" forward`,
            `Clear the one thing currently blocking "${subject}"`
        ];
        return genericOptions[slot % genericOptions.length];
    }

    // Use the explicit Daily 3 from the actual day if available, otherwise fallback to AI generated tasks based on priorities & weekly plan.
    const todayStrDash = getLocalDateString();
    let todaysLog = store.dailyLogs[todayStrDash];

    if (!g.focus) {
        dailyTasksHtml = `
            <div style="padding: 1.5rem; background: var(--color-bg-light); border-radius: var(--radius-sm); border: 1px dashed var(--color-border); text-align: center;">
                <p style="font-size: 0.9rem; color: var(--color-text-muted); margin: 0 0 1rem 0;">Setup your 90-Day Plan in the wizard to unlock your daily actions.</p>
                <a href="#/wizard" class="btn btn-primary btn-sm" style="display: inline-block;">Start Setup</a>
            </div>
        `;
    } else if (!activePlan) {
        // No plan for this week, so there is nothing honest to put here.
        //
        // This used to invent three tasks out of the 90-Day priorities. They were
        // not things the user had decided to do, they counted towards the CEO
        // Weekly Score as though they were, and with thin priorities they read as
        // filler. An empty Daily 3 sends the score into its existing "No Plan"
        // state, which is the truth.
        todaysLog = null;
        dailyTasksHtml = `
            <div style="padding: 1.5rem; background: var(--color-bg-light); border-radius: var(--radius-sm); border: 1px dashed var(--color-border); text-align: center;">
                <p style="font-size: 0.9rem; color: var(--color-text-main); margin: 0 0 0.35rem 0; font-weight: 600;">No plan for this week yet</p>
                <p style="font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 1rem 0; line-height: 1.5;">Your Daily 3 comes from the actions you set on Monday, so it stays yours rather than something the app made up.</p>
                <a href="#/monday-plan" class="btn btn-primary btn-sm" style="display: inline-block;">Plan This Week</a>
            </div>
        `;
    } else {
        // The week's plan already carries three real actions: the ones typed into
        // the Monday Plan, or the ones the 90-day AI plan wrote for this week,
        // which applyGeneratedPlan stores as `daily3`. They are written against
        // the actual business.
        //
        // This used to walk straight past them and run the keyword templates over
        // the weekly *priorities* instead, so a plan whose Monday action read
        // "Send 3 personal sales invitations" surfaced on the dashboard as
        // "Outline the first three actionable steps for: a". mondayPlan.js already
        // fixed this for its own suggestions; the dashboard kept the bug — it
        // generated the real tasks, saved them, and ignored them.
        const planKey = planSourceKey(activePlan);

        // Rewriting the week's plan on a Monday morning used to leave that day's
        // tasks untouched, because a log already existed for the date. Comparing
        // the plan the tasks were built from against the current one picks that up.
        const builtFrom = store.dailyLogSources ? store.dailyLogSources[todayStrDash] : undefined;
        const isStale = Boolean(todaysLog) && builtFrom !== planKey;

        const plannedDaily3 = Array.isArray(activePlan.daily3)
            ? activePlan.daily3.map(t => (t || '').trim()).filter(Boolean)
            : [];
        const currentPriorities = [0, 1, 2].map(i => (activePlan.topActions || g.priorities)[i] || '');

        // The keyword templates only ever run when the week's plan has no daily3
        // of its own — i.e. when she wrote her own Monday plan rather than
        // applying a generated week. That is the one case Pro replaces.
        const usingKeywordEngine = plannedDaily3.length === 0;
        const liveFingerprint = daily3Fingerprint(todayStrDash, planKey, currentPriorities);
        const cachedDaily3 = (usingKeywordEngine && canUseLiveAI())
            ? getCachedLive('daily-3', liveFingerprint)
            : null;

        if (!todaysLog || isStale) {
            let generatedTasks;
            if (plannedDaily3.length > 0) {
                generatedTasks = plannedDaily3.slice(0, 3);
            } else if (cachedDaily3) {
                generatedTasks = cachedDaily3;
            } else {
                generatedTasks = generateDaily3(currentPriorities, activePlan);
            }

            // Anything already ticked that survived the rewrite keeps its tick.
            // Losing a morning's completed work because the plan was edited at
            // lunchtime would be its own bug.
            const doneByText = {};
            (todaysLog || []).forEach(t => { if (t && t.done) doneByText[t.text] = true; });

            todaysLog = generatedTasks.map(t => ({ text: t, done: Boolean(doneByText[t]) }));
            // Saved in attachEvents, along with the plan it was built from.
            window._tempGeneratedTodaysLog = { tasks: todaysLog, source: planKey };
        }

        // Ask for a live Daily 3 when there is no cached answer yet.
        //
        // Deliberately outside the block above, which only runs when the log is
        // being rebuilt. A call that failed earlier today left a keyword log in
        // place, and without this the app would not try again until tomorrow,
        // because a log now exists and is not stale. The daily budget is what
        // stops that retry becoming a loop.
        //
        // Skipped once anything has been ticked: swapping a task she has already
        // done would lose real work. hydrateDaily3 checks that again at the point
        // the answer actually lands.
        if (usingKeywordEngine && canUseLiveAI() && !cachedDaily3 && !todaysLog.some(t => t.done)) {
            window._liveAIDaily3 = {
                dateStr: todayStrDash,
                planKey,
                priorities: currentPriorities,
                winCondition: activePlan.winCondition || '',
                revenueAction: activePlan.revenueAction || '',
                visibilityAction: activePlan.visibilityAction || '',
                followUps: activePlan.followUps || '',
                dayName: new Date().toLocaleDateString('en-US', { weekday: 'long' })
            };
        }

        todaysLog.forEach((taskObj, i) => {
            dailyTasksHtml += `
                <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background-color var(--transition-fast);" class="dailyhover">
                    <input type="checkbox" id="daily-task-${i}" ${taskObj.done ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--color-primary);">
                    <span style="font-size: 0.95rem; font-weight: 500; ${taskObj.done ? 'text-decoration: line-through; color: var(--color-text-muted);' : ''}">${taskObj.text}</span>
                </label>
            `;
        });
    }

    html += `
            <div class="grid-sidebar mb-6">
                <!-- Daily 3 Action Items -->
                <div class="card" style="border-left: 4px solid var(--color-accent);">
                     <div class="flex items-center gap-2 mb-4">
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-dark)" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                         <h3 style="margin: 0;">The Daily 3</h3>
                     </div>
                     <p style="font-size: 0.9rem; color: var(--color-text-muted); margin-bottom: 1rem;">Move the needle today based on your top priorities.</p>
                     <div id="daily-3-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                         ${dailyTasksHtml}
                     </div>
                     ${activePlan ? liveAINote('Broken down from this week\'s plan for your business.') : ''}
                     ${proTeaser(
                         'live-ai',
                         'Suggestions written about your business',
                         'These follow set patterns today. Pro writes them from your real numbers and offer.'
                     )}
                </div>

                <div style="display: flex; flex-direction: column; gap: var(--spacing-lg);">
                    <!--CEO Commitment-->
                    <div class="card" style="flex-grow: 1; background-color: var(--color-primary-light); border-color: var(--color-primary-light); display: flex; flex-direction: column; justify-content: center; text-align: center;">
                        <p style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary-dark); font-weight: 600; margin-bottom: var(--spacing-sm);">${store.profile?.name ? store.profile.name + "'s" : "Your"} Commitment</p>
                        <p style="font-size: 1.125rem; font-family: var(--font-heading); font-style: italic; color: var(--color-black); margin: 0;">"${g.statement || "I commit to leading with confidence."}"</p>
                    </div>
                </div>
            </div>

            <!--Quick Actions-->
            <div class="mt-8 flex justify-center gap-4">
                <a href="#/review" class="btn btn-secondary">Do Friday Review</a>
            </div>
            
        </div >

        <!--Quick Sale Modal-->
        <div id="quick-sale-modal" class="modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 100; align-items: center; justify-content: center;">
            <div class="card" style="width: 100%; max-width: 400px; padding: 2rem; position: relative;">
                <button id="btn-close-quick-sale" style="position: absolute; top: 1rem; right: 1rem; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--color-text-muted);">&times;</button>
                    <h3 style="margin-bottom: 1.5rem;">Log a Sale</h3>
                    <form id="quick-sale-form">
                        <div class="form-group">
                            <label>Amount (${currency})</label>
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
                            <input type="date" id="qs-date" class="form-control" required value="${getLocalDateString()}">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">Save</button>
                    </form>
                </div>
            </div>
            
            <!-- Daily 3 Celebration Modal -->
            <div id="daily3-celebration-modal" class="modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
                <div class="card" style="width: 100%; max-width: 440px; padding: 2.5rem; position: relative; text-align: center; border-radius: 16px; border: 1px solid rgba(255,255,255,0.5); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2); background: white;">
                    <div style="font-size: 3.5rem; margin-bottom: 1.5rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));">🔥</div>
                    <h3 style="font-size: 1.5rem; margin-bottom: 0.75rem; color: var(--color-black); font-family: var(--font-heading); font-weight: 700;">First Daily 3 Complete!</h3>
                    <p style="color: var(--color-text-main); font-size: 1.05rem; line-height: 1.6; margin-bottom: 2rem;">
                        You're already ahead of 80% of entrepreneurs today. See you tomorrow.
                    </p>
                    <button id="btn-close-celebration" class="btn btn-primary" style="width: 100%; padding: 0.85rem; font-size: 1rem; border-radius: 8px;">Got it, thank you!</button>
                </div>
            </div>
        `;

    return html;
}

// FUTURE UPGRADE NOTES (Advanced Version Ideas):
// 1. Quiet Advisor Dynamic Prompting: Once revenue allows, swap these local static rules to hit the OpenAI Edge Function dynamically for infinite creative variance.
// 2. Direct Data Integrations: Add Stripe/QuickBooks APIs to completely eliminate manual revenue/cash flow entry (Zero-Entry Dashboard).
// 3. Predictive Cash Flow Forecasting: Warn the CEO of upcoming dips based on recurring renewals/historical churn.
// 4. Team Accountability: Allow assigning 'Next Actions' directly to team 'Maker' sub-accounts.
// 5. Custom AI Prompts: Allow uploading company SOPs so the Quiet Advisor suggests actions specific to the user's business.
function getQuietAdvisorPulses(store, revInsights, leadsConversion, activePlan) {
    const pulses = { revenue: null, pipeline: null };
    const day = new Date().getDay(); // 0 is Sunday, 5 is Friday

    // Revenue Pulse Logic
    const weeksElapsed = getWeeksElapsed(store) || 1;
    const hasAnyRevenue = revInsights.totalRevenue > 0;
    const stage = (store.profile?.stage || '').toLowerCase();

    // The suggestion used to be a single hardcoded line telling everyone to contact
    // their "3 most loyal past clients" — advice that lands badly on someone who
    // picked "Just starting out" in the wizard and has no past clients at all.
    const paceSuggestion = stage.includes('just starting')
        ? 'Ask three people who know your work whether they need this, and invite one of them to buy.'
        : stage.includes('scaling')
            ? 'Send a custom bundle to your three most loyal past clients.'
            : 'Send a personal invitation to the five people who engaged with you most this month.';

    if (revInsights.goal > 0 && !hasAnyRevenue && weeksElapsed <= 1) {
        // Week one with nothing logged is not "behind", it is normal. Telling a new
        // customer they are 100% behind target on their first afternoon is the
        // fastest way to lose them.
        pulses.revenue = {
            title: "First Move",
            message: `Nothing logged yet, which is exactly right this early. ${paceSuggestion}`,
            color: "var(--color-primary)"
        };
    } else if (revInsights.projectedRevenue < revInsights.goal && revInsights.goal > 0) {
        pulses.revenue = {
            title: "Pace Alert",
            message: `You are ${(100 - revInsights.progressPercent).toFixed(0)}% behind target. Suggestion: ${paceSuggestion}`,
            color: "#B42318" // Red
        };
    } else if (revInsights.revenueThisWeek > 0 || revInsights.goal > 0) {
        pulses.revenue = {
            title: "Momentum",
            message: `Pacing beautifully. You're bringing in revenue. Protect your margin.`,
            color: "#027A48" // Green
        };
    }

    // Pipeline Pulse Logic
    if (leadsConversion < 10 && store.leads?.entries?.length > 0) {
        pulses.pipeline = {
            title: "Conversion Drop",
            message: `Close rate is below 10%. Stop acquiring leads and tighten your follow-up script.`,
            color: "#F2C21D" // Yellow
        };
    } else if (activePlan && activePlan.followUps?.length > 1) {
        pulses.pipeline = {
            title: "Follow-Up Audit",
            message: `You planned to follow up heavily this week. Have you logged those wins yet?`,
            color: "var(--color-primary)" // Purple
        };
    }

    return pulses;
}

function getCoachingEngineData(store, activePlan, revInsights) {
    const day = new Date().getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday
    const userName = store.profile?.name || 'CEO';
    const streak = store.streak || 0;
    const currency = store.settings?.currency || '$';

    // Check Daily Tasks completion
    const todayStr = getLocalDateString();
    let allDailyChecked = true;
    const todaysLog = store.dailyLogs[todayStr];
    if (!todaysLog || todaysLog.length < 3) {
        allDailyChecked = false;
    } else {
        todaysLog.forEach(t => { if (!t.done) allDailyChecked = false; });
    }

    // What has actually happened, as opposed to what day it is. Every rule below
    // that nags the user has to check one of these first: this card used to run on
    // the calendar alone, so it told brand new users to "close out the week strong"
    // on their first afternoon, and kept saying it after they had already reviewed.
    const weekStart = getWeekStart();
    const reviewedThisWeek = (store.reviews || []).some(r => new Date(r.date) >= weekStart);
    const hasEverPlanned = (store.weeklyPlans || []).some(p => p.applied || !p.generated);
    const planningDay = store.profile?.planningDay || 'Monday';
    const isPlanningDay = new Date().toLocaleDateString('en-US', { weekday: 'long' }) === planningDay;

    // --- State Priority Evaluation ---

    // 0. Quarter Reset Needed (90 days elapsed)
    // Measured from quarterStartDate, which is stamped on wizard completion and on
    // each reset. weeklyPlans[0].date is when the roadmap was *generated* — all 12
    // carry the same timestamp, so regenerating a plan used to move the finish line.
    const quarterOrigin = store.quarterStartDate
        || (store.weeklyPlans && store.weeklyPlans.length > 0 ? store.weeklyPlans[0].date : null);
    if (quarterOrigin) {
        const daysElapsed = Math.floor((Date.now() - new Date(quarterOrigin).getTime()) / (1000 * 60 * 60 * 24));
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

    // 0.4 Never planned a week yet. This outranks every calendar rule on purpose:
    // someone who signed up on a Friday needs their first week set up, not a prompt
    // to review a week they have not had.
    if (!hasEverPlanned) {
        return {
            title: "Start Here",
            message: `Your 90-day plan is ready, ${userName}. The next step is turning week one into three actions you'll actually do.`,
            actionLabel: "Plan your first week",
            actionHash: "#/monday-plan",
            color: "#00C2CB", // Primary WEN
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`
        };
    }

    // 0.45 It's their planning day and this week has no plan. This is the only route
    // into the Monday Plan flow, which otherwise has no link anywhere in the app.
    if (isPlanningDay && !activePlan) {
        return {
            title: `${planningDay} Planning`,
            message: `It's ${planningDay}, ${userName}. Set this week's focus now, before the week sets it for you.`,
            actionLabel: "Plan my week",
            actionHash: "#/monday-plan",
            color: "#00C2CB",
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`
        };
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

    // 2. Missing Friday Review. Gated on there being a week to review and on not
    // having already done it: this used to fire on the day of the week alone, so it
    // nagged people who had just submitted their review and greeted brand new users
    // with a prompt to close out a week they never had.
    if ((day === 5 || day === 6) && activePlan && !reviewedThisWeek) {
        return {
            title: "Weekly Wrap-up",
            message: `It's time to review your week, ${userName}. What moved the business forward? Log your lessons and close out the week strong.`,
            actionLabel: "Do Friday Review",
            actionHash: "#/review",
            color: "#F2C21D", // Yellow
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`
        };
    }

    // 2.5 Review already done and the week is winding down. Says something true
    // rather than falling through to a generic "you are on track".
    if ((day === 5 || day === 6 || day === 0) && reviewedThisWeek) {
        return {
            title: "Week Closed Out",
            message: `Review logged, ${userName}. Your coach has drafted next week already, so rest properly — it'll be waiting on ${planningDay}.`,
            actionLabel: "See next week's draft",
            actionHash: "#/monday-plan",
            color: "#027A48", // Green
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
        };
    }

    // 3. Revenue Celebration
    if (revInsights.totalRevenue >= revInsights.goal && revInsights.goal > 0) {
        return {
            title: "Celebration",
            message: `Incredible work, ${userName}! You've hit your quarterly revenue goal of ${currency}${revInsights.goal.toLocaleString()}. Take a moment to celebrate.`,
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
            message: `${userName}, there are no revenue-generating actions in your plan this week. We can't hit your ${currency}${revInsights.goal.toLocaleString()} goal without invitations.`,
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
    // Daily 3 state persistence using the store logic
    const todayStr = getLocalDateString();
    if (window._tempGeneratedTodaysLog) {
        const pending = window._tempGeneratedTodaysLog;
        updateDailyLog(todayStr, pending.tasks, pending.source);
        delete window._tempGeneratedTodaysLog;
    }

    // Nav active state
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-dashboard')?.classList.add('active');

    // Pro only, and only when render found no cached answer. Both are fire and
    // forget: they must never delay the screen, and a failure leaves exactly the
    // dashboard that was already on screen.
    hydrateDaily3();
    hydrateAdvisorPulses();

    // CEO Focus Score calculation
    const store = getStore();
    const activePlan = getActivePlan(store);

    const scoreValEl = document.getElementById('score-val');
    const scoreDetailsEl = document.getElementById('score-details');

    if (scoreValEl) {
        // Get start of current week (Monday)
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - diffToMonday);
        startOfWeek.setHours(0, 0, 0, 0);

        let totalTasks = 0;
        let completedTasks = 0;

        for (let i = 0; i < 7; i++) {
            const checkDate = new Date(startOfWeek);
            checkDate.setDate(startOfWeek.getDate() + i);
            const dateStr = getLocalDateString(checkDate);
            const log = store.dailyLogs[dateStr];
            if (log && Array.isArray(log)) {
                log.forEach(t => {
                    totalTasks++;
                    if (t.done) completedTasks++;
                });
            }
        }

        if (totalTasks > 0) {
            let score = Math.round((completedTasks / totalTasks) * 100);
            let color = '#B42318'; // Red
            if (score > 65) color = '#F2C21D'; // Yellow/Secondary
            if (score > 90) color = '#027A48'; // Green

            scoreValEl.textContent = `${score}%`;
            scoreValEl.style.color = color;
            scoreValEl.title = `${completedTasks} of ${totalTasks} tasks completed this week`;

            if (scoreDetailsEl) {
                scoreDetailsEl.textContent = `${completedTasks} of ${totalTasks} tasks completed this week`;
            }
        } else {
            scoreValEl.textContent = 'No Plan';
            scoreValEl.style.color = 'var(--color-text-muted)';
            scoreValEl.title = 'No active plan or tasks logged for this week';
            if (scoreDetailsEl) {
                scoreDetailsEl.textContent = 'Please plan your week to start tracking';
            }
        }
    }

    // Redo one week (Pro). The button only exists for accounts that can use it —
    // base accounts get the lock beside it instead, which opens the Pro modal
    // through the delegated handler in proGate.js rather than through this one.
    const btnRedoWeek = document.querySelector('.btn-redo-week');
    if (btnRedoWeek) {
        btnRedoWeek.addEventListener('click', () => showWeekRegenModal());
    }

    // Regenerate Plan Logic
    const btnRegen = document.querySelector('.btn-regenerate-plan');
    const regenSpinner = document.getElementById('dash-regen-spinner');
    if (btnRegen) {
        btnRegen.addEventListener('click', async (e) => {
            // Held in a local: currentTarget is null once the handler has awaited,
            // and everything below this point runs after at least one await.
            const btn = e.currentTarget;
            const confirmed = await showConfirm(
                "This replaces the weeks you haven't started yet with a fresh plan. Weeks you've already applied are kept.",
                { title: 'Regenerate your 90-Day Plan?', confirmText: 'Regenerate' }
            );
            if (!confirmed) return;

            if (regenSpinner) regenSpinner.style.display = 'block';
            btn.disabled = true;

            try {
                const plan = await generate90DayActionPlan();
                if (plan) {
                    applyGeneratedPlan(plan);
                    showToast('Your 90-Day Plan has been regenerated');
                    rerenderScreen();
                } else {
                    showToast("Couldn't generate your plan right now. Please try again in a moment.", 'error');
                }
            } catch (err) {
                console.error(err);
                showToast("Couldn't generate your plan right now. Please try again in a moment.", 'error');
            } finally {
                if (regenSpinner) regenSpinner.style.display = 'none';
                btn.disabled = false;
            }
        });
    }



    [0, 1, 2].forEach(i => {
        const checkbox = document.getElementById(`daily-task-${i}`);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                const updatedStore = getStore();
                let log = updatedStore.dailyLogs[todayStr] || [];
                if (log[i]) {
                    log[i].done = e.target.checked;
                    // Carry the existing stamp through. Dropping it would make the
                    // tasks look like they came from a different plan on the next
                    // render, which would rebuild them and throw away the tick
                    // that was just made.
                    updateDailyLog(todayStr, log, (updatedStore.dailyLogSources || {})[todayStr]);

                    // Check if all 3 are completed and firstDaily3Completed is not set
                    const allDone = log.length === 3 && log.every(t => t.done);
                    if (allDone && !updatedStore.profile?.firstDaily3Completed) {
                        updateProfile({ firstDaily3Completed: true });
                        const modal = document.getElementById('daily3-celebration-modal');
                        if (modal) {
                            modal.style.display = 'flex';
                        }
                    } else {
                        // Rerender dashboard to apply strikethrough styling and coach engine updates safely
                        window.dispatchEvent(new Event('hashchange'));
                    }
                }
            });
        }
    });

    const closeCelebrationBtn = document.getElementById('btn-close-celebration');
    const celebrationModal = document.getElementById('daily3-celebration-modal');
    if (closeCelebrationBtn && celebrationModal) {
        closeCelebrationBtn.addEventListener('click', () => {
            celebrationModal.style.display = 'none';
            // Reload screen to show completed task changes
            window.dispatchEvent(new Event('hashchange'));
        });
    }

    // Dismiss AI Pulses
    document.querySelectorAll('.btn-dismiss-pulse').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pulseId = e.currentTarget.getAttribute('data-pulse-id');
            sessionStorage.setItem(`dismissPulse_${pulseId}`, 'true');
            // Hide the pulse container immediately to prevent harsh reload
            e.currentTarget.parentElement.style.display = 'none';
        });
    });

    // The [Dev] Load Mock Data button used to sit here, visible to every paying
    // customer. seedMockData() is still exported from store.js for local testing.

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
                    date: parseDateInput(dateStr).toISOString(),
                    notes: ''
                });
                closeModal();
                showToast(`Sale logged: ${getStore().settings?.currency || '$'}${amount.toLocaleString()}`);
                rerenderScreen();
            });
        }
    }
    // One-Tap Add Leads
    document.querySelectorAll('.btn-1tap-lead').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const amount = parseInt(e.target.getAttribute('data-amount'), 10);
            const originalText = e.target.innerHTML;
            e.target.innerHTML = '✅';
            e.target.style.backgroundColor = '#E1FDF4';
            e.target.style.borderColor = '#027A48';
            addLeadEntry({
                amount,
                calls: 0,
                closes: 0,
                source: 'Quick Add Dashboard',
                date: new Date().toISOString()
            });
            showToast(`${amount.toLocaleString()} lead${amount === 1 ? '' : 's'} logged`);
            setTimeout(() => { rerenderScreen(); }, 600);
        });
    });

    // One-Tap Add Revenue Sale (Dropdown)
    document.querySelector('.btn-1tap-sale-dropdown')?.addEventListener('click', (e) => {
        const select = document.getElementById('dashboard-1tap-select');
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
                source: offerConf.source || 'Dashboard 1-Tap',
                offer: offerConf.name,
                date: new Date().toISOString(),
                notes: '1-Tap entry'
            });
            const currency = store.settings?.currency || '$';
            showToast(`Sale logged: ${currency}${(parseFloat(offerConf.price) || 0).toLocaleString()}`);
            setTimeout(() => { rerenderScreen(); }, 600);
        }
    });

    // Copy Follow-up Template
    document.querySelector('.btn-copy-followup')?.addEventListener('click', (e) => {
        const template = "Hi {Name},\\n\\nI'm getting in touch because...";
        const btn = e.currentTarget;
        // Clipboard access needs a secure context, so keep a fallback that at
        // least puts the template where it can be copied by hand.
        const fallback = () => showToast('Follow-up template: ' + template, 'info', 8000);
        try {
            navigator.clipboard.writeText(template).then(() => {
                btn.innerHTML = '✅ Copied to Clipboard!';
                setTimeout(() => { btn.innerHTML = '✉️ Copy Follow-up Template'; }, 2000);
            }).catch(fallback);
        } catch (err) {
            fallback();
        }
    });
}
