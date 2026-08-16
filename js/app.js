// app.js
import { getStore, seedMockData, getLocalDateString, REMINDER_WEEKLY, REMINDER_DAILY, REMINDER_FRIDAY } from './store.js';
import { signOutAndClear } from './components/nav.js';
import { initProGate } from './components/proGate.js';
import { applyStripePreviewParam } from './stripeImport.js';

// Screens
// We'll import these dynamically or define them later to handle page renders
import { renderWelcome } from './screens/welcome.js';
import { renderWizard } from './screens/wizard.js';
import { renderDashboard } from './screens/dashboard.js';
import { renderPlanner } from './screens/weeklyPlanner.js';
import { renderRevenue } from './screens/revenue.js';
import { renderReview } from './screens/fridayReview.js';
import { renderProgress } from './screens/progress.js';
import { renderSettings } from './screens/settings.js';
import { renderAccount } from './screens/account.js';
import { renderQuarterReset } from './screens/quarterReset.js';
import { renderCoach } from './screens/coach.js';
import { renderMonthlyReview } from './screens/monthlyReview.js';
import { renderMondayPlan } from './screens/mondayPlan.js';
import { renderAuth } from './screens/auth.js';
import { renderRoadmap } from './screens/roadmap.js';
import { renderBilling } from './screens/billing.js';

const appContainer = document.getElementById('app-container');

// Simple Router
function router() {
    const hash = window.location.hash || '#/';
    const path = hash.split('?')[0];
    
    // Auth Intercept
    const isAuthenticated = localStorage.getItem('ceo_auth') === 'true';
    
    // Boot up the localized notification engine
    if (isAuthenticated) checkPushNotifications();
    
    const isAuthRoute = path === '#/login' || path === '#/signup' || path === '#/forgot-password' || path === '#/reset-password';
    
    // Dynamic AI Widget display toggling
    const widget = document.getElementById('ceo-ai-widget');
    if (widget) {
        if (path === '#/wizard' || isAuthRoute || path === '#/billing') {
            widget.style.display = 'none';
        } else {
            widget.style.display = 'block';
        }
    }

    if (!isAuthenticated && !isAuthRoute) {
        window.location.hash = '#/login';
        return;
    }
    if (isAuthenticated && (path === '#/login' || path === '#/signup' || path === '#/forgot-password')) {
        window.location.hash = '#/';
        return;
    }

    // Paywall Intercept
    if (isAuthenticated) {
        const subStatus = localStorage.getItem('ceo_sub_status');
        const locked = window.isLockedOut(subStatus);
        if (locked && path !== '#/billing') {
            window.location.hash = '#/billing';
            return;
        }
        // Someone still in their trial is allowed to visit billing to subscribe
        // early. Only send paying subscribers away from it.
        if (!locked && subStatus === 'active' && path === '#/billing') {
            window.location.hash = '#/';
            return;
        }
    }

    appContainer.innerHTML = ''; // Clear current content
    
    // Check if user has completed setup (only if authenticated)
    const store = getStore();
    const isSetupComplete = store.goals && store.goals.focus !== '';

    if (!isSetupComplete && path !== '#/wizard' && !isAuthRoute && path !== '#/billing') {
        window.location.hash = '#/wizard';
        return;
    }

    switch(path) {
        case '#/login':
            appContainer.innerHTML = renderAuth('login');
            break;
        case '#/signup':
            appContainer.innerHTML = renderAuth('signup');
            break;
        case '#/forgot-password':
            appContainer.innerHTML = renderAuth('forgot');
            break;
        case '#/reset-password':
            appContainer.innerHTML = renderAuth('reset');
            break;
        case '#/billing':
            appContainer.innerHTML = renderBilling();
            break;
        case '#/':
            if (isSetupComplete) {
                window.location.hash = '#/dashboard';
            } else {
                window.location.hash = '#/wizard';
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
        case '#/account':
            appContainer.innerHTML = renderAccount();
            break;
        case '#/quarter-reset':
            appContainer.innerHTML = renderQuarterReset();
            break;
        case '#/monday-plan':
            appContainer.innerHTML = renderMondayPlan();
            break;
        case '#/roadmap':
            appContainer.innerHTML = renderRoadmap();
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

// Local Notification Engine (Active Tab Only for MVP)
function checkPushNotifications() {
    const store = getStore();
    if (!store.profile || !store.profile.reminderTimes) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const now = new Date();
    const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const hour = now.getHours();
    
    const lastFiredStore = JSON.parse(localStorage.getItem('ceo_notif_last') || '{}');
    const todayStr = getLocalDateString(now);
    
    const fireLocalNotification = (key, title, body) => {
        if (lastFiredStore[key] !== todayStr) {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, { body, icon: "./icon-192.png" });
                });
            } else {
                new Notification(title, { body });
            }
            lastFiredStore[key] = todayStr;
            localStorage.setItem('ceo_notif_last', JSON.stringify(lastFiredStore));
        }
    };

    const planningDay = store.profile.planningDay || 'Monday';
    
    if (store.profile.reminderTimes.includes(REMINDER_WEEKLY) && todayName === planningDay && hour >= 8) {
        fireLocalNotification('weekly_prompt', 'Weekly CEO Planning', 'Time to plan your week and stay focused on your 90-day trajectory.');
    }

    if (store.profile.reminderTimes.includes(REMINDER_DAILY) && hour >= 12) {
        fireLocalNotification('daily_priority', 'Daily Check-in', 'Have you finalized your primary priority block for today?');
    }

    if (store.profile.reminderTimes.includes(REMINDER_FRIDAY) && todayName === 'Friday' && hour >= 14) {
        fireLocalNotification('friday_review', 'Friday Review', 'Time to log your wins and track your revenue for the week!');
    }

    // --- Trial Notification Sequence ---
    const trialStartDateStr = store.profile?.trialStartDate;
    if (trialStartDateStr) {
        const trialStart = new Date(trialStartDateStr);
        const diffMs = now - trialStart;
        const elapsedDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        const fireTrialNotification = (dayNum, targetHour, notifKey, title, body) => {
            if (elapsedDays === dayNum && hour >= targetHour) {
                const globalKey = `trial_day_${dayNum}_${notifKey}`;
                if (!localStorage.getItem(globalKey)) {
                    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                        navigator.serviceWorker.ready.then(reg => {
                            reg.showNotification(title, { body, icon: "./icon-192.png" });
                        });
                    } else {
                        new Notification(title, { body });
                    }
                    localStorage.setItem(globalKey, 'fired');
                }
            }
        };

        // Day 1 - 9am
        fireTrialNotification(0, 9, 'priorities', 'CEO Command Center', 'What are your 3 priorities this week? Your Daily 3 is waiting');

        // Day 3 - 8am
        fireTrialNotification(2, 8, 'morning_check', 'Daily CEO Check-in', "Morning CEO check-in: your Daily 3 is ready. 3 tasks. That's all it takes today.");

        // Day 5 - Friday - 9am
        fireTrialNotification(4, 9, 'friday_review', 'CEO Friday Review', "It's Friday — time for your CEO Review. 5 mins to close out the week like a pro.");

        // Day 7 - 9am
        fireTrialNotification(6, 9, 'coach_insights', 'CEO Strategy Update', "You're one week in. Your Executive AI Coach has insights ready — tap to see your Focus Score.");

        // Day 12 - 10am
        fireTrialNotification(11, 10, 'trial_ending', 'CEO Trial Ending', "2 days left on your free trial. Don't lose your plans, streaks & data — stay on as CEO");
    }
}

// Re-checks the trial against the database and re-routes if it has expired.
// Without this, someone who signs up and stays logged in would never be
// re-checked, because the cached status is only written at login.
async function revalidateAccess() {
    if (localStorage.getItem('ceo_auth') !== 'true') return;

    const before = localStorage.getItem('ceo_sub_status');
    const beforeTier = localStorage.getItem('ceo_plan_tier');
    const access = await window.refreshAccessState();
    if (!access) return; // Offline or unreachable. Leave them as they were.

    // Re-render on a tier change too, not just a status change. Base → Pro keeps
    // the status at 'active', so without this an upgrade would leave every lock
    // in place until the next page load.
    if (access.status !== before || access.tier !== beforeTier) router();
}

// Checkout happens on Stripe's own page, so the app usually finds out that
// someone has paid only on the next load or the next hourly poll. Someone who
// pays in a second tab and switches back to this one would otherwise sit
// looking at "you're on the free trial" for up to an hour, with the locks still
// on. Re-check whenever the tab comes back to the foreground, throttled so that
// ordinary tab-flicking doesn't hammer the database.
const REVALIDATE_MIN_GAP_MS = 30000;
let lastRevalidatedAt = 0;

function revalidateOnReturn() {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastRevalidatedAt < REVALIDATE_MIN_GAP_MS) return;
    lastRevalidatedAt = now;
    revalidateAccess();
}

// Purge keys earlier versions wrote that should never have been stored. This runs
// once per load and is cheap; without it, a password written before the fix would
// sit in a user's browser indefinitely, because nothing else ever removes it.
function purgeLegacyKeys() {
    ['ceo_remembered_password', 'ceo_openai_key'].forEach(key => {
        if (localStorage.getItem(key) !== null) {
            localStorage.removeItem(key);
            console.info(`Removed obsolete stored key: ${key}`);
        }
    });
}

// The nav is re-rendered by every screen, so bind logout once here by delegation
// rather than asking each screen to remember to wire it up.
function bindGlobalNavEvents() {
    document.addEventListener('click', (e) => {
        const logout = e.target.closest('#nav-logout');
        if (!logout) return;
        e.preventDefault();
        signOutAndClear();
    });
}

// Initialize
window.addEventListener('hashchange', router);
window.addEventListener('load', () => {
    purgeLegacyKeys();
    // ?stripe_preview=1 turns on the pre-launch Stripe import card for this
    // browser. Must run before router(), so the first render already sees it.
    applyStripePreviewParam();
    bindGlobalNavEvents();
    // One delegated handler for every locked Pro control, bound once. Screens
    // render `data-pro-feature="..."` and never wire anything up themselves.
    initProGate();
    router();

    // Confirm the trial is still valid against the database, not just localStorage
    lastRevalidatedAt = Date.now();
    revalidateAccess();
    // And re-check hourly, so a long-open tab doesn't outlive the trial
    setInterval(revalidateAccess, 3600000);
    // ...plus whenever they come back to the tab, which is how the app notices a
    // Stripe checkout completed somewhere else.
    document.addEventListener('visibilitychange', revalidateOnReturn);

    // Start background notification polling engine
    setInterval(checkPushNotifications, 60000);
    checkPushNotifications();

    // Initialize Generative AI global widget (checks for admin internally)
    if (typeof initChatWidget === 'function') {
        initChatWidget();
    }
});
