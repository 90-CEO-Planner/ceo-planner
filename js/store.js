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
    leads: {
        quarterlyGoal: 0,
        entries: [] // Array of { id, date, amount, source }
    },
    metrics: [], // Array of { id, date, traffic, calls, social }
    settings: {
        currency: '$'
    },
    weeklyPlans: [], // Array of plan objects
    reviews: [], // Array of review objects
    monthlyReviews: [], // Array of monthly review objects
    dailyLogs: {}, // Dict of { "2023-11-20": [{text: "Task 1", done: false}, ...] }
    streak: 0, // Friday Review Streak
    planningStreak: 0 // Monday Plan Streak
};

export function getStore() {
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
                leads: { ...defaultState.leads, ...(parsed.leads || {}) },
                settings: { ...defaultState.settings, ...(parsed.settings || {}) },
                metrics: parsed.metrics || [],
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

export function saveStore(state) {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
        
        // Fire-and-forget background cloud sync
        if (localStorage.getItem('ceo_auth') === 'true') {
            window.db.auth.getSession().then(({ data: sessionData }) => {
                if (sessionData && sessionData.session) {
                    const user = sessionData.session.user;
                    window.db.from('user_data').upsert({
                        user_id: user.id,
                        data: state
                    }).then(({ error }) => {
                        if (error) {
                            console.error("Background cloud sync failed", error);
                            if (!window._syncErrorAlerted) {
                                alert("Warning: Cloud sync failed. Your data is only saved locally. Please check your Supabase RLS policies on the user_data table. Error: " + error.message);
                                window._syncErrorAlerted = true;
                            }
                        }
                    });
                }
            });
        }
    } catch (e) {
        console.error("Failed to save store to LocalStorage", e);
    }
}

export function updateProfile(profileData) {
    const store = getStore();
    store.profile = { ...store.profile, ...profileData };
    saveStore(store);
}

export function updateGoals(goalsData) {
    const store = getStore();
    store.goals = { ...store.goals, ...goalsData };
    saveStore(store);
}

export function updateRevenueSettings(settings) {
    const store = getStore();
    store.revenue = { ...store.revenue, ...settings };
    saveStore(store);
}

export function addRevenueEntry(entry) {
    const store = getStore();
    entry.id = Date.now().toString();
    entry.date = entry.date || new Date().toISOString();
    store.revenue.entries.push(entry);
    saveStore(store);
}

export function deleteRevenueEntry(id) {
    const store = getStore();
    const initialLen = store.revenue.entries.length;
    store.revenue.entries = store.revenue.entries.filter(e => String(e.id) !== String(id));
    saveStore(store);
    return store.revenue.entries.length < initialLen;
}

export function updateSettings(settings) {
    const store = getStore();
    store.settings = { ...store.settings, ...settings };
    saveStore(store);
}

export function updateLeadGoal(goal) {
    const store = getStore();
    store.leads.quarterlyGoal = goal;
    saveStore(store);
}

export function addLeadEntry(entry) {
    const store = getStore();
    entry.id = Date.now().toString();
    entry.date = entry.date || new Date().toISOString();
    store.leads.entries.push(entry);
    saveStore(store);
}

export function deleteLeadEntry(id) {
    const store = getStore();
    const initialLen = store.leads.entries.length;
    store.leads.entries = store.leads.entries.filter(e => String(e.id) !== String(id));
    saveStore(store);
    return store.leads.entries.length < initialLen;
}

export function addMetricSnapshot(snapshot) {
    const store = getStore();
    snapshot.id = Date.now().toString();
    snapshot.date = snapshot.date || new Date().toISOString();
    store.metrics.push(snapshot);
    saveStore(store);
}

export function deleteMetricSnapshot(id) {
    const store = getStore();
    const initialLen = store.metrics.length;
    store.metrics = store.metrics.filter(m => String(m.id) !== String(id));
    saveStore(store);
    return store.metrics.length < initialLen;
}

export function getRevenueInsights() {
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

export function addWeeklyPlan(plan) {
    const store = getStore();
    plan.id = Date.now().toString();
    plan.date = new Date().toISOString();
    store.weeklyPlans.push(plan);

    // Recalculate planning streak based on consecutive weeks
    store.planningStreak = calculateStreak(store.weeklyPlans);

    saveStore(store);
}

export function updateWeeklyPlan(planId, updatedFields) {
    const store = getStore();
    const index = store.weeklyPlans.findIndex(p => p.id === planId);
    if (index !== -1) {
        store.weeklyPlans[index] = { ...store.weeklyPlans[index], ...updatedFields };
        saveStore(store);
    }
}

export function updateDailyLog(dateStr, tasks) {
    const store = getStore();
    store.dailyLogs[dateStr] = tasks;
    saveStore(store);
}

export function addReview(review) {
    const store = getStore();
    review.id = Date.now().toString();
    review.date = new Date().toISOString();
    store.reviews.push(review);

    // Recalculate streak based on consecutive weeks
    store.streak = calculateStreak(store.reviews);
    saveStore(store);
}

export function addMonthlyReview(review) {
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

export function resetQuarter() {
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
export function seedMockData() {
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
