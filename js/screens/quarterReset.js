// quarterReset.js
import { renderNav } from '../components/nav.js';
import { resetQuarter } from '../store.js';

export function renderQuarterReset() {
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
