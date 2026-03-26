// nav.js
import { getStore } from '../store.js';

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
