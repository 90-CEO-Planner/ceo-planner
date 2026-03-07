// welcome.js
import { updateProfile } from '../store.js';

export function renderWelcome() {
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
