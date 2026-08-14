// nav.js
import { getStore } from '../store.js';
import { isProTrial, trialDaysLeft, anyProFeatureLive } from './proGate.js';

// Signs the user out properly. The old inline handler cleared localStorage but
// never called signOut, so the Supabase sb-*-auth-token survived: the next person
// at that browser was still authenticated. Mirrors the sign-out in billing.js.
export async function signOutAndClear() {
    try {
        await window.db.auth.signOut();
    } catch (err) {
        // Network down or session already gone. Still clear locally — leaving them
        // "logged in" on this device would be the worse outcome.
        console.warn('Supabase sign-out failed, clearing locally anyway:', err?.message);
    }
    localStorage.removeItem('ceo_auth');
    localStorage.removeItem('ceo_sub_status');
    localStorage.removeItem('ceo_trial_ends_at');
    localStorage.removeItem('ceo_plan_tier');
    localStorage.removeItem('ceoPlanner_store');
    window.location.hash = '#/login';
    window.location.reload();
}

// A countdown, and only for people on the trial. The whole reason the free
// fortnight runs on the Pro feature set is that losing something you have used
// is what makes the upgrade make sense later, and that only works if the user
// knew what she had — so once any Pro feature exists, this says "Pro trial"
// rather than just "trial".
//
// Base subscribers get nothing here on purpose. A permanent "upgrade" pill in a
// paying customer's nav is a nag; Account is one click away and explains Pro
// properly when she actually wants to know.
function renderPlanPill() {
    if (!isProTrial()) return '';

    const noun = anyProFeatureLive() ? 'Pro trial' : 'Free trial';
    const days = trialDaysLeft();
    const label = days === null
        ? noun
        : (days === 1 ? `${noun}, 1 day left` : `${noun}, ${days} days left`);

    return `<a href="#/account" class="nav-plan-pill" title="See your plan and choose one whenever you're ready">${label}</a>`;
}

export function renderNav() {
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
            <button class="mobile-menu-btn" onclick="document.querySelector('.nav-links').classList.toggle('active')" aria-label="Toggle menu">
                ☰
            </button>
            <nav class="nav-links">
                <a href="#/dashboard" class="nav-link" id="nav-dashboard">Dashboard</a>
                <a href="#/roadmap" class="nav-link" id="nav-roadmap">90-Day Plan</a>
                <a href="#/planner" class="nav-link" id="nav-planner">Weekly Plan</a>
                <a href="#/revenue" class="nav-link" id="nav-revenue">Revenue</a>
                <a href="#/review" class="nav-link" id="nav-review">Friday Review</a>
                <a href="#/coach" class="nav-link" id="nav-coach">Notepad</a>
                <a href="#/monthly-review" class="nav-link" id="nav-monthly-review">Monthly Review</a>
                <a href="#/progress" class="nav-link" id="nav-progress">Wins & Progress</a>
                <a href="#/settings" class="nav-link" id="nav-settings">Settings</a>
                <a href="#/account" class="nav-link" id="nav-account">Account</a>
                ${renderPlanPill()}
                <a href="#" class="nav-link" id="nav-logout" style="color: #FCA5A5;">Log Out</a>
            </nav>
        </header>
    `;
}

