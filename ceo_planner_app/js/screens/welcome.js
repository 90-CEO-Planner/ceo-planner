// welcome.js
import { updateProfile } from '../store.js';

export function renderWelcome() {
    // We bind the event listeners after HTML is rendered using setScreenModule
    window.setScreenModule({ attachEvents: welcomeAttachEvents });

    const isAuthenticated = localStorage.getItem('ceo_auth') === 'true';
    const skipButton = isAuthenticated ? `
        <div style="margin-top: 1rem; text-align: center;">
            <button type="button" onclick="localStorage.removeItem('ceo_auth'); localStorage.removeItem('ceoPlanner_store'); window.db.auth.signOut().then(() => { window.location.hash='#/login'; window.location.reload(); });" class="btn" style="background: transparent; border: 1px solid var(--color-primary); color: var(--color-primary); width: 100%;">Log Out to Reset Session</button>
            <p style="color: var(--color-text-muted); font-size: 0.8rem; margin-top: 0.5rem;">Clicking "Log Out" will let you log in to sync your data again.</p>
        </div>
    ` : '';

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
                    ${skipButton}
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
