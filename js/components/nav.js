// nav.js
import { getStore } from '../store.js';

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
    localStorage.removeItem('ceoPlanner_store');
    window.location.hash = '#/login';
    window.location.reload();
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
                <a href="#" class="nav-link" id="nav-logout" style="color: #FCA5A5;">Log Out</a>
            </nav>
        </header>
    `;
}

