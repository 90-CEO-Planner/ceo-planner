window.addEventListener('error', function(e) {
    document.body.innerHTML += '<div style="color:red; background:white; position:absolute; top:0; left:0; z-index:9999; padding:20px; border:2px solid red;"><h1>Global Error Caught</h1><p>' + e.message + '</p><p>Line: ' + e.lineno + '</p><p>Col: ' + e.colno + '</p><pre>' + (e.error ? e.error.stack : '') + '</pre></div>';
});
// --- js\supabaseClient.js ---
// supabaseClient.js

const SUPABASE_URL = 'https://ekzpbpoadiktlflcrrwm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9wfISELg1l53KvwhNlZ6Iw_BeGy7QS5';

// Initialize the Supabase client attached to the global window
window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// --- js\store.js ---
// store.js

const STORE_KEY = 'ceoPlanner_store';

const defaultState = {
    profile: {
        name: '',
        businessName: '',
        logo: '',
        stage: '', // e.g., 'beginner', 'growth'
        businessModel: '',
        bottleneck: '',
        strategyMode: '', // Phase 2: 'First Sale Sprint', 'Offer Launch Quarter', 'Audience Growth Quarter', 'CEO Reset'
        planningDay: 'Monday',
        reminderTimes: []
    },
    goals: {
        focus: '',
        outcome: '',
        priorities: ['', '', ''],
        milestones: { month1: '', month2: '', month3: '' },
        statement: ''
    },
    yearlyGoals: {
        revenue: 0,
        audience: 0
    },
    revenue: {
        quarterlyGoal: 0,
        averageOfferPrice: 0,
        entries: [] // Array of { id, date, weekStart, amount, notes }
    },
    weeklyPlans: [], // Array of plan objects
    reviews: [], // Array of review objects
    monthlyReviews: [], // Array of monthly review objects
    dailyLogs: {}, // Dict of { "2023-11-20": [{text: "Task 1", done: false}, ...] }
    streak: 0, // Friday Review Streak
    planningStreak: 0 // Monday Plan Streak
};

function getStore() {
    try {
        const data = localStorage.getItem(STORE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            const finalStore = {
                ...defaultState,
                ...parsed,
                profile: { ...defaultState.profile, ...(parsed.profile || {}) },
                goals: { ...defaultState.goals, ...(parsed.goals || {}) },
                revenue: { ...defaultState.revenue, ...(parsed.revenue || {}) },
                weeklyPlans: parsed.weeklyPlans || [],
                reviews: parsed.reviews || [],
                monthlyReviews: parsed.monthlyReviews || [],
                dailyLogs: parsed.dailyLogs || {}
            };
            
            // Retroactively assign IDs to legacy revenue entries so they can be securely deleted
            let needsReSave = false;
            if (finalStore.revenue && finalStore.revenue.entries) {
                finalStore.revenue.entries.forEach((entry, idx) => {
                    if (!entry.id) {
                        entry.id = 'legacy_' + Date.now() + '_' + idx;
                        needsReSave = true;
                    }
                });
            }
            if (needsReSave) {
                localStorage.setItem(STORE_KEY, JSON.stringify(finalStore));
            }

            return finalStore;
        }
    } catch (e) {
        console.error("Failed to load store from LocalStorage", e);
    }
    return defaultState;
}

function saveStore(state) {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
        
        // Fire-and-forget background cloud sync
        if (localStorage.getItem('ceo_auth') === 'true') {
            db.auth.getSession().then(({ data: sessionData }) => {
                if (sessionData && sessionData.session) {
                    const user = sessionData.session.user;
                    db.from('user_data').upsert({
                        user_id: user.id,
                        data: state
                    }).then(({ error }) => {
                        if (error) console.error("Background cloud sync failed", error);
                    });
                }
            });
        }
    } catch (e) {
        console.error("Failed to save store to LocalStorage", e);
    }
}

function updateProfile(profileData) {
    const store = getStore();
    store.profile = { ...store.profile, ...profileData };
    saveStore(store);
}

function updateGoals(goalsData) {
    const store = getStore();
    store.goals = { ...store.goals, ...goalsData };
    saveStore(store);
}

function updateRevenueSettings(settings) {
    const store = getStore();
    store.revenue = { ...store.revenue, ...settings };
    saveStore(store);
}

function addRevenueEntry(entry) {
    const store = getStore();
    entry.id = Date.now().toString();
    entry.date = entry.date || new Date().toISOString();
    store.revenue.entries.push(entry);
    saveStore(store);
}

function deleteRevenueEntry(id) {
    const store = getStore();
    const initialLen = store.revenue.entries.length;
    store.revenue.entries = store.revenue.entries.filter(e => String(e.id) !== String(id));
    saveStore(store);
    return store.revenue.entries.length < initialLen;
}

function getRevenueInsights() {
    const store = getStore();
    const rev = store.revenue;
    const goal = parseFloat(rev.quarterlyGoal) || 0;
    const price = parseFloat(rev.averageOfferPrice) || 0;

    const entries = rev.entries || [];
    const totalRevenue = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate the start of the current week (Monday at 00:00:00)
    const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const revenueThisWeek = entries
        .filter(e => {
            const d = new Date(e.date);
            return d.getTime() >= startOfWeek.getTime();
        })
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const revenueThisMonth = entries
        .filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    // Quarter Progress
    const progressPercent = goal > 0 ? (totalRevenue / goal) * 100 : 0;

    // Month Progress
    const monthTarget = goal > 0 ? goal / 3 : 0;
    const monthProgressPercent = monthTarget > 0 ? (revenueThisMonth / monthTarget) * 100 : 0;

    // Weekly Target
    let weeklyTargetLength = goal > 0 ? goal / 12 : 0;

    // Required
    const salesRequired = price > 0 ? Math.ceil(goal / price) : 0;
    const salesMade = price > 0 ? Math.floor(totalRevenue / price) : 0;

    // Projects & Momentum
    const Q_WEEKS = 12;
    const entriesCount = entries.length;
    let projectedRevenue = 0;
    let momentum = 'Not enough data';
    let insightText = "Log more revenue entries with their sources to generate actionable insights.";

    // Track Sources and Offers
    const revenueBySourceMonth = {};
    const revenueByOfferMonth = {};
    const revenueBySourceQuarter = {};
    const revenueByOfferQuarter = {};

    entries.forEach(e => {
        const amt = parseFloat(e.amount) || 0;
        const src = e.source || 'Other';
        const off = e.offer || 'General';
        const d = new Date(e.date);

        // Quarter total
        revenueBySourceQuarter[src] = (revenueBySourceQuarter[src] || 0) + amt;
        revenueByOfferQuarter[off] = (revenueByOfferQuarter[off] || 0) + amt;

        // Month total
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            revenueBySourceMonth[src] = (revenueBySourceMonth[src] || 0) + amt;
            revenueByOfferMonth[off] = (revenueByOfferMonth[off] || 0) + amt;
        }
    });

    // Find Top Source and Top Offer
    const topSource = Object.keys(revenueBySourceQuarter).length > 0 ?
        Object.keys(revenueBySourceQuarter).reduce((a, b) => revenueBySourceQuarter[a] > revenueBySourceQuarter[b] ? a : b) : 'None';

    const topOffer = Object.keys(revenueByOfferQuarter).length > 0 ?
        Object.keys(revenueByOfferQuarter).reduce((a, b) => revenueByOfferQuarter[a] > revenueByOfferQuarter[b] ? a : b) : 'None';

    if (entriesCount > 0) {
        const avgPerWeek = totalRevenue / entriesCount;
        projectedRevenue = avgPerWeek * Q_WEEKS;

        // Calculate remaining weekly target dynamically based on pace
        const remainingRevenue = Math.max(0, goal - totalRevenue);
        const remainingWeeks = Math.max(1, Q_WEEKS - entriesCount);
        weeklyTargetLength = remainingRevenue / remainingWeeks;

        // Momentum
        if (projectedRevenue >= goal) {
            momentum = 'Ahead 🎉';
        } else if (projectedRevenue >= goal * 0.9) {
            momentum = 'On Track';
        } else {
            momentum = 'Behind';
        }

        // Advanced Insight Generation heuristics bridging activity to revenue
        if (store.weeklyPlans && store.weeklyPlans.length > 0) {
            const recentPlan = store.weeklyPlans[store.weeklyPlans.length - 1];
            const hasVisibility = recentPlan.visibilityAction?.length > 10;
            const hasOffers = recentPlan.revenueAction?.length > 10;
            const hasFollowUps = recentPlan.followUps?.length > 10;

            if (revenueThisWeek > 0) {
                let drivers = [];
                if (hasOffers) drivers.push("direct offers");
                if (hasVisibility) drivers.push("visibility efforts");
                if (hasFollowUps) drivers.push("diligent follow-ups");
                insightText = `Momentum Alert: Your recent conversion of $${revenueThisWeek.toLocaleString()} correlates highly with your focus on ${drivers.join(' and ') || 'recent actions'}. Keep executing this mix to maintain the momentum.`;
            } else if (entriesCount > 0 && revenueThisWeek === 0) {
                if (!hasOffers && !hasFollowUps) {
                    insightText = `Bottleneck Detected: Your activity level is high, but without direct invitations or follow-ups, revenue is stalling. Suggestion: Dedicate your next work block to making 3 direct offers.`;
                } else {
                    insightText = `Sales Cycle Insight: You are planting seeds with your recent visibility and offers. Shift your focus to targeted follow-ups this week.`;
                }
            } else if (entriesCount >= 3 && progressPercent < 25) {
                insightText = `Warning: Behind pace. Review your main offer: is the pricing aligned with your audience?`;
            }
        }

        // Enhance insights with source data if available
        if (Object.keys(revenueBySourceMonth).length > 0 && Math.random() > 0.5) {
            // Mention the top source for the month
            const topMonthSource = Object.keys(revenueBySourceMonth).reduce((a, b) => revenueBySourceMonth[a] > revenueBySourceMonth[b] ? a : b);
            const amtMonth = revenueBySourceMonth[topMonthSource];
            const pctMonth = Math.round((amtMonth / (revenueThisMonth || 1)) * 100);
            if (pctMonth > 30) {
                insightText = `Insight: ${pctMonth}% of your revenue this month came from ${topMonthSource}. Double down on what's working!`;
            }
        } else if (topSource !== 'None' && topSource !== 'Other' && Math.random() > 0.5) {
            insightText = `Insight: Your highest-converting source this quarter is ${topSource}. Make sure your weekly plan includes actions for that channel.`;
        }
    } else {
        weeklyTargetLength = goal > 0 ? goal / Q_WEEKS : 0;
    }

    return {
        totalRevenue,
        revenueThisWeek,
        revenueThisMonth,
        goal,
        monthTarget,
        progressPercent: Math.min(100, progressPercent),
        monthProgressPercent: Math.min(100, monthProgressPercent),
        salesRequired,
        salesMade,
        salesRemaining: Math.max(0, salesRequired - salesMade),
        projectedRevenue,
        weeklyTargetLength,
        momentum,
        insightText,
        revenueBySourceMonth,
        revenueByOfferMonth,
        revenueBySourceQuarter,
        revenueByOfferQuarter,
        topSource,
        topOffer,
        entries: entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date)) // newest first
    };
}

function addWeeklyPlan(plan) {
    const store = getStore();
    plan.id = Date.now().toString();
    plan.date = new Date().toISOString();
    store.weeklyPlans.push(plan);

    // Recalculate planning streak based on consecutive weeks
    store.planningStreak = calculateStreak(store.weeklyPlans);

    saveStore(store);
}

function updateWeeklyPlan(planId, updatedFields) {
    const store = getStore();
    const index = store.weeklyPlans.findIndex(p => p.id === planId);
    if (index !== -1) {
        store.weeklyPlans[index] = { ...store.weeklyPlans[index], ...updatedFields };
        saveStore(store);
    }
}

function updateDailyLog(dateStr, tasks) {
    const store = getStore();
    store.dailyLogs[dateStr] = tasks;
    saveStore(store);
}

function addReview(review) {
    const store = getStore();
    review.id = Date.now().toString();
    review.date = new Date().toISOString();
    store.reviews.push(review);

    // Recalculate streak based on consecutive weeks
    store.streak = calculateStreak(store.reviews);
    saveStore(store);
}

function addMonthlyReview(review) {
    const store = getStore();
    review.id = Date.now().toString();
    review.date = new Date().toISOString();
    store.monthlyReviews.push(review);
    saveStore(store);
}

function calculateStreak(reviews) {
    if (!reviews || reviews.length === 0) return 0;

    // Sort reviews by date descending (newest first)
    const sorted = [...reviews].sort((a, b) => new Date(b.date) - new Date(a.date));

    let streak = 0;
    let currentDate = new Date();

    // Check if there's a review from this week or last week to start the streak
    const daysSinceMostRecent = Math.floor((currentDate - new Date(sorted[0].date)) / (1000 * 60 * 60 * 24));
    if (daysSinceMostRecent > 14) {
        return 0; // Streak broken if no review in last 2 weeks
    }

    let previousReviewDate = null;

    for (const review of sorted) {
        const reviewDate = new Date(review.date);

        if (!previousReviewDate) {
            streak++;
            previousReviewDate = reviewDate;
            continue;
        }

        // Calculate days between this review and the previous one we checked
        const daysDifference = Math.floor((previousReviewDate - reviewDate) / (1000 * 60 * 60 * 24));

        // If it's roughly a week apart (allowing some fudge factor for early/late days)
        if (daysDifference > 0 && daysDifference <= 14) {
            streak++;
            previousReviewDate = reviewDate;
        } else {
            // Gap is too big, streak is broken
            break;
        }
    }

    return streak;
}

function resetQuarter() {
    const store = getStore();

    // Archive current goals if they exist
    if (store.goals && store.goals.focus) {
        store.pastQuarters = store.pastQuarters || [];
        store.pastQuarters.push({
            dateArchived: new Date().toISOString(),
            goals: { ...store.goals },
            reviewsCount: store.reviews.length,
            plansCount: store.weeklyPlans.length,
            dailyLogs: store.dailyLogs ? { ...store.dailyLogs } : {}
        });
    }

    // Reset goals to default
    store.goals = {
        focus: '',
        outcome: '',
        priorities: ['', '', ''],
        milestones: { month1: '', month2: '', month3: '' },
        statement: ''
    };

    // Reset Revenue
    if (store.revenue) {
        store.revenue.entries = [];
    }

    // Clear weekly plans for the new quarter start, keep reviews for wins history
    store.weeklyPlans = [];

    // Clear daily action history active log
    store.dailyLogs = {};

    saveStore(store);
}

// Seed mock data for demo mode
function seedMockData() {
    const store = getStore();
    store.profile = {
        stage: 'growth',
        businessModel: 'Coaching/Consulting',
        bottleneck: 'Lead Generation',
        planningDay: 'Monday',
        reminderTimes: ['weekly_plan']
    };
    store.goals = {
        focus: 'Launch Signature Group Program',
        outcome: 'Enrol 10 founding members and generate $15k',
        priorities: ['Finalize program curriculum', 'Run a 3-day challenge funnel', 'Direct outreach to warm leads'],
        milestones: {
            month1: 'Build curriculum & sales page',
            month2: 'Run marketing sprint & challenge',
            month3: 'Onboard members & deliver week 1-2'
        },
        statement: 'As a CEO, I commit to showing up visible and leading my launch with confidence.'
    };

    // Add a past review to show history
    store.reviews = [{
        id: 'mock_1',
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        movedForward: 'Finished the challenge workbook',
        workedWell: 'Got 50 signups from IG reel',
        difficult: 'Writing the email sequence took way too long',
        leads: '50 new leads',
        nextWeekImprove: 'Block specific time for writing instead of fitting it in'
    }];

    store.streak = 2;

    // Seed Revenue Data
    store.revenue = {
        quarterlyGoal: 15000,
        averageOfferPrice: 1500,
        entries: [
            {
                id: 'rev_1',
                date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                amount: 1500,
                notes: 'Founding member signup from old list (Last Month)'
            },
            {
                id: 'rev_2',
                date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
                amount: 3000,
                notes: '2 signups from email list (This Month)'
            },
            {
                id: 'rev_3',
                date: new Date().toISOString(),
                amount: 1500,
                notes: 'New IG Client (This Week)'
            }
        ]
    };

    // Ensure weekly plans exist for the insight correlation
    if (!store.weeklyPlans || store.weeklyPlans.length === 0) {
        store.weeklyPlans = [{
            id: 'wp_1',
            date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
            visibilityAction: 'Hosted IG Live Series',
            revenueAction: 'Pitched beta offer on live',
            followUps: 'Followed up with 10 commenters'
        }];
    }

    saveStore(store);
}


// --- js\components\nav.js ---
// nav.js

function renderNav() {
    const store = getStore();
    const bName = store.profile?.businessName || 'CEO Planner';
    const logoSrc = store.profile?.logo;

    return `
        <header class="app-header">
            <div class="logo">
                ${logoSrc 
                    ? `<img src="${logoSrc}" alt="Logo" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover; margin-right: 0.5rem;" />` 
                    : `<div class="logo-icon"></div>`}
                <span>${bName}</span>
            </div>
            <nav class="nav-links">
                <a href="#/dashboard" class="nav-link" id="nav-dashboard">Dashboard</a>
                <a href="#/planner" class="nav-link" id="nav-planner">Weekly Plan</a>
                <a href="#/revenue" class="nav-link" id="nav-revenue">Revenue</a>
                <a href="#/review" class="nav-link" id="nav-review">Friday Review</a>
                <a href="#/coach" class="nav-link" id="nav-coach">AI Coach</a>
                <a href="#/monthly-review" class="nav-link" id="nav-monthly-review">Monthly Review</a>
                <a href="#/progress" class="nav-link" id="nav-progress">Wins & Progress</a>
                <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                    <a href="#/settings" class="nav-link" id="nav-settings" style="display: flex; gap: 0.5rem; align-items: center;">⚙️ Settings</a>
                    <a href="#" class="nav-link" onclick="localStorage.removeItem('ceo_auth'); localStorage.removeItem('ceoPlanner_store'); window.location.hash='#/login'; window.location.reload(); return false;" style="color: #FCA5A5; display: flex; gap: 0.5rem; align-items: center;">🚪 Log Out</a>
                </div>
            </nav>
        </header>
    `;
}


// --- js\components\tooltip.js ---
// tooltip.js

function renderTooltip(whatStr, whyStr) {
    // Generate a unique ID for aria properties
    const id = 'tt_' + Math.random().toString(36).substr(2, 9);

    return `
        <span class="tooltip-container" tabindex="0" aria-describedby="${id}">
            <svg class="info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span class="tooltip-content" id="${id}" role="tooltip">
                <span class="tooltip-section">
                    <strong>What it is:</strong> ${whatStr}
                </span>
                <span class="tooltip-section">
                    <strong>Why it matters:</strong> ${whyStr}
                </span>
            </span>
        </span>
    `;
}


// --- js\screens\welcome.js ---
// welcome.js

function renderWelcome() {
    // We bind the event listeners after HTML is rendered using setScreenModule
    window.setScreenModule({ attachEvents: welcomeAttachEvents });

    return `
        <div class="main-content" style="max-width: 600px; padding-top: 10vh;">
            <div class="card text-center">
                <div class="logo-icon" style="margin: 0 auto; margin-bottom: 1rem; width: 48px; height: 48px; border-radius: 0.5rem; background-color: var(--color-primary);"></div>
                <h1 style="color: var(--color-primary-dark); margin-bottom: 0.5rem;">Welcome to the 90-Day CEO Planner</h1>
                <p style="color: var(--color-text-muted); margin-bottom: 2rem;">A calm, focused space to plan your next 90 days, execute your weekly priorities, and grow your online business without the overwhelm.</p>
                
                <form id="welcome-form" style="text-align: left;">
                    <div class="form-group">
                        <label class="form-label">What best describes your business stage?</label>
                        <select class="form-select" id="profile-stage" required>
                            <option value="">Select a stage...</option>
                            <option value="Just starting (pre-revenue)">Just starting (pre-revenue)</option>
                            <option value="Building consistency ($1k-$5k/mo)">Building consistency ($1k-$5k/mo)</option>
                            <option value="Scaling ($5k+/mo)">Scaling ($5k+/mo)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">What is your primary business model?</label>
                        <select class="form-select" id="profile-model" required>
                            <option value="">Select a model...</option>
                            <option value="1:1 Services/Freelancing">1:1 Services/Freelancing</option>
                            <option value="Coaching/Consulting">Coaching/Consulting</option>
                            <option value="Digital Products/Courses">Digital Products/Courses</option>
                            <option value="E-commerce">E-commerce</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">What feels like your biggest bottleneck right now?</label>
                        <textarea class="form-textarea" id="profile-bottleneck" placeholder="e.g., getting consistent leads, finding time to create content..." required></textarea>
                    </div>

                    <div class="flex justify-center mt-8">
                        <button type="submit" class="btn btn-primary" style="width: 100%;">Start Planning Like a CEO</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function welcomeAttachEvents() {
    const form = document.getElementById('welcome-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const stage = document.getElementById('profile-stage').value;
            const model = document.getElementById('profile-model').value;
            const bottleneck = document.getElementById('profile-bottleneck').value;

            updateProfile({ stage, businessModel: model, bottleneck });

            // Navigate to 90-day setup wizard
            window.location.hash = '#/wizard';
        });
    }
}


// --- js\screens\wizard.js ---
// wizard.js

let currentStep = 1;
const TOTAL_STEPS = 6;

function renderWizard() {
    window.setScreenModule({ attachEvents: wizardAttachEvents });
    return `
        <div class="main-content" style="max-width: 700px; padding-top: 5vh;">
            <div style="margin-bottom: 2rem;">
                <h2 style="color: var(--color-black);">Build Your 90-Day CEO Plan</h2>
                <p style="color: var(--color-text-muted);">Step ${currentStep} of 6</p>
            </div>

            <div class="wizard-progress">
                <div class="wizard-step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}">1</div>
                <div class="wizard-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}">2</div>
                <div class="wizard-step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}">3</div>
                <div class="wizard-step ${currentStep >= 4 ? 'active' : ''} ${currentStep > 4 ? 'completed' : ''}">4</div>
                <div class="wizard-step ${currentStep >= 5 ? 'active' : ''} ${currentStep > 5 ? 'completed' : ''}">5</div>
                <div class="wizard-step ${currentStep >= 6 ? 'active' : ''}">6</div>
            </div>

            <div class="card" id="wizard-content">
                ${renderStepContent()}
            </div>
        </div>
    `;
}

function renderStepContent() {
    const store = getStore();
    const g = store.goals;

    if (currentStep === 1) {
        return `
            <h3 class="mb-2">Your Workspace</h3>
            <p class="form-helper mb-6" style="font-size: 0.9rem;">Let's customize your command center.</p>
            
            <form id="wizard-form-1">
                <div class="form-group">
                    <label class="form-label">Your Name</label>
                    <input type="text" class="form-input" id="profile-name" value="${store.profile?.name || ''}" placeholder="e.g., Jen" required />
                </div>
                <div class="form-group">
                    <label class="form-label">Business Name</label>
                    <input type="text" class="form-input" id="profile-business" value="${store.profile?.businessName || ''}" placeholder="e.g., The Marketing Co." required />
                </div>
                <div class="form-group mt-6">
                    <label class="form-label">Business Logo (Optional)</label>
                    <input type="file" class="form-input" id="logo-upload" accept="image/*" style="padding: 0.5rem;" />
                    <span class="form-helper">Upload a square image to display in your navigation bar.</span>
                </div>
                <div class="flex justify-between mt-8">
                    <button type="button" class="btn btn-ghost" disabled>Back</button>
                    <button type="submit" class="btn btn-primary">Next Step</button>
                </div>
            </form>
        `;
    }

    if (currentStep === 2) {
        return `
            <h3 class="mb-2">Define your 90-Day Focus</h3>
            <p class="form-helper mb-6" style="font-size: 0.9rem;">What is the ONE main objective you are driving towards? A tight focus prevents idea-hopping.</p>
            
            <form id="wizard-form-2">
                <div class="form-group">
                    <label class="form-label">90-Day Focus Theme</label>
                    <input type="text" class="form-input" id="goal-focus" value="${g.focus}" placeholder="e.g., Launch Signature Course, Double Email List" required />
                </div>
                <div class="form-group">
                    <label class="form-label">Measurable Outcome</label>
                    <input type="text" class="form-input" id="goal-outcome" value="${g.outcome}" placeholder="e.g., 20 new sales, 1,000 new subscribers" required />
                    <span class="form-helper">How will you objectively know you succeeded?</span>
                </div>
                <div class="form-group mt-6">
                    <label class="form-label" style="color: var(--color-primary-dark);">CEO Strategy Mode</label>
                    <p class="form-helper mb-2">Select your primary mode for the quarter. We'll use this to tailor your coaching prompts.</p>
                    <select class="form-input" id="strategy-mode" required style="padding: 0.75rem; border-color: var(--color-primary-light);">
                        <option value="" disabled ${!store.profile?.strategyMode ? 'selected' : ''}>Select a Strategy Mode...</option>
                        <option value="First Sale Sprint" ${store.profile?.strategyMode === 'First Sale Sprint' ? 'selected' : ''}>First Sale Sprint</option>
                        <option value="Offer Launch Quarter" ${store.profile?.strategyMode === 'Offer Launch Quarter' ? 'selected' : ''}>Offer Launch Quarter</option>
                        <option value="Visibility & Lead Gen Quarter" ${store.profile?.strategyMode === 'Visibility & Lead Gen Quarter' ? 'selected' : ''}>Visibility & Lead Gen Quarter</option>
                        <option value="Systems & CEO Reset Quarter" ${store.profile?.strategyMode === 'Systems & CEO Reset Quarter' ? 'selected' : ''}>Systems & CEO Reset Quarter</option>
                    </select>
                </div>
                <div class="flex justify-between mt-8">
                    <button type="button" class="btn btn-ghost" id="btn-back">Back</button>
                    <button type="submit" class="btn btn-primary">Next Step</button>
                </div>
            </form>
        `;
    }

    if (currentStep === 3) {
        return `
            <h3 class="mb-2">Choose Your Top 3 Priorities</h3>
            <p class="form-helper mb-6" style="font-size: 0.9rem;">To achieve your focus, what are the three big rock projects that move the needle?</p>
            
            <form id="wizard-form-3">
                <div class="form-group">
                    <label class="form-label">Priority 1</label>
                    <input type="text" class="form-input" id="p1" value="${g.priorities[0]}" placeholder="e.g., Build course sales page" required />
                </div>
                <div class="form-group">
                    <label class="form-label">Priority 2</label>
                    <input type="text" class="form-input" id="p2" value="${g.priorities[1]}" placeholder="e.g., Map out 4-week launch email sequence" />
                </div>
                <div class="form-group">
                    <label class="form-label">Priority 3</label>
                    <input type="text" class="form-input" id="p3" value="${g.priorities[2]}" placeholder="e.g., Host weekly IG live Q&As" />
                </div>
                <div class="flex justify-between mt-8">
                    <button type="button" class="btn btn-ghost" id="btn-back">Back</button>
                    <button type="submit" class="btn btn-primary">Next Step</button>
                </div>
            </form>
        `;
    }

    if (currentStep === 4) {
        return `
            <h3 class="mb-2">Break It Into Milestones</h3>
            <p class="form-helper mb-6" style="font-size: 0.9rem;">What needs to happen each month so you stay on track for your 90-day outcome?</p>
            
            <form id="wizard-form-4">
                <div class="form-group">
                    <label class="form-label" style="color: var(--color-primary-dark);">Month 1 Focus</label>
                    <input type="text" class="form-input" id="m1" value="${g.milestones.month1}" placeholder="e.g., Complete curriculum outline" required />
                </div>
                <div class="form-group">
                    <label class="form-label" style="color: var(--color-secondary-dark);">Month 2 Focus</label>
                    <input type="text" class="form-input" id="m2" value="${g.milestones.month2}" placeholder="e.g., Launch beta & open cart" />
                </div>
                <div class="form-group">
                    <label class="form-label" style="color: var(--color-accent-dark);">Month 3 Focus</label>
                    <input type="text" class="form-input" id="m3" value="${g.milestones.month3}" placeholder="e.g., Deliver program & collect testimonials" />
                </div>
                <div class="flex justify-between mt-8">
                    <button type="button" class="btn btn-ghost" id="btn-back">Back</button>
                    <button type="submit" class="btn btn-primary">Next Step</button>
                </div>
            </form>
        `;
    }

    if (currentStep === 5) {
        return `
            <h3 class="mb-2">Set Your Revenue Target</h3>
            <p class="form-helper mb-6" style="font-size: 0.9rem;">What is your quarterly revenue goal, and what is the average price of your offer?</p>
            
            <form id="wizard-form-5">
                <div class="form-group">
                    <label class="form-label" style="color: var(--color-primary-dark);">Quarterly Revenue Goal ($)</label>
                    <input type="number" class="form-input" id="rev-goal" value="${store.revenue?.quarterlyGoal || ''}" min="0" step="100" placeholder="e.g. 15000" required />
                </div>
                <div class="form-group">
                    <label class="form-label">Average Offer Price ($)</label>
                    <input type="number" class="form-input" id="offer-price" value="${store.revenue?.averageOfferPrice || ''}" min="0" step="any" placeholder="e.g. 1500" required />
                    <span class="form-helper mt-1" style="display: block;">We'll use this to calculate how many sales you need.</span>
                </div>
                <div class="flex justify-between mt-8">
                    <button type="button" class="btn btn-ghost" id="btn-back">Back</button>
                    <button type="submit" class="btn btn-primary">Next Step</button>
                </div>
            </form>
        `;
    }

    if (currentStep === 6) {
        return `
            <h3 class="mb-2">The CEO Commitment</h3>
            <p class="form-helper mb-6" style="font-size: 0.9rem;">Write a statement affirming how you choose to run your business in this season.</p>
            
            <form id="wizard-form-6">
                <div class="form-group">
                    <label class="form-label">I commit to...</label>
                    <textarea class="form-textarea" id="goal-statement" placeholder="e.g., I commit to prioritising my top tasks before checking email, and trusting my strategy." required>${g.statement}</textarea>
                </div>
                
                <div style="background: var(--color-secondary-light); padding: 1rem; border-radius: var(--radius-md); border-left: 4px solid var(--color-secondary); margin-bottom: var(--spacing-lg);">
                    <p style="font-size: 0.875rem; font-weight: 500; color: var(--color-secondary-dark);">You are ready!</p>
                    <p style="font-size: 0.875rem; color: var(--color-text-main); margin-top: 0.25rem;">Your 90-Day plan is locked in. Let's go to your CEO Dashboard.</p>
                </div>

                <div class="flex justify-between mt-8">
                    <button type="button" class="btn btn-ghost" id="btn-back">Back</button>
                    <button type="submit" class="btn btn-primary">Complete Setup</button>
                </div>
            </form>
        `;
    }
}

function wizardAttachEvents() {
    // Determine which form is active based on currentStep
    const form = document.getElementById(`wizard-form-${currentStep}`);
    const btnBack = document.getElementById('btn-back');

    if (btnBack) {
        btnBack.addEventListener('click', () => {
            if (currentStep > 1) {
                currentStep--;

                // Triggers a re-render of the specific screen since simple router doesn't know about inner state
                const appContainer = document.getElementById('app-container');
                appContainer.innerHTML = renderWizard();
                wizardAttachEvents();
            }
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const store = getStore();
            const currentGoals = store.goals;

            if (currentStep === 1) {
                const name = document.getElementById('profile-name').value;
                const businessName = document.getElementById('profile-business').value;
                const logoFile = document.getElementById('logo-upload').files[0];

                const advance = (logoData) => {
                    updateProfile({ name, businessName, ...(logoData && { logo: logoData }) });
                    currentStep++;
                    document.getElementById('app-container').innerHTML = renderWizard();
                    wizardAttachEvents();
                };

                if (logoFile) {
                    const reader = new FileReader();
                    reader.onload = (e) => advance(e.target.result);
                    reader.readAsDataURL(logoFile);
                } else {
                    advance(null);
                }
            }
            else if (currentStep === 2) {
                currentGoals.focus = document.getElementById('goal-focus').value;
                currentGoals.outcome = document.getElementById('goal-outcome').value;
                updateGoals(currentGoals);

                const strategyMode = document.getElementById('strategy-mode').value;
                updateProfile({ strategyMode });

                currentStep++;
                document.getElementById('app-container').innerHTML = renderWizard();
                wizardAttachEvents();
            }
            else if (currentStep === 3) {
                currentGoals.priorities = [
                    document.getElementById('p1').value,
                    document.getElementById('p2').value,
                    document.getElementById('p3').value
                ];
                updateGoals(currentGoals);
                currentStep++;
                document.getElementById('app-container').innerHTML = renderWizard();
                wizardAttachEvents();
            }
            else if (currentStep === 4) {
                currentGoals.milestones = {
                    month1: document.getElementById('m1').value,
                    month2: document.getElementById('m2').value,
                    month3: document.getElementById('m3').value
                };
                updateGoals(currentGoals);
                currentStep++;
                document.getElementById('app-container').innerHTML = renderWizard();
                wizardAttachEvents();
            }
            else if (currentStep === 5) {
                updateRevenueSettings({
                    quarterlyGoal: parseFloat(document.getElementById('rev-goal').value),
                    averageOfferPrice: parseFloat(document.getElementById('offer-price').value)
                });
                currentStep++;
                document.getElementById('app-container').innerHTML = renderWizard();
                wizardAttachEvents();
            }
            else if (currentStep === 6) {
                currentGoals.statement = document.getElementById('goal-statement').value;
                updateGoals(currentGoals);

                // Done! Go to dashboard
                currentStep = 1; // reset for future
                window.location.hash = '#/dashboard';
            }
        });
    }
}


// --- js\screens\dashboard.js ---

function renderDashboard() {
    window.setScreenModule({ attachEvents: dashboardAttachEvents });
    const store = getStore();
    const g = store.goals;
    const streak = store.streak;
    const revInsights = getRevenueInsights();

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
                            $${revInsights.revenueThisWeek.toLocaleString()}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Weekly Target</span>
                        <div style="font-size: 1rem; color: var(--color-text-main); font-weight: 600;">$${revInsights.weeklyTargetLength.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
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
                    <span>$${revInsights.totalRevenue.toLocaleString()} / $${revInsights.goal.toLocaleString()}</span>
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


// --- js\screens\weeklyPlanner.js ---
// weeklyPlanner.js

function renderPlanner() {
    window.setScreenModule({ attachEvents: plannerAttachEvents });
    const store = getStore();
    let activePlan = store.weeklyPlans.length > 0 ? store.weeklyPlans[store.weeklyPlans.length - 1] : null;

    if (activePlan) {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(activePlan.date)) / (1000 * 60 * 60 * 24));
        if (diffDays > 6) {
            activePlan = null;
        }
    }

    const win = activePlan ? activePlan.winCondition : '';
    const p1 = activePlan && activePlan.topActions ? (activePlan.topActions[0] || '') : (store.goals?.priorities?.[0] || '');
    const p2 = activePlan && activePlan.topActions ? (activePlan.topActions[1] || '') : (store.goals?.priorities?.[1] || '');
    const p3 = activePlan && activePlan.topActions ? (activePlan.topActions[2] || '') : (store.goals?.priorities?.[2] || '');
    const rev = activePlan ? activePlan.revenueAction : '';
    const vis = activePlan ? activePlan.visibilityAction : '';
    const fol = activePlan ? activePlan.followUps : '';

    const prompts = getSmartPrompts(store.profile?.strategyMode);

    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 700px;">
            <div style="margin-bottom: 2rem;">
                <h2>Weekly CEO Plan</h2>
                <p style="color: var(--color-text-muted);">Set your intentions and priorities for the week ahead.</p>
            </div>

            ${store.profile?.strategyMode ? `
            <!-- Generated Weekly Focus Insight -->
            <div class="card mb-6" style="background: var(--color-primary-light); border-left: 4px solid var(--color-primary);">
                <div class="flex items-center gap-2 mb-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-dark)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 16 12 12 12 8"></polyline><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <h4 style="margin: 0; color: var(--color-primary-dark);">Suggested Focus for this Strategy Mode</h4>
                </div>
                <p style="font-size: 0.95rem; margin-bottom: 0;">${getSuggestedFocus(store.profile.strategyMode)}</p>
            </div>
            ` : ''}
            
            <!-- AI Planning Assistant Suggestions (always visible) -->
            <div class="card mb-6" style="border-top: 4px solid var(--color-secondary);">
                <div class="flex items-center gap-2 mb-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary-dark)" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M12 7v6"></path><path d="M12 17h.01"></path></svg>
                    <h4 style="margin: 0; color: var(--color-black);">AI Planning Assistant</h4>
                </div>
                <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 0.75rem;">Generated based on your <strong>monthly focus</strong>, priorities, and recent activity to move your business forward.</p>
                <div style="background: var(--color-bg-light); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.95rem; color: var(--color-secondary-dark);">
                    <ul style="margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 0.75rem;">
                        ${generatePlanSuggestions(store).map((s, index) => `
                        <li style="display: flex; gap: 0.75rem; align-items: flex-start; background: #fff; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div style="flex-grow: 1; line-height: 1.4;">
                                <strong style="color: var(--color-primary-dark);">${s.type}:</strong> ${s.action}
                            </div>
                            <button type="button" class="btn btn-outline apply-suggestion-btn" data-type="${s.type.toLowerCase()}" data-action="${s.action}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; flex-shrink: 0;">Apply</button>
                        </li>
                        `).join('')}
                    </ul>
                </div>
                <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 0.75rem; text-align: center;">Steal these ideas or write your own below!</p>
            </div>

            <form id="planner-form" class="card" data-plan-id="${activePlan ? activePlan.id : ''}">
                <div class="form-group">
                    <label class="form-label" style="font-size: 1.1rem; color: var(--color-primary-dark);">${store.profile?.name ? store.profile.name + ", w" : "W"}hat would make this week a win?</label>
                    <textarea class="form-textarea" id="plan-win" placeholder="e.g., Getting 3 sales calls booked and finishing the landing page layout." required>${win}</textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem;">Top 3 Most Important Actions</label>
                    <p class="form-helper mb-2">${store.profile?.name ? store.profile.name + ", w" : "W"}hat three actions would move your business forward this week?</p>
                    <input type="text" class="form-input mb-2" id="pa-1" value="${p1}" placeholder="1." required />
                    <input type="text" class="form-input mb-2" id="pa-2" value="${p2}" placeholder="2." required />
                    <input type="text" class="form-input" id="pa-3" value="${p3}" placeholder="3." required />
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem; color: var(--color-secondary-dark);">Revenue-Generating Actions</label>
                    <p class="form-helper mb-2">${prompts.revenueHelper}</p>
                    <textarea class="form-textarea" id="plan-revenue" style="min-height: 80px;" required>${rev}</textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem; color: var(--color-accent-dark);">Visibility & Marketing</label>
                    <p class="form-helper mb-2">${prompts.visibilityHelper}</p>
                    <textarea class="form-textarea" id="plan-visibility" style="min-height: 80px;" required>${vis}</textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem;">Follow-ups & Conversations</label>
                    <p class="form-helper mb-2">${prompts.followupHelper}</p>
                    <textarea class="form-textarea" id="plan-followup" style="min-height: 80px;" required>${fol}</textarea>
                </div>

                <div class="flex justify-end mt-8">
                    <button type="submit" class="btn btn-primary">${activePlan ? 'Update Weekly Plan' : 'Save Weekly Plan'}</button>
                </div>
            </form>
        </div>
    `;
}

function plannerAttachEvents() {
    // Nav
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-planner')?.classList.add('active');

    // Handle 'Apply' buttons for AI Suggestions
    document.querySelectorAll('.apply-suggestion-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.getAttribute('data-type');
            const actionText = e.target.getAttribute('data-action');

            let targetId = '';
            if (type.includes('revenue')) targetId = 'plan-revenue';
            else if (type.includes('visibility')) targetId = 'plan-visibility';
            else if (type.includes('follow')) targetId = 'plan-followup';
            else {
                // Find the next empty action box (pa-1, pa-2, pa-3) OR one that just has the default 90-day priority text
                const actionBoxes = ['pa-1', 'pa-2', 'pa-3'];
                const store = getStore();
                const defaultPriorities = store.goals?.priorities || [];
                
                for (let i = 0; i < actionBoxes.length; i++) {
                    const id = actionBoxes[i];
                    const el = document.getElementById(id);
                    if (el) {
                        const val = el.value.trim();
                        // Overwrite if it's empty OR if it matches the generic 90-day placeholder
                        if (val === '' || val === (defaultPriorities[i] || '').trim()) {
                            targetId = id;
                            break;
                        }
                    }
                }
                
                if (!targetId) {
                    alert("Your Top 3 Priority slots are all full with custom tasks! Please clear one of the boxes to apply an AI Action suggestion.");
                    return;
                }
            }

            if (targetId) {
                const el = document.getElementById(targetId);
                if (el) {
                    if (targetId.startsWith('pa-')) {
                        // For inputs, just overwrite (since appending a newline breaks input fields)
                        el.value = actionText;
                    } else if (el.value.trim() !== '') {
                        // For textareas (Revenue, Visibility, Follow-up), append
                        el.value += '\n' + actionText;
                    } else {
                        el.value = actionText;
                    }
                    // Visual feedback
                    e.target.textContent = 'Applied ✓';
                    e.target.style.backgroundColor = 'var(--color-primary-light)';
                    e.target.style.color = 'var(--color-primary-dark)';
                    e.target.style.borderColor = 'var(--color-primary-light)';
                    e.target.disabled = true;
                }
            }
        });
    });

    const form = document.getElementById('planner-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const p1 = document.getElementById('pa-1').value;
            const p2 = document.getElementById('pa-2').value;
            const p3 = document.getElementById('pa-3').value;

            const plan = {
                winCondition: document.getElementById('plan-win').value,
                topActions: [p1, p2, p3],
                revenueAction: document.getElementById('plan-revenue').value,
                visibilityAction: document.getElementById('plan-visibility').value,
                followUps: document.getElementById('plan-followup').value,
            };

            const planId = form.getAttribute('data-plan-id');
            if (planId) {
                updateWeeklyPlan(planId, plan);
                alert("Weekly plan updated!");
            } else {
                addWeeklyPlan(plan);
                alert("Weekly plan saved! Have a great week, CEO.");
            }

            // Show success and redirect
            window.location.hash = '#/dashboard';
        });
    }
}

function getSuggestedFocus(mode) {
    if (!mode) return "What is the ONE thing that moves the needle this week?";

    const m = mode.toLowerCase();

    if (m.includes('first sale')) {
        return "You're in the First Sale Sprint! Your primary focus must be visibility and direct conversations. Aim to make at least 5 direct invitations to your offer this week.";
    }

    if (m.includes('launch')) {
        return "It's an Offer Launch Quarter! This week, prioritize tasks that move your launch timeline forward (e.g. warming up the audience, finalizing promo assets, or sending sales emails). Ignore distractions.";
    }

    if (m.includes('audience')) {
        return "Audience Growth is your focus. Dedicate 60% of your time to creating high-value content, driving traffic to a lead magnet, and engaging with new ideal clients.";
    }

    if (m.includes('reset')) {
        return "You are in CEO Reset mode. Your priority is to simplify your delivery, automate where possible, and document your processes so you can scale without burning out.";
    }

    return "What is the ONE thing that moves the needle this week based on your current big goal?";
}

function getSmartPrompts(mode) {
    const m = (mode || '').toLowerCase();

    if (m.includes('first sale')) {
        return {
            revenueHelper: "Your priority is direct sales. e.g., Pitching 3 people in DMs, sending a direct sales email, inviting people to a discovery call.",
            visibilityHelper: "Keep this simple. It's just to support your outreach. e.g., 1 post sharing your story and offer.",
            followupHelper: "Critical: Follow up with anyone who showed interest in the past 30 days."
        };
    }
    if (m.includes('launch')) {
        return {
            revenueHelper: "Focus on launch mechanics. e.g., Finalizing the sales page, writing the launch email sequence, opening the cart.",
            visibilityHelper: "Warm up your audience. e.g., Teasing the launch, sharing behind-the-scenes, hosting a free masterclass.",
            followupHelper: "Follow up with waitlist members or highly engaged leads."
        };
    }
    if (m.includes('audience')) {
        return {
            revenueHelper: "Secondary focus this quarter. e.g., Mention your evergreen offer at the end of content.",
            visibilityHelper: "MAJOR FOCUS: How are you driving new traffic? e.g., Collaborations, Pinterest pins, SEO blogs, daily short-form video.",
            followupHelper: "Engage with new followers, reply to all comments."
        };
    }
    if (m.includes('reset')) {
        return {
            revenueHelper: "Keep the baseline running. e.g., Automated sales sequences or passive income streams.",
            visibilityHelper: "Maintain consistency without burning out. e.g., Repurposing old content.",
            followupHelper: "Clear out your inbox and delegate customer service if possible."
        };
    }

    return {
        revenueHelper: "How will you actively generate sales or leads this week? (e.g., DM outreach, sending a promo email, hosting a webinar)",
        visibilityHelper: "How will you show up visibly? (e.g., 3 IG Posts, 1 YouTube video)",
        followupHelper: "Who do you need to reply to or follow up with to close loops?"
    };
}

function generatePlanSuggestions(store) {
    const goals = store.goals || {};
    const priorities = goals.priorities || ['', '', ''];
    const focus90 = goals.focus || '';
    const milestones = goals.milestones || {};
    const mode = (store.profile?.strategyMode || '').toLowerCase();
    const reviews = store.reviews || [];
    const revInsights = typeof getRevenueInsights === 'function' ? getRevenueInsights() : {};

    // Determine current month milestone
    const quarterStartMonth = Math.floor(new Date().getMonth() / 3) * 3;
    const currentMonthInQuarter = new Date().getMonth() - quarterStartMonth + 1;
    const currentMilestone = milestones[`month${currentMonthInQuarter}`] || '';

    // Combine all user goals into searchable text
    const allGoalText = [focus90, currentMilestone, ...priorities].join(' ').toLowerCase();

    let suggestions = [];

    // === KEYWORD-TO-ACTION MAP ===
    // Each entry maps goal keywords to concrete tactical actions
    const actionMap = [
        {
            keywords: ['testimonial', 'testimonials', 'review', 'reviews', 'case study', 'case studies', 'social proof'],
            actions: [
                { type: 'Action', action: 'Draft a short testimonial request email — ask one clear question like "What result did you get from working together?"' },
                { type: 'Action', action: 'Reach out personally to 3 past clients and ask for a quick written or video testimonial.' },
                { type: 'Action', action: 'Create a simple Google Form for collecting testimonials and share the link with your most engaged clients.' },
            ]
        },
        {
            keywords: ['launch', 'beta', 'pre-sale', 'presale', 'pre-launch', 'prelaunch', 'cart open', 'waitlist'],
            actions: [
                { type: 'Action', action: 'Write 3 emails for your launch sequence: a teaser, a value email, and the cart-open announcement.' },
                { type: 'Action', action: 'Create or refine your landing page or sign-up form to capture early interest and build your waitlist.' },
                { type: 'Action', action: 'Plan your launch timeline: set specific dates for teaser content, cart open, and cart close.' },
                { type: 'Action', action: 'Post 2 behind-the-scenes pieces of content this week to warm up your audience before the launch.' },
            ]
        },
        {
            keywords: ['course', 'program', 'curriculum', 'module', 'lesson', 'training', 'workshop content'],
            actions: [
                { type: 'Action', action: 'Outline the next module or lesson — write the key learning outcome and 3-5 teaching points.' },
                { type: 'Action', action: 'Record or write one lesson this week. Done is better than perfect — aim for 80% good enough.' },
                { type: 'Action', action: 'Create one worksheet, template, or resource that students can use immediately after the lesson.' },
            ]
        },
        {
            keywords: ['sales page', 'landing page', 'checkout', 'sales copy', 'conversion page', 'funnel'],
            actions: [
                { type: 'Action', action: 'Write the headline and first 3 sections of your sales page — focus on the transformation, not features.' },
                { type: 'Action', action: 'Add 2-3 testimonials or proof points to your sales page. If you don\'t have them yet, collect them this week.' },
                { type: 'Action', action: 'Test your full checkout flow end-to-end: payment, confirmation email, and delivery. Fix anything broken.' },
            ]
        },
        {
            keywords: ['email', 'newsletter', 'sequence', 'nurture', 'autoresponder', 'welcome sequence'],
            actions: [
                { type: 'Action', action: 'Write and schedule 2 value-packed emails this week — teach something useful and include one clear call-to-action.' },
                { type: 'Action', action: 'Review your welcome sequence: does it introduce you, deliver value, and make an offer within the first 5 emails?' },
                { type: 'Action', action: 'Segment your email list by engagement. Send a re-engagement email to inactive subscribers.' },
            ]
        },
        {
            keywords: ['content', 'post', 'reel', 'video', 'tiktok', 'instagram', 'youtube', 'blog', 'podcast', 'social media'],
            actions: [
                { type: 'Action', action: 'Batch-create 3 pieces of content: 1 educational, 1 story-driven, 1 with a direct call-to-action.' },
                { type: 'Action', action: 'Repurpose your best-performing past content into a new format (e.g., turn a post into a reel or email).' },
                { type: 'Action', action: 'Engage intentionally: spend 20 minutes daily replying to comments and DMs to build trust with your audience.' },
            ]
        },
        {
            keywords: ['lead', 'leads', 'subscriber', 'subscribers', 'lead magnet', 'freebie', 'opt-in', 'list building', 'grow list', 'grow audience'],
            actions: [
                { type: 'Action', action: 'Create or refine a lead magnet that solves one specific problem for your ideal client.' },
                { type: 'Action', action: 'Publish 2 posts this week that directly promote your lead magnet with a clear call-to-action.' },
                { type: 'Action', action: 'Set up or optimize a simple landing page for your lead magnet — test the sign-up flow yourself.' },
            ]
        },
        {
            keywords: ['webinar', 'masterclass', 'live', 'challenge', 'event', 'speaking'],
            actions: [
                { type: 'Action', action: 'Plan and schedule your live event: set the date, create a registration page, and write the promo post.' },
                { type: 'Action', action: 'Outline your talk: what is the ONE takeaway? Structure it as problem → insight → action → offer.' },
                { type: 'Action', action: 'Promote the event daily this week — share the registration link in at least 3 different places.' },
            ]
        },
        {
            keywords: ['client', 'clients', 'onboard', 'onboarding', 'deliver', 'delivery', 'fulfillment', 'serve'],
            actions: [
                { type: 'Action', action: 'Create or improve your client onboarding flow: welcome email, intake form, and first-session prep.' },
                { type: 'Action', action: 'Check in with each active client this week — ask what\'s working and where they need support.' },
                { type: 'Action', action: 'Document one repeatable process from your delivery so you can eventually delegate or automate it.' },
            ]
        },
        {
            keywords: ['outreach', 'pitch', 'collab', 'collaboration', 'partnership', 'guest', 'networking'],
            actions: [
                { type: 'Action', action: 'Identify 5 people in complementary niches and send a personalized collaboration or guest pitch.' },
                { type: 'Action', action: 'Draft a simple pitch template that highlights the mutual value of working together.' },
                { type: 'Action', action: 'Follow up with anyone who responded to previous outreach — persistence closes partnerships.' },
            ]
        },
        {
            keywords: ['hire', 'va', 'delegate', 'team', 'outsource', 'automate', 'system', 'systems', 'process'],
            actions: [
                { type: 'Action', action: 'List all tasks you did last week that someone else could do. Pick 1 to delegate this week.' },
                { type: 'Action', action: 'Write a simple SOP (step-by-step guide) for your most repetitive task so it can be handed off.' },
                { type: 'Action', action: 'Research one automation tool (Zapier, Calendly, email scheduler) that could save you 2+ hours/week.' },
            ]
        },
        {
            keywords: ['sales', 'sell', 'selling', 'close', 'closing', 'revenue', 'income', 'money', 'offer'],
            actions: [
                { type: 'Action', action: 'Reach out to 5 warm leads this week with a personalized message — people who already know your work.' },
                { type: 'Action', action: 'Create 1 piece of content that addresses the #1 objection your ideal customer has about buying.' },
                { type: 'Action', action: 'Book 2 discovery or sales calls this week. Listen to their problem before pitching your solution.' },
            ]
        },
        {
            keywords: ['brand', 'branding', 'positioning', 'niche', 'ideal client', 'messaging'],
            actions: [
                { type: 'Action', action: 'Write a clear one-liner: "I help [who] achieve [result] through [method]." Test it on 3 people for clarity.' },
                { type: 'Action', action: 'Audit your social profiles: does your bio clearly communicate who you help and how? Update if needed.' },
                { type: 'Action', action: 'Create 1 piece of content this week that speaks directly to your ideal client\'s biggest frustration.' },
            ]
        }
    ];

    // Match user goals against keyword map
    let matchedActions = [];

    actionMap.forEach(mapping => {
        const matched = mapping.keywords.some(kw => allGoalText.includes(kw));
        if (matched) {
            mapping.actions.forEach(a => matchedActions.push(a));
        }
    });

    // Pick the top 3 most important matched actions
    if (matchedActions.length > 0) {
        // Shuffle for variety, pick up to 3
        matchedActions = matchedActions.sort(() => Math.random() - 0.5);
        suggestions = matchedActions.slice(0, 3);
    }

    // If no or too few keyword matches, fall back to priority-based suggestions
    if (suggestions.length < 3) {
        const p1 = priorities[0] || focus90 || 'your main goal';
        const p2 = priorities[1] || '';
        const p3 = priorities[2] || '';

        if (suggestions.length === 0) {
            suggestions.push({
                type: 'Action',
                action: `Break "${currentMilestone || focus90 || p1}" into 3 specific tasks. What is the very first step you need to complete this week?`
            });
        }
        if (p1 && suggestions.length < 2) {
            suggestions.push({
                type: 'Action',
                action: `Dedicate a 90-minute focus block this week to make tangible progress on "${p1}".`
            });
        }
        if (p2 && suggestions.length < 3) {
            suggestions.push({
                type: 'Action',
                action: `Advance "${p2}" — what does "done" look like for this priority this week? Complete one deliverable.`
            });
        }
    }

    // === Add Revenue, Visibility, and Follow-up suggestions based on goals ===
    const p1Label = priorities[0] || focus90 || 'your goal';

    // Revenue suggestion
    if (allGoalText.match(/testimonial|review|social proof|case stud/)) {
        suggestions.push({ type: 'Revenue', action: `Turn your best testimonials into a sales asset — feature them on your sales page, in emails, or as social proof posts.` });
    } else if (allGoalText.match(/launch|beta|pre-sale|waitlist|cart/)) {
        suggestions.push({ type: 'Revenue', action: `Write and send a promotional email to your warmest leads — highlight the transformation and include a clear buy/join link.` });
    } else if (allGoalText.match(/course|program|training/)) {
        suggestions.push({ type: 'Revenue', action: `Offer an early-bird or founding-member price to your existing audience to generate first sales and validate demand.` });
    } else if (allGoalText.match(/sales|sell|close|revenue|income|offer/)) {
        suggestions.push({ type: 'Revenue', action: `Reach out to 5 warm leads with a personalized message — ask about their biggest challenge and offer a solution call.` });
    } else {
        suggestions.push({ type: 'Revenue', action: `What is ONE thing you can do this week that directly generates income or moves a prospect closer to buying? Schedule it now.` });
    }

    // Visibility suggestion
    if (allGoalText.match(/launch|beta|pre-launch|waitlist/)) {
        suggestions.push({ type: 'Visibility', action: `Post 2 behind-the-scenes pieces showing your launch prep — build anticipation and let your audience feel part of the journey.` });
    } else if (allGoalText.match(/content|post|reel|video|blog|podcast|social/)) {
        suggestions.push({ type: 'Visibility', action: `Publish 1 educational post and 1 story-driven post this week. Educational builds trust, story builds connection.` });
    } else if (allGoalText.match(/lead|subscriber|list|audience|grow/)) {
        suggestions.push({ type: 'Visibility', action: `Create 2 posts that promote your lead magnet — one teaching a quick win, one sharing a client result or your own story.` });
    } else if (allGoalText.match(/brand|positioning|niche|messaging/)) {
        suggestions.push({ type: 'Visibility', action: `Share 1 piece of content that clearly communicates your unique perspective — what do you believe that others in your space don't?` });
    } else {
        suggestions.push({ type: 'Visibility', action: `Show up at least twice this week where your ideal clients spend time. Teach, share a story, or start a conversation.` });
    }

    // Follow-up suggestion
    if (allGoalText.match(/testimonial|review|case stud/)) {
        suggestions.push({ type: 'Follow-up', action: `Follow up with clients who said they'd send a testimonial but haven't yet — a gentle reminder often does the trick.` });
    } else if (allGoalText.match(/launch|beta|waitlist/)) {
        suggestions.push({ type: 'Follow-up', action: `Personally DM or email 5 people who showed interest — ask if they have questions and invite them to join.` });
    } else if (allGoalText.match(/outreach|collab|partnership|pitch/)) {
        suggestions.push({ type: 'Follow-up', action: `Follow up on all pending outreach from the last 2 weeks — a polite bump email often turns silence into a yes.` });
    } else if (allGoalText.match(/client|onboard|deliver/)) {
        suggestions.push({ type: 'Follow-up', action: `Check in with each active client — ask what's working and if there's anything else they need from you.` });
    } else {
        suggestions.push({ type: 'Follow-up', action: `Review your inbox, DMs, and comments. Follow up with anyone who engaged last week — a quick personal reply can close a deal.` });
    }

    return suggestions;
}



// --- js\screens\revenue.js ---
// revenue.js

function renderRevenue() {
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
                                   <option value="Refund">Refund</option>
                                   <option value="Adjustment">Adjustment</option>
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

                   <!-- Recent Transactions -->
                   <div class="card mt-6">
                       <div class="flex justify-between items-center mb-4">
                           <h3 class="mb-0">Recent Transactions</h3>
                           <button id="btn-export-revenue" class="btn btn-outline btn-sm" style="font-size: 0.8rem; padding: 0.25rem 0.75rem;">Export to Excel (CSV)</button>
                       </div>
                       ${insights.entries.length === 0 ? '<p style="color: var(--color-text-muted); font-size: 0.9rem;">No transactions logged yet.</p>' : `
                       <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 400px; overflow-y: auto; padding-right: 0.5rem;" class="custom-scroll">
                           ${insights.entries.map(e => `
                               <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border);">
                                   <div>
                                       <span style="font-weight: 600; color: ${parseFloat(e.amount) < 0 ? '#D92D20' : 'var(--color-black)'}; display: block;">$${parseFloat(e.amount).toLocaleString()}</span>
                                       <span style="font-size: 0.8rem; color: var(--color-text-muted);">${new Date(e.date).toLocaleDateString()} • ${e.source}</span>
                                   </div>
                                   <button type="button" class="btn btn-ghost btn-sm btn-delete-revenue" data-id="${e.id}" style="padding: 0.25rem 0.5rem; color: var(--color-text-muted);" title="Delete Entry">🗑️</button>
                               </div>
                           `).join('')}
                       </div>
                       `}
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

    document.querySelectorAll('.btn-delete-revenue').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm("Are you sure you want to delete this revenue entry?")) {
                const id = e.currentTarget.getAttribute('data-id');
                if (!id || id === 'undefined') {
                    alert("Error: The exact database ID for this entry is missing.");
                    return;
                }
                const success = deleteRevenueEntry(id);
                if (success) {
                    window.location.reload();
                } else {
                    alert("Error: Could not find the database entry matching this ID to delete it.");
                }
            }
        });
    });

    const exportBtn = document.getElementById('btn-export-revenue');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const insights = getRevenueInsights();
            const entries = insights.entries || [];
            if (entries.length === 0) {
                alert("No revenue transactions to export.");
                return;
            }
            
            let csvContent = "Date,Amount,Source,Offer,Notes\r\n";
            entries.forEach(e => {
                const date = new Date(e.date).toLocaleDateString();
                const amount = e.amount;
                const source = (e.source || '').replace(/"/g, '""');
                const offer = (e.offer || '').replace(/"/g, '""');
                const notes = (e.notes || '').replace(/"/g, '""');
                csvContent += `"${date}","${amount}","${source}","${offer}","${notes}"\r\n`;
            });
            
            // Bulletproof cross-browser Blob download
            const blob = new Blob(["\uFEFF", csvContent], { type: 'text/csv;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.style.display = 'none';
            link.href = url;
            link.download = `CEO_Revenue_Export_${new Date().toISOString().split('T')[0]}.csv`;
            
            document.body.appendChild(link);
            link.click();
            
            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 500);
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


// --- js\screens\fridayReview.js ---
// fridayReview.js

function renderReview() {
    window.setScreenModule({ attachEvents: reviewAttachEvents });
    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 700px;">
            <div style="margin-bottom: 2rem;">
                <h2>Friday CEO Review</h2>
                <p style="color: var(--color-text-muted);">Reflect on the week, capture the wins, and plan for better next week.</p>
            </div>

            <form id="review-form" class="card">
                <div class="form-group mb-6 text-center" style="background: var(--color-bg-main); padding: 1.5rem; border-radius: var(--radius-md); border: 1px dashed var(--color-border);">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; color: var(--color-text-main); margin-bottom: 1rem;">
                        Easier to talk it out? Use Voice Reflection to fill out your review.
                        ${renderTooltip("A hands-free way to log your week.", "Sometimes writing feels like a chore at the end of a long week. Talking out loud helps you process your thoughts faster and ensures you actually complete the review.")}
                    </p>
                    <button type="button" id="btn-voice-reflection" class="btn btn-secondary" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; max-width: 300px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                        <span id="voice-btn-text">Start Voice Reflection</span>
                    </button>
                    <p id="voice-status" style="font-size: 0.85rem; color: var(--color-primary-dark); margin-top: 0.75rem; display: none; font-weight: 500;">Listening...</p>
                </div>

                <div class="form-group">
                    <label class="form-label" style="display: flex; align-items: center; font-size: 1.1rem;">
                        What moved the business forward this week?
                        ${renderTooltip("The actual needle-moving progress you made.", "It's easy to feel like you didn't do enough. Answering this proves to your brain that you are making progress on the things that matter.")}
                    </label>
                    <textarea class="form-textarea" id="rev-forward" placeholder="e.g., Finished the beta launch copy, pitched 5 podcasts." required></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="display: flex; align-items: center; font-size: 1.1rem; color: #027A48;">
                        What worked well?
                        ${renderTooltip("Activities that felt easy, natural, or generated good results.", "Success leaves clues. By identifying what worked, you know exactly what to repeat next week.")}
                    </label>
                    <p class="form-helper mb-2">Celebrate your wins, big or small. What gave you energy or results?</p>
                    <textarea class="form-textarea" id="rev-well" style="min-height: 80px;" required></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="display: flex; align-items: center; font-size: 1.1rem; color: #B42318;">
                        What felt difficult or heavy?
                        ${renderTooltip("Tasks or projects that caused resistance.", "You can't fix a bottleneck if you don't acknowledge it. If something is consistently heavy, you need to automate it, delegate it, or delete it.")}
                    </label>
                    <p class="form-helper mb-2">Notice resistance without judgment. What drained you or got stuck?</p>
                    <textarea class="form-textarea" id="rev-difficult" style="min-height: 80px;" required></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem;">Metrics (Optional)</label>
                    <p class="form-helper mb-2">Track the numbers that matter for your 90-day goal.</p>
                    <div class="flex gap-4">
                        <div style="flex: 1;">
                            <label class="form-label" style="font-size: 0.85rem;">Leads/Subscribers</label>
                            <input type="text" class="form-input" id="rev-leads" placeholder="e.g., +15" />
                        </div>
                        <div style="flex: 1;">
                            <label class="form-label" style="font-size: 0.85rem;">Sales/Revenue</label>
                            <input type="text" class="form-input" id="rev-sales" placeholder="e.g., $500" />
                        </div>
                    </div>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="display: flex; align-items: center; font-size: 1.1rem; color: var(--color-primary-dark);">
                        What will you improve next week?
                        ${renderTooltip("A singular focus for making the upcoming week better.", "Trying to fix everything at once leads to failure. Changing just one habit or approach per week leads to massive compounding growth.")}
                    </label>
                    <p class="form-helper mb-2">Pick ONE thing to adjust so next week is easier.</p>
                    <textarea class="form-textarea" id="rev-improve" style="min-height: 80px;" required></textarea>
                </div>

                <div class="flex justify-end mt-8">
                    <button type="submit" class="btn btn-primary">Save Review & Close Week</button>
                </div>
            </form>
        </div>
    `;
}

function reviewAttachEvents() {
    // Nav
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-review')?.classList.add('active');

    // Voice Reflection Logic
    const voiceBtn = document.getElementById('btn-voice-reflection');
    const voiceBtnText = document.getElementById('voice-btn-text');
    const voiceStatus = document.getElementById('voice-status');
    let recognition = null;
    let isRecording = false;
    let activeTextArea = document.getElementById('rev-forward'); // Default target

    // Track active text area
    document.querySelectorAll('.form-textarea').forEach(ta => {
        ta.addEventListener('focus', (e) => {
            activeTextArea = e.target;
        });
    });

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = function () {
            isRecording = true;
            voiceBtn.classList.remove('btn-secondary');
            voiceBtn.classList.add('btn-primary');
            voiceBtnText.textContent = "Stop Recording";
            voiceStatus.style.display = "block";
        };

        recognition.onresult = function (event) {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript && activeTextArea) {
                // Append with a space if there's already text
                activeTextArea.value += (activeTextArea.value ? ' ' : '') + finalTranscript.trim() + '.';
            }
        };

        recognition.onerror = function (event) {
            console.error("Speech recognition error", event.error);
            stopRecording();
            alert("Microphone error. Please check permissions.");
        };

        recognition.onend = function () {
            stopRecording();
        };
    } else {
        if (voiceBtn) {
            voiceBtn.style.display = 'none';
        }
    }

    function stopRecording() {
        isRecording = false;
        if (recognition) recognition.stop();
        if (voiceBtn) {
            voiceBtn.classList.add('btn-secondary');
            voiceBtn.classList.remove('btn-primary');
            voiceBtnText.textContent = "Start Voice Reflection";
        }
        if (voiceStatus) {
            voiceStatus.style.display = "none";
        }
    }

    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            if (isRecording) {
                stopRecording();
            } else {
                if (recognition) {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        });
    }

    const form = document.getElementById('review-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (isRecording) stopRecording();

            const review = {
                movedForward: document.getElementById('rev-forward').value,
                workedWell: document.getElementById('rev-well').value,
                difficult: document.getElementById('rev-difficult').value,
                leads: document.getElementById('rev-leads').value,
                sales: document.getElementById('rev-sales').value,
                nextWeekImprove: document.getElementById('rev-improve').value,
            };

            addReview(review);

            // Show success and redirect
            alert("Review saved! Great job this week. Take some well-deserved rest off.");
            window.location.hash = '#/progress';
        });
    }
}


// --- js\screens\progress.js ---
// progress.js

function renderProgress() {
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


// --- js\screens\settings.js ---
// settings.js

function renderSettings() {
    // We bind the event listeners after HTML is rendered using setScreenModule
    window.setScreenModule({ attachEvents: settingsAttachEvents });
    const store = getStore();
    const reminders = store.profile.reminderTimes || [];

    // Quick helper to check if a reminder is active
    const isChecked = (val) => reminders.includes(val) ? 'checked' : '';

    return `
        ${renderNav()}
<div class="main-content" style="max-width: 600px;">
    <div class="flex justify-between items-center mb-6">
        <h2>Settings</h2>
        <a href="#/progress" class="btn btn-ghost" style="font-size: 0.875rem;">← Back</a>
    </div>

    <div class="card">
        <h3 class="mb-4">Profile & Goals</h3>
        <form id="settings-form">
            <!-- Profile Info -->
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Your Name</label>
                <input type="text" id="set-name" class="form-input" value="${store.profile.name || ''}" required>
            </div>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Business Name</label>
                <input type="text" id="set-biz" class="form-input" value="${store.profile.businessName || ''}" required>
            </div>
            
            <div class="form-group mb-6">
                <label class="form-label" style="font-weight: 600;">Business Logo</label>
                <div style="display: flex; gap: 1rem; align-items: flex-start; margin-bottom: 0.5rem;">
                    <div style="width: 60px; height: 60px; border-radius: var(--radius-md); background: var(--color-bg-light); border: 1px dashed var(--color-border); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                        ${store.profile.logo ? `<img src="${store.profile.logo}" id="logo-preview-img" style="width: 100%; height: 100%; object-fit: contain;">` : `<span id="logo-preview-placeholder" style="color: var(--color-text-muted); font-size: 0.75rem;">No Logo</span><img src="" id="logo-preview-img" style="display: none; width: 100%; height: 100%; object-fit: contain;">`}
                    </div>
                    <div style="flex-grow: 1;">
                        <input type="text" id="set-logo-url" class="form-input mb-2" value="${store.profile.logo && store.profile.logo.startsWith('http') ? store.profile.logo : ''}" placeholder="Paste Image URL here...">
                        <label for="set-logo-file" class="btn btn-outline btn-sm" style="display: inline-block; cursor: pointer; font-size: 0.8rem; padding: 0.25rem 0.75rem;">Upload Image File</label>
                        <input type="file" id="set-logo-file" accept="image/*" style="display: none;">
                        <input type="hidden" id="set-logo-base64" value="${store.profile.logo && store.profile.logo.startsWith('data:image') ? store.profile.logo : ''}">
                    </div>
                </div>
            </div>

            <!-- CEO Profiling -->
            <h4 class="mb-4 pt-4" style="border-top: 1px solid var(--color-border); color: var(--color-primary-dark);">CEO Business Profile</h4>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Top Business Bottleneck</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">The AI Coach uses this to prioritize its Friday Advice.</p>
                <select id="set-bottleneck" class="form-input" style="padding: 0.75rem;">
                    <option value="Sales Conversion" ${store.profile.bottleneck === 'Sales Conversion' ? 'selected' : ''}>Sales Conversion (Traffic is high, Sales are low)</option>
                    <option value="Audience Size" ${store.profile.bottleneck === 'Audience Size' ? 'selected' : ''}>Audience Size (Offers are great, Visibility is low)</option>
                    <option value="Time & Delivery" ${store.profile.bottleneck === 'Time & Delivery' || !store.profile.bottleneck ? 'selected' : ''}>Time / Delivery (Overworked & Burnt out)</option>
                </select>
            </div>

            <div class="form-group mb-6">
                <label class="form-label" style="font-weight: 600;">CEO Strategy Mode</label>
                <p style="color: #6941C6; font-size: 0.85rem; margin-bottom: 0.5rem;"><strong>Important:</strong> Changing this completely rewrites the AI Planning Assistant and Smart Prompts to focus on this strict trajectory.</p>
                <select id="set-strategy" class="form-input" style="padding: 0.75rem;">
                    <option value="First Sale Sprint" ${store.profile.strategyMode === 'First Sale Sprint' ? 'selected' : ''}>First Sale Sprint (Focus: Direct Outreach & Fast Cash)</option>
                    <option value="Offer Launch Quarter" ${store.profile.strategyMode === 'Offer Launch Quarter' ? 'selected' : ''}>Offer Launch Quarter (Focus: Build Hype & Open Cart)</option>
                    <option value="Audience Growth" ${store.profile.strategyMode === 'Audience Growth' ? 'selected' : ''}>Audience Growth (Focus: Massive Lead Generation)</option>
                    <option value="CEO Reset" ${store.profile.strategyMode === 'CEO Reset' || !store.profile.strategyMode ? 'selected' : ''}>CEO Reset (Focus: Systems, Automating & Hiring)</option>
                </select>
            </div>

            <!-- 90 Day Goals -->
            <h4 class="mb-4 pt-4" style="border-top: 1px solid var(--color-border); color: var(--color-primary-dark);">90-Day Vision</h4>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Main Focus</label>
                <input type="text" id="set-focus" class="form-input" value="${store.goals.focus || ''}" placeholder="e.g. Launch new coaching program" required>
            </div>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Measurable Outcome</label>
                <input type="text" id="set-outcome" class="form-input" value="${store.goals.outcome || ''}" placeholder="e.g. 10 beta clients at $1.5k" required>
            </div>
            
            <div class="form-group mb-6">
                <label class="form-label" style="font-weight: 600;">Top 3 Priorities</label>
                <input type="text" id="set-p1" class="form-input mb-2" value="${store.goals.priorities?.[0] || ''}" placeholder="Priority 1" required>
                <input type="text" id="set-p2" class="form-input mb-2" value="${store.goals.priorities?.[1] || ''}" placeholder="Priority 2">
                <input type="text" id="set-p3" class="form-input" value="${store.goals.priorities?.[2] || ''}" placeholder="Priority 3">
            </div>

            <h4 class="mb-4 pt-4" style="border-top: 1px solid var(--color-border); color: var(--color-secondary-dark);">Weekly Setup</h4>
            <div class="form-group mb-6">
                <label class="form-label" style="font-size: 1.05rem; color: var(--color-black);">Planning Day</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">Select the day you want the guided weekly CEO Planner flow to appear.</p>
                <select id="planning-day-select" class="form-input" style="padding: 0.75rem;">
                    <option value="Sunday" ${store.profile.planningDay === 'Sunday' ? 'selected' : ''}>Sunday</option>
                    <option value="Monday" ${store.profile.planningDay === 'Monday' || !store.profile.planningDay ? 'selected' : ''}>Monday</option>
                    <option value="Tuesday" ${store.profile.planningDay === 'Tuesday' ? 'selected' : ''}>Tuesday</option>
                    <option value="Wednesday" ${store.profile.planningDay === 'Wednesday' ? 'selected' : ''}>Wednesday</option>
                    <option value="Thursday" ${store.profile.planningDay === 'Thursday' ? 'selected' : ''}>Thursday</option>
                    <option value="Friday" ${store.profile.planningDay === 'Friday' ? 'selected' : ''}>Friday</option>
                    <option value="Saturday" ${store.profile.planningDay === 'Saturday' ? 'selected' : ''}>Saturday</option>
                </select>
            </div>

            <h3 class="mb-4 pt-4" style="border-top: 1px solid var(--color-border);">Reminders & Prompts</h3>
            <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 1.5rem;">
                Select when you'd like the app to remind you about CEO tasks.
                <i>(Note: In this MVP, this visually sets your preferences. Full push notifications require backend infra).</i>
            </p>
            <div style="display: flex; flex-direction: column; gap: 1rem;">

                <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                    <input type="checkbox" name="reminder" value="weekly_plan" ${isChecked('weekly_plan')} style="margin-top: 0.25rem;">
                        <div>
                            <span style="font-weight: 500; display: block; color: var(--color-black);">Weekly Planning Prompt</span>
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">Reminds you to set your weekly goals (Usually Sunday or Monday)</span>
                        </div>
                </label>

                <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                    <input type="checkbox" name="reminder" value="daily_priority" ${isChecked('daily_priority')} style="margin-top: 0.25rem;">
                        <div>
                            <span style="font-weight: 500; display: block; color: var(--color-black);">Daily Priority Check</span>
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">A morning nudge to review your top 3 priorities</span>
                        </div>
                </label>

                <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                    <input type="checkbox" name="reminder" value="friday_review" ${isChecked('friday_review')} style="margin-top: 0.25rem;">
                        <div>
                            <span style="font-weight: 500; display: block; color: var(--color-black);">Friday CEO Review</span>
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">Afternoon prompt to log wins and close out the week</span>
                        </div>
                </label>

            </div>

            <div class="mt-8 flex justify-end">
                <button type="submit" class="btn btn-primary">Save Preferences</button>
            </div>
        </form>
    </div>

    <div class="card mt-6" style="border: 1px solid #FEE4E2;">
        <h3 class="mb-2" style="color: #B42318;">Danger Zone</h3>
        <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 1rem;">Resetting your account will delete all your local data, plans, and historical reviews permanently.</p>
        <button id="btn-reset-data" class="btn btn-outline" style="border-color: #FEE4E2; color: #B42318; background: #FEF3F2;">Erase All Local Data</button>
    </div>
</div>
`;
}

function settingsAttachEvents() {
    // Handle form save
    const form = document.getElementById('settings-form');

    // Handle File Input for Logo
    const fileInput = document.getElementById('set-logo-file');
    const urlInput = document.getElementById('set-logo-url');
    const base64Input = document.getElementById('set-logo-base64');
    const previewImg = document.getElementById('logo-preview-img');
    const previewPlaceholder = document.getElementById('logo-preview-placeholder');

    if (fileInput) {
        fileInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (event) {
                    const base64Str = event.target.result;
                    base64Input.value = base64Str;
                    urlInput.value = ''; // Clear URL if file is uploaded
                    if (previewImg) {
                        previewImg.src = base64Str;
                        previewImg.style.display = 'block';
                    }
                    if (previewPlaceholder) {
                        previewPlaceholder.style.display = 'none';
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (urlInput) {
        urlInput.addEventListener('input', function (e) {
            const url = e.target.value;
            if (url) {
                base64Input.value = ''; // Clear base64 if URL is provided
                if (previewImg) {
                    previewImg.src = url;
                    previewImg.style.display = 'block';
                }
                if (previewPlaceholder) {
                    previewPlaceholder.style.display = 'none';
                }
            } else if (!base64Input.value) {
                if (previewImg) {
                    previewImg.style.display = 'none';
                }
                if (previewPlaceholder) {
                    previewPlaceholder.style.display = 'block';
                }
            }
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const checkedBoxes = document.querySelectorAll('input[name="reminder"]:checked');
            const newReminders = Array.from(checkedBoxes).map(cb => cb.value);
            const name = document.getElementById('set-name').value;
            const biz = document.getElementById('set-biz').value;

            // Determine Logo
            const urlVal = document.getElementById('set-logo-url').value;
            const base64Val = document.getElementById('set-logo-base64').value;
            let finalLogo = urlVal || base64Val || '';

            const focus = document.getElementById('set-focus').value;
            const outcome = document.getElementById('set-outcome').value;
            const p1 = document.getElementById('set-p1').value;
            const p2 = document.getElementById('set-p2').value;
            const p3 = document.getElementById('set-p3').value;
            const planningDay = document.getElementById('planning-day-select').value;
            const bottleneck = document.getElementById('set-bottleneck').value;
            const strategyMode = document.getElementById('set-strategy').value;

            updateProfile({
                name: name,
                businessName: biz,
                logo: finalLogo,
                bottleneck: bottleneck,
                strategyMode: strategyMode,
                reminderTimes: newReminders,
                planningDay: planningDay
            });

            updateGoals({
                focus: focus,
                outcome: outcome,
                priorities: [p1, p2, p3].filter(Boolean)
            });

            alert('Settings saved successfully!');
            window.location.reload();
        });
    }

    // Handle Factory Reset
    const resetBtn = document.getElementById('btn-reset-data');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const confirmDelete = confirm("Are you sure? This cannot be undone.");
            if (confirmDelete) {
                localStorage.removeItem('ceoPlanner_store');
                window.location.hash = '#/';
                window.location.reload();
            }
        });
    }
}


// --- js\screens\quarterReset.js ---
// quarterReset.js

function renderQuarterReset() {
    window.setScreenModule({ attachEvents: quarterResetAttachEvents });
    return `
        ${renderNav()}
        <div class="main-content fade-in" style="max-width: 700px; padding-top: 5vh;">
            <div class="logo-icon" style="margin: 0 auto; margin-bottom: 2rem; width: 64px; height: 64px; border-radius: var(--radius-full); background: var(--color-primary-light); display: flex; align-items: center; justify-content: center;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-dark)" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>
            </div>
            
            <h1 style="color: var(--color-primary-dark); margin-bottom: 1rem; text-align: center; font-size: 2.5rem;">Quarterly CEO Wrap-Up</h1>
            <p style="color: var(--color-text-muted); margin-bottom: 2.5rem; text-align: center; font-size: 1.1rem; max-width: 480px; margin-left: auto; margin-right: auto;">
                Before we archive this quarter and start fresh, take a moment to reflect on your journey over the last 90 days.
            </p>

            <form id="quarter-reset-form" class="card" style="border-top: 4px solid var(--color-primary);">
                
                <div class="form-group mb-6">
                    <label class="form-label" style="font-size: 1.1rem; color: #027A48;">What worked really well?</label>
                    <p class="form-helper mb-2">What gave you energy and felt aligned with your vision?</p>
                    <textarea class="form-textarea" id="qr-worked" style="min-height: 80px;" required></textarea>
                </div>

                <div class="form-group mb-6">
                    <label class="form-label" style="font-size: 1.1rem; color: #B42318;">What didn't work?</label>
                    <p class="form-helper mb-2">Notice resistance. What drained you, stalled, or felt heavy?</p>
                    <textarea class="form-textarea" id="qr-didnt" style="min-height: 80px;" required></textarea>
                </div>

                <div class="form-group mb-6">
                    <label class="form-label" style="font-size: 1.1rem; color: var(--color-secondary-dark);">What explicitly created results?</label>
                    <p class="form-helper mb-2">Look for the 80/20 rule. Which 20% of your actions drove 80% of your revenue or growth?</p>
                    <textarea class="form-textarea" id="qr-results" style="min-height: 80px;" required></textarea>
                </div>

                <div class="form-group mb-8">
                    <label class="form-label" style="font-size: 1.1rem; color: var(--color-primary-dark);">What should change next quarter?</label>
                    <p class="form-helper mb-2">Based on this reflection, what boundaries or strategies are you bringing into the next 90 days?</p>
                    <textarea class="form-textarea" id="qr-change" style="min-height: 80px;" required></textarea>
                </div>

                <div style="background: var(--color-bg-light); padding: 1.5rem; border-radius: var(--radius-md); border-left: 4px solid var(--color-accent); margin-bottom: 1.5rem;">
                    <h4 style="margin-bottom: 0.5rem; color: var(--color-black);">Ready to Reset?</h4>
                    <p style="font-size: 0.9rem; color: var(--color-text-muted); margin-bottom: 0;">By confirming below, your current 90-day goal, priorities, and weekly plans will be securely archived. Your streaks, wins, and profile information will remain intact.</p>
                </div>

                <div class="flex justify-between items-center">
                    <a href="#/progress" class="btn btn-ghost" style="font-size: 0.9rem;">Wait, not yet</a>
                    <button type="submit" class="btn btn-primary" style="min-width: 200px;">Archive & Begin New Quarter</button>
                </div>
            </form>
        </div>
    `;
}

function quarterResetAttachEvents() {
    // Nav active
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const form = document.getElementById('quarter-reset-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const reflection = {
                date: new Date().toISOString(),
                worked: document.getElementById('qr-worked').value,
                didntWork: document.getElementById('qr-didnt').value,
                results: document.getElementById('qr-results').value,
                changeNextQuarter: document.getElementById('qr-change').value
            };

            const confirmIt = confirm("Excellent reflection. Are you ready to archive this quarter and begin planning the next 90 days?");
            if (confirmIt) {
                // Fetch the current goals before resetting to bundle with reflection
                const store = getStore();
                const pastQuarter = {
                    goals: JSON.parse(JSON.stringify(store.goals)),
                    reflection: reflection
                };

                // In a full app, we'd save `pastQuarter` to a `store.pastQuarters` array.
                // For now, we just perform the reset.
                resetQuarter();

                // Pre-load the new reflection into store if we wanted to auto-suggest
                // But for this MVP, we just push them to the wizard
                window.location.hash = '#/wizard';
            }
        });
    }
}


// --- js\screens\coach.js ---
// coach.js

function renderCoach() {
    window.setScreenModule({ attachEvents: coachAttachEvents });
    const store = getStore();

    // Generate AI Insights
    const insight = generateInsights(store);

    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 800px;">
            <div style="margin-bottom: 2rem;">
                <h2>CEO Coach & Insights</h2>
                <p style="color: var(--color-text-muted);">AI-powered analysis and decision filtering based on your recent activity.</p>
            </div>

            <!-- CEO Insight Engine -->
            <div class="card mb-8" style="border-top: 4px solid var(--color-primary);">
                <div class="flex items-center gap-2 mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    <h3 style="margin: 0; display: flex; align-items: center;">
                        Weekly CEO Insight
                        ${renderTooltip("Identifies the area most likely slowing your progress right now.", "Solving the right problem is faster than doing more work. If you have a bottleneck, a CEO stops and fixes the pipe before pouring more water.")}
                    </h3>
                </div>
                <div style="background: var(--color-bg-main); padding: 1.5rem; border-radius: var(--radius-md); font-size: 1.05rem; line-height: 1.6; color: var(--color-black);">
                    ${insight}
                </div>
            </div>

            <!-- Decision Filter -->
            <div class="card mb-8" style="border-top: 4px solid var(--color-secondary);">
                <div class="flex items-center gap-2 mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary-dark)" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    <h3 style="margin: 0; display: flex; align-items: center;">
                        CEO vs Busy Work
                        ${renderTooltip("A simple filter to test if a new idea or task is worth doing.", "We all have 'squirrel!' moments. Before you drop everything to launch a new funnel or switch platforms, run it through this filter.")}
                    </h3>
                </div>
                <p style="color: var(--color-text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">Should I focus on this? Paste a new idea below to evaluate it against your 90-day goal and current priorities.</p>
                
                <form id="decision-filter-form">
                    <div class="form-group">
                        <textarea class="form-textarea" id="idea-input" placeholder="e.g., Launch a new mini course, start a TikTok channel..." required></textarea>
                    </div>
                    <button type="submit" class="btn btn-secondary mt-4">Evaluate Idea</button>
                </form>

                <div id="decision-result" class="mt-6" style="display: none; background: var(--color-secondary-light); padding: 1.5rem; border-radius: var(--radius-md); border-left: 4px solid var(--color-secondary);">
                    <div class="flex items-center gap-2 mb-2">
                        <span style="font-weight: 600; color: var(--color-secondary-dark);">Verdict:</span>
                        <span id="alignment-score" style="font-weight: 700; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem;"></span>
                    </div>
                    <p id="alignment-explanation" style="font-size: 0.95rem; color: var(--color-text-main); margin-top: 0.5rem; line-height: 1.5;"></p>
                </div>
            </div>

            <!-- Current Strategy Mode -->
            <div class="card" style="background-color: var(--color-primary-light); border-color: var(--color-primary-light);">
                 <p style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary-dark); font-weight: 600; margin-bottom: var(--spacing-sm);">Active Strategy Mode</p>
                 <h4 style="color: var(--color-black); margin-bottom: 0.5rem;">${store.profile?.strategyMode || 'Standard'}</h4>
                 <p style="font-size: 0.9rem; color: var(--color-text-main);">Your planning prompts and metrics are currently customized for this strategy.</p>
            </div>
        </div>
    `;
}

function generateInsights(store) {
    const reviews = store.reviews || [];
    const plans = store.weeklyPlans || [];
    const name = store.profile?.name || 'CEO';
    const bottleneck = store.profile?.bottleneck || '';

    let baseGreeting = `Hey ${name}, let's look at your momentum. `;

    if (reviews.length < 2 && plans.length < 2) {
        return baseGreeting + "Complete a few more weekly plans and Friday reviews so I can start learning your working patterns and generating personalized insights.";
    }

    // Logic 1: Check Follow-ups vs Visibility (Sales Bottleneck)
    const recentPlans = plans.slice(-3); // Last 3 plans
    let visibilityCount = 0;
    let followUpCount = 0;
    let revActionCount = 0;

    recentPlans.forEach(p => {
        if (p.visibilityAction && p.visibilityAction.length > 5) visibilityCount++;
        if (p.followUps && p.followUps.length > 5 && !p.followUps.toLowerCase().includes('none')) followUpCount++;
        if (p.revenueAction && p.revenueAction.length > 5) revActionCount++;
    });

    if (visibilityCount >= 2 && followUpCount === 0) {
        let msg = baseGreeting + "I'm noticing you've had strong visibility over the last few weeks, which is fantastic! However, I don't see many follow-ups planned. ";
        if (bottleneck.includes('Sales')) {
            msg += "Since you mentioned sales conversion is a bottleneck for you right now, I highly recommend scheduling two follow-up conversations this week to convert that generated interest into revenue.";
        } else {
            msg += "Consider scheduling two follow-up conversations this week to ensure that visibility turns into revenue.";
        }
        return msg;
    }

    if (revActionCount < 2 && recentPlans.length >= 3) {
        return baseGreeting + "I noticed that revenue-generating actions haven't been your main focus for the past couple of weeks. As a CEO, protecting your revenue time is crucial. Let's make direct sales conversations or a promotional push your top priority this week.";
    }

    // Logic 2: Review difficulty analysis (Delivery/Time bottleneck)
    const recentReviews = reviews.slice(-3);
    let difficultMentionsEmailOrContent = false;
    recentReviews.forEach(r => {
        if (r.difficult) {
            const difficult = r.difficult.toLowerCase();
            if (difficult.includes('email') || difficult.includes('content') || difficult.includes('writing') || difficult.includes('post')) {
                difficultMentionsEmailOrContent = true;
            }
        }
    });

    if (difficultMentionsEmailOrContent) {
        let msg = baseGreeting + "You've consistently mentioned content creation or email writing as a drain in your recent Friday reviews. ";
        if (bottleneck.includes('Time')) {
            msg += "Since time and delivery are already tight for you, consider batch-creating your content, lowering your posting volume, or dedicating a specific 90-minute block early in the week to get it out of the way.";
        } else {
            msg += "Consider lowering the volume, or dedicating a specific focused block early in the week to get it out of the way before it drains your energy.";
        }
        return msg;
    }

    // Default positive reinforcement
    return baseGreeting + "You are consistently logging your plans and protecting your CEO time—well done! Keep focusing closely on your revenue-generating actions and notice what brings you energy this week.";
}

function coachAttachEvents() {
    // Nav active state update
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-coach')?.classList.add('active');

    const form = document.getElementById('decision-filter-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const idea = document.getElementById('idea-input').value.toLowerCase();
            const store = getStore();
            const focus = (store.goals?.focus || '').toLowerCase();
            const priorities = (store.goals?.priorities || []).join(' ').toLowerCase();
            const mode = (store.profile?.strategyMode || '').toLowerCase();

            let score = "Busy Work";
            let color = "#B42318";
            let bg = "#FEE4E2";
            let explanation = "This idea does not strongly align with your current 90-day focus or priorities. It may be a distraction. Put it in an idea parking lot for the next quarter.";

            // Basic AI simulation logic using keyword matching
            const ideaWords = idea.split(' ').filter(w => w.length > 3);
            let matchCount = 0;

            ideaWords.forEach(word => {
                if (focus.includes(word) || priorities.includes(word) || mode.includes(word)) {
                    matchCount++;
                }
            });

            if (matchCount >= 2 || (idea.includes('course') && mode.includes('offer')) || (idea.includes('post') && mode.includes('audience'))) {
                score = "Strategic";
                color = "#027A48";
                bg = "#E1FDF4";
                explanation = "This idea strongly supports your current 90-day focus and aligns with your Strategy Mode. It's a solid action to add to your weekly plan.";
            } else if (matchCount === 1 || idea.includes('email') || idea.includes('client')) {
                score = "Busy Work";
                color = "#B54708";
                bg = "#FEF0C7";
                explanation = "This idea has some alignment with your goals, but might be secondary to your Top 3 Priorities. Only proceed if you have extra capacity this week.";
            }

            const scoreEl = document.getElementById('alignment-score');
            scoreEl.textContent = score;
            scoreEl.style.color = color;
            scoreEl.style.backgroundColor = bg;

            document.getElementById('alignment-explanation').textContent = explanation;
            document.getElementById('decision-result').style.display = 'block';
        });
    }
}


// --- js\screens\monthlyReview.js ---
// monthlyReview.js

function renderMonthlyReview() {
    window.setScreenModule({ attachEvents: monthlyReviewAttachEvents });
    const store = getStore();
    const reflectionSummary = generateReflectionSummary(store);

    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 700px;">
            <div style="margin-bottom: 2rem;">
                <h2>Monthly CEO Strategy Review</h2>
                <p style="color: var(--color-text-muted);">A deeper 30-day reflection to refine your strategy and eliminate distractions.</p>
            </div>

            <div class="card mb-8" style="border-left: 4px solid var(--color-accent); background-color: var(--color-bg-light);">
                <div class="flex items-center gap-2 mb-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-dark)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    <h3 style="margin: 0; color: var(--color-accent-dark);">AI Reflection Summary</h3>
                </div>
                <p style="font-size: 1rem; color: var(--color-text-main); margin: 0; line-height: 1.5;">
                    ${reflectionSummary}
                </p>
            </div>

            <form id="monthly-review-form" class="card">
                <div class="form-group mb-6 text-center" style="background: var(--color-bg-main); padding: 1.5rem; border-radius: var(--radius-md); border: 1px dashed var(--color-border);">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.95rem; color: var(--color-text-main); margin-bottom: 1rem;">
                        Easier to talk it out? Use Voice Reflection to fill out your review.
                        ${renderTooltip("A hands-free way to log your month.", "Talking out loud helps you process your thoughts faster and ensures you actually complete the deep reflection.")}
                    </p>
                    <button type="button" id="btn-voice-reflection" class="btn btn-secondary" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; max-width: 300px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                        <span id="voice-btn-text">Start Voice Reflection</span>
                    </button>
                    <p id="voice-status" style="font-size: 0.85rem; color: var(--color-primary-dark); margin-top: 0.75rem; display: none; font-weight: 500;">Listening...</p>
                </div>

                <div class="form-group">
                    <label class="form-label" style="font-size: 1.1rem; color: #027A48;">1. What activity generated the most leads or interest this month?</label>
                    <textarea class="form-textarea" id="mrev-leads" placeholder="e.g., Hosting the 3-day challenge, speaking on that podcast." required style="min-height: 80px;"></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem; color: var(--color-primary-dark);">2. What specific action generated actual sales?</label>
                    <textarea class="form-textarea" id="mrev-sales" placeholder="e.g., Direct DMs to past clients, the webinar pitch." required style="min-height: 80px;"></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem; color: #B42318;">3. What drained your energy or felt misaligned?</label>
                    <textarea class="form-textarea" id="mrev-drain" placeholder="e.g., Trying to post on TikTok 3x a day, managing my own inbox." required style="min-height: 80px;"></textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem;">4. What should be eliminated or delegated next month?</label>
                    <textarea class="form-textarea" id="mrev-eliminate" placeholder="e.g., I need to stop designing my own graphics and hire a VA." required style="min-height: 80px;"></textarea>
                </div>

                <div class="flex justify-end mt-8">
                    <button type="submit" class="btn btn-primary">Generate My CEO Summary</button>
                </div>
            </form>
            
            <div id="monthly-summary-result" style="display: none; margin-top: 2rem;">
                <!-- Filled via JS -->
            </div>
        </div>
    `;
}

function monthlyReviewAttachEvents() {
    // Nav active state - we don't have a specific nav link for this yet, so we can just clear active states or highlight progress
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    // Voice Reflection Logic
    const voiceBtn = document.getElementById('btn-voice-reflection');
    const voiceBtnText = document.getElementById('voice-btn-text');
    const voiceStatus = document.getElementById('voice-status');
    let recognition = null;
    let isRecording = false;
    let activeTextArea = document.getElementById('mrev-leads'); // Default target

    // Track active text area
    document.querySelectorAll('.form-textarea').forEach(ta => {
        ta.addEventListener('focus', (e) => {
            activeTextArea = e.target;
        });
    });

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = function () {
            isRecording = true;
            voiceBtn.classList.remove('btn-secondary');
            voiceBtn.classList.add('btn-primary');
            voiceBtnText.textContent = "Stop Recording";
            voiceStatus.style.display = "block";
        };

        recognition.onresult = function (event) {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript && activeTextArea) {
                // Append with a space if there's already text
                activeTextArea.value += (activeTextArea.value ? ' ' : '') + finalTranscript.trim() + '.';
            }
        };

        recognition.onerror = function (event) {
            console.error("Speech recognition error", event.error);
            stopRecording();
            alert("Microphone error. Please check permissions.");
        };

        recognition.onend = function () {
            stopRecording();
        };
    } else {
        if (voiceBtn) {
            voiceBtn.style.display = 'none';
        }
    }

    function stopRecording() {
        isRecording = false;
        if (recognition) recognition.stop();
        if (voiceBtn) {
            voiceBtn.classList.add('btn-secondary');
            voiceBtn.classList.remove('btn-primary');
            voiceBtnText.textContent = "Start Voice Reflection";
        }
        if (voiceStatus) {
            voiceStatus.style.display = "none";
        }
    }

    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            if (isRecording) {
                stopRecording();
            } else {
                if (recognition) {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        });
    }

    const form = document.getElementById('monthly-review-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (isRecording) stopRecording();

            const review = {
                leads: document.getElementById('mrev-leads').value,
                sales: document.getElementById('mrev-sales').value,
                drain: document.getElementById('mrev-drain').value,
                eliminate: document.getElementById('mrev-eliminate').value
            };

            // Save the monthly review to store
            addMonthlyReview(review);

            // Generate Summary Output
            const resultDiv = document.getElementById('monthly-summary-result');
            form.style.display = 'none'; // Hide the form

            // Basic AI logic summary synthesis
            let primaryDriver = review.leads.split(' ')[0] || "Your marketing"; // Crude extraction
            if (review.leads.length > 20) {
                const words = review.leads.split(' ');
                primaryDriver = words.slice(0, 3).join(' ');
            }

            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <div class="card" style="border-top: 4px solid var(--color-primary); background-color: #f9f9ff;">
                    <h3 class="mb-4">Your Monthly CEO Summary is Ready</h3>
                    
                    <div style="margin-bottom: 1.5rem;">
                        <p style="font-weight: 600; color: var(--color-primary-dark); margin-bottom: 0.5rem;">The High-Impact Action</p>
                        <p style="font-size: 1rem; line-height: 1.5;">Your highest-impact activity this month was <strong>"${primaryDriver}..."</strong>. Weeks where you prioritize this tend to yield significantly better results. Double down on this next month.</p>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <p style="font-weight: 600; color: #B42318; margin-bottom: 0.5rem;">The Elimination Directive</p>
                        <p style="font-size: 1rem; line-height: 1.5;">You noted a drain regarding: <em>"${review.drain}"</em>. Your CEO directive for next month is to ruthlessly eliminate, automate, or delegate: <strong>${review.eliminate}</strong>.</p>
                    </div>
                    
                    <div class="flex justify-center mt-6">
                        <a href="#/progress" class="btn btn-secondary">Go to Progress Dashboard</a>
                    </div>
                </div>
            `;

            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

function generateReflectionSummary(store) {
    const reviews = store.reviews || [];

    if (reviews.length < 2) {
        return "Not enough data yet. Complete at least 2-3 weekly Friday Reviews for the AI to detect patterns in your momentum and bottlenecks.";
    }

    // Grab the last 4 reviews
    const recentReviews = reviews.slice(-4);

    // Analyze "workedWell" themes
    let winsText = recentReviews.map(r => (r.workedWell || '') + ' ' + (r.movedForward || '')).join(' ').toLowerCase();
    let effectiveThemes = [];

    if (winsText.includes('teaching') || winsText.includes('live') || winsText.includes('webinar') || winsText.includes('call') || winsText.includes('workshop')) effectiveThemes.push("live teaching and showing up visible");
    if (winsText.includes('follow') || winsText.includes('dm') || winsText.includes('outreach') || winsText.includes('pitch') || winsText.includes('message')) effectiveThemes.push("direct follow-ups and outreach");
    if (winsText.includes('email') || winsText.includes('newsletter') || winsText.includes('sequence') || winsText.includes('flow')) effectiveThemes.push("email marketing campaigns");
    if (winsText.includes('content') || winsText.includes('post') || winsText.includes('reel') || winsText.includes('video') || winsText.includes('tiktok')) effectiveThemes.push("consistent content creation");
    if (winsText.includes('system') || winsText.includes('automation') || winsText.includes('funnel') || winsText.includes('page')) effectiveThemes.push("backend systems and automation");

    if (effectiveThemes.length === 0) effectiveThemes.push("focused, uninterrupted action"); // default fallback

    // Analyze "difficult" themes
    let drainText = recentReviews.map(r => (r.difficult || '') + ' ' + (r.nextWeekImprove || '')).join(' ').toLowerCase();
    let drainThemes = [];

    if (drainText.includes('focus') || drainText.includes('scattered') || drainText.includes('distracted') || drainText.includes('shiny')) drainThemes.push("unclear weekly focus and distraction");
    if (drainText.includes('time') || drainText.includes('schedule') || drainText.includes('late') || drainText.includes('behind')) drainThemes.push("time management and boundary setting");
    if (drainText.includes('content') || drainText.includes('write') || drainText.includes('edit') || drainText.includes('post')) drainThemes.push("content creation bottlenecks");
    if (drainText.includes('overwhelm') || drainText.includes('burnout') || drainText.includes('tired') || drainText.includes('exhausted')) drainThemes.push("over-committing to too many tasks");
    if (drainText.includes('tech') || drainText.includes('tool') || drainText.includes('broken')) drainThemes.push("technology and tool friction");

    if (drainThemes.length === 0) drainThemes.push("maintaining execution consistency"); // default fallback

    // Choose top themes
    const topEffective = effectiveThemes.slice(0, 2).join(' and ');
    const topDrain = drainThemes[0];

    return `Based on your past ${recentReviews.length} weeks of CEO reviews:<br><br><strong>Your most effective weeks included ${topEffective}.<br>Your biggest recurring bottleneck appears to be <span style="color: var(--color-error);">${topDrain}</span>.</strong><br><br>Keep these patterns in mind when completing your monthly strategic review below.`;
}


// --- js\screens\mondayPlan.js ---

let mondayStep = 1;
const MONDAY_TOTAL_STEPS = 5;
let mondayPlanData = {
    weeklyFocus: '',
    priorities: ['', '', ''],
    revenueAction: '',
    daily3: ['', '', '']
};

function renderMondayPlan() {
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

            // 2.5 Save the specific tasks for Monday immediately into the daily log
            const todayStr = new Date().toISOString().split('T')[0];
            const cleanTasks = mondayPlanData.daily3.map(t => ({ text: t, done: false }));
            updateDailyLog(todayStr, cleanTasks);

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


// --- js\screens\auth.js ---
// auth.js

function renderAuth(isSignup = false) {
    window.setScreenModule({ attachEvents: authAttachEvents });

    const title = isSignup ? "Create your account" : "Log in to your account";
    const subtitle = isSignup ? "Start your 90-day CEO journey today." : "Welcome back! Please enter your details.";
    const btnText = isSignup ? "Create Account" : "Sign In";
    const switchText = isSignup ? "Already have an account? <a href='#/login' style='color: var(--color-primary-dark); text-decoration: none; font-weight: 600;'>Log in</a>" : "Don't have an account? <a href='#/signup' style='color: var(--color-primary-dark); text-decoration: none; font-weight: 600;'>Sign up</a>";

    return `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-bg-main) 100%); padding: 1.5rem;">
            <div class="card" style="width: 100%; max-width: 440px; padding: 2.5rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(10px);">
                
                <div style="text-align: center; margin-bottom: 2rem;">
                    <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: var(--color-primary); color: white; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: 0 4px 6px -1px rgba(78, 14, 255, 0.3);">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
                    </div>
                    <h2 style="font-size: 1.75rem; color: var(--color-black); margin-bottom: 0.5rem; letter-spacing: -0.02em;">${title}</h2>
                    <p style="color: var(--color-text-muted); font-size: 0.95rem;">${subtitle}</p>
                </div>

                <form id="auth-form" style="display: flex; flex-direction: column; gap: 1.25rem;">
                    ${isSignup ? `
                    <div class="form-group" style="margin: 0;">
                        <label style="font-size: 0.875rem; font-weight: 500; color: var(--color-text-main); margin-bottom: 0.4rem;">Full Name</label>
                        <input type="text" id="auth-name" class="form-input" placeholder="Enter your name" required style="border-radius: 8px;">
                    </div>
                    ` : ''}

                    <div class="form-group" style="margin: 0;">
                        <label style="font-size: 0.875rem; font-weight: 500; color: var(--color-text-main); margin-bottom: 0.4rem;">Email</label>
                        <input type="email" id="auth-email" class="form-input" placeholder="Enter your email" required style="border-radius: 8px;">
                    </div>

                    <div class="form-group" style="margin: 0;">
                        <label style="font-size: 0.875rem; font-weight: 500; color: var(--color-text-main); margin-bottom: 0.4rem; display: flex; justify-content: space-between;">
                            Password
                            ${!isSignup ? `<a href="#" style="color: var(--color-primary); text-decoration: none; font-size: 0.8rem;">Forgot password?</a>` : ''}
                        </label>
                        <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required style="border-radius: 8px;" minlength="6">
                    </div>

                    <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 1rem; border-radius: 8px; margin-top: 0.5rem; box-shadow: 0 4px 6px -1px rgba(78, 14, 255, 0.2);">${btnText}</button>
                </form>

                <div style="text-align: center; margin-top: 2rem; font-size: 0.9rem; color: var(--color-text-muted);">
                    ${switchText}
                </div>
            </div>
        </div>
    `;
}

function authAttachEvents() {
    const form = document.getElementById('auth-form');
    // Determine if we are on the signup screen by looking for the explicit signup field
    const isSignup = document.getElementById('auth-name') !== null;

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // In a real app, this would hit an API via fetch().
            // For MVP, we simply authenticate the user via local storage security state.
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            
            if (email && password) {
                const btn = form.querySelector('button[type="submit"]');
                const originalText = btn.innerText;
                btn.innerText = "Authenticating...";
                btn.style.opacity = '0.8';
                
                if (isSignup) {
                    const name = document.getElementById('auth-name').value;
                    // Real Supabase Signup
                    db.auth.signUp({
                        email: email,
                        password: password,
                        options: { data: { name: name } }
                    }).then(async ({ data, error }) => {
                        if (error) {
                            alert("Sign up failed: " + error.message);
                            btn.innerText = originalText;
                            btn.style.opacity = '1';
                        } else {
                            localStorage.setItem('ceo_auth', 'true');
                            window.location.hash = '#/';
                            window.location.reload();
                        }
                    });
                } else {
                    // Real Supabase Login
                    db.auth.signInWithPassword({
                        email: email,
                        password: password
                    }).then(async ({ data, error }) => {
                        if (error) {
                            alert("Login failed: " + error.message);
                            btn.innerText = originalText;
                            btn.style.opacity = '1';
                        } else {
                            // Fetch user's cloud data and populate local storage BEFORE reloading the app
                            try {
                                const { data: dbData, error: dbError } = await db
                                    .from('user_data')
                                    .select('data')
                                    .eq('user_id', data.user.id)
                                    .single();
                                
                                if (dbData && dbData.data) {
                                    localStorage.setItem('ceoPlanner_store', JSON.stringify(dbData.data));
                                }
                            } catch (err) {
                                console.log("No cloud profile found or error fetching. Starting fresh.", err);
                            }

                            localStorage.setItem('ceo_auth', 'true');
                            window.location.hash = '#/';
                            window.location.reload();
                        }
                    });
                }
            }
        });
    }
}


// --- js\app.js ---
// app.js

// Screens
// We'll import these dynamically or define them later to handle page renders

const appContainer = document.getElementById('app-container');

// Simple Router
function router() {
    const hash = window.location.hash || '#/';
    
    // Auth Intercept
    const isAuthenticated = localStorage.getItem('ceo_auth') === 'true';
    if (!isAuthenticated && hash !== '#/login' && hash !== '#/signup') {
        window.location.hash = '#/login';
        return;
    }
    if (isAuthenticated && (hash === '#/login' || hash === '#/signup')) {
        window.location.hash = '#/';
        return;
    }

    appContainer.innerHTML = ''; // Clear current content
    
    // Check if user has completed setup
    const store = getStore();
    const isSetupComplete = store.goals && store.goals.focus !== '';

    if (!isSetupComplete && hash !== '#/' && hash !== '#/wizard') {
        window.location.hash = '#/';
        return;
    }

    switch(hash) {
        case '#/login':
            appContainer.innerHTML = renderAuth(false);
            break;
        case '#/signup':
            appContainer.innerHTML = renderAuth(true);
            break;
        case '#/':
            if (isSetupComplete) {
                window.location.hash = '#/dashboard';
            } else {
                appContainer.innerHTML = renderWelcome();
            }
            break;
        case '#/wizard':
            appContainer.innerHTML = renderWizard();
            break;
        case '#/dashboard':
            appContainer.innerHTML = renderDashboard();
            break;
        case '#/planner':
            appContainer.innerHTML = renderPlanner();
            break;
        case '#/revenue':
            appContainer.innerHTML = renderRevenue();
            break;
        case '#/review':
            appContainer.innerHTML = renderReview();
            break;
        case '#/coach':
            appContainer.innerHTML = renderCoach();
            break;
        case '#/monthly-review':
            appContainer.innerHTML = renderMonthlyReview();
            break;
        case '#/progress':
            appContainer.innerHTML = renderProgress();
            break;
        case '#/settings':
            appContainer.innerHTML = renderSettings();
            break;
        case '#/quarter-reset':
            appContainer.innerHTML = renderQuarterReset();
            break;
        case '#/monday-plan':
            appContainer.innerHTML = renderMondayPlan();
            break;
        default:
            appContainer.innerHTML = renderDashboard();
    }
    
    // Call post-render hook so screens can attach event listeners
    attachEventListeners(hash);
}

function attachEventListeners(hash) {
    if (window.currentScreen && typeof window.currentScreen.attachEvents === 'function') {
        window.currentScreen.attachEvents();
    }
}

// Global hook to attach screen-specific event modules
window.setScreenModule = function(module) {
    window.currentScreen = module;
};

// Initialize
window.addEventListener('hashchange', router);
window.addEventListener('load', () => {
    // Optionally seed data for testing
    // seedMockData(); 
    router();
});



