// app.js
import { getStore, seedMockData } from './store.js';

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
import { renderQuarterReset } from './screens/quarterReset.js';
import { renderCoach } from './screens/coach.js';
import { renderMonthlyReview } from './screens/monthlyReview.js';
import { renderMondayPlan } from './screens/mondayPlan.js';
import { renderAuth } from './screens/auth.js';

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
