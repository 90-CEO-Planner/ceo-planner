// wizard.js
import { getStore, updateGoals, updateProfile } from '../store.js';

let currentStep = 1;
const TOTAL_STEPS = 6;

export function renderWizard() {
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
            <h3 class="mb-2">The Analytics Pipeline</h3>
            <p class="form-helper mb-6" style="font-size: 0.9rem;">Set your targets for revenue and leads so we can track your conversion rate.</p>
            
            <form id="wizard-form-5">
                <div class="form-group">
                    <label class="form-label" style="color: var(--color-primary-dark);">Currency Symbol</label>
                    <select class="form-input" id="currency-symbol" required style="padding: 0.75rem;">
                        <option value="$" ${store.settings?.currency === '$' ? 'selected' : ''}>$ USD/CAD/AUD</option>
                        <option value="£" ${store.settings?.currency === '£' ? 'selected' : ''}>£ GBP</option>
                        <option value="€" ${store.settings?.currency === '€' ? 'selected' : ''}>€ EUR</option>
                        <option value="¥" ${store.settings?.currency === '¥' ? 'selected' : ''}>¥ JPY/CNY</option>
                        <option value="₹" ${store.settings?.currency === '₹' ? 'selected' : ''}>₹ INR</option>
                    </select>
                </div>
                <div class="form-group mt-6">
                    <label class="form-label" style="color: var(--color-primary-dark);">Quarterly Revenue Goal</label>
                    <input type="number" class="form-input" id="rev-goal" value="${store.revenue?.quarterlyGoal || ''}" min="0" step="1" placeholder="e.g. 15000" required />
                </div>
                <div class="form-group mt-6">
                    <label class="form-label">Average Offer Price</label>
                    <input type="number" class="form-input" id="offer-price" value="${store.revenue?.averageOfferPrice || ''}" min="0" step="any" placeholder="e.g. 1500" required />
                    <span class="form-helper mt-1" style="display: block;">We'll use this to calculate how many sales you need.</span>
                </div>
                <div class="form-group mt-6">
                    <label class="form-label" style="color: var(--color-accent-dark);">Quarterly Lead Goal</label>
                    <input type="number" class="form-input" id="lead-goal" value="${store.leads?.quarterlyGoal || ''}" min="0" step="1" placeholder="e.g. 500" required />
                    <span class="form-helper mt-1" style="display: block;">How many new subscribers or leads do you want to attract?</span>
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
                updateSettings({
                    currency: document.getElementById('currency-symbol').value
                });
                updateRevenueSettings({
                    quarterlyGoal: parseFloat(document.getElementById('rev-goal').value),
                    averageOfferPrice: parseFloat(document.getElementById('offer-price').value)
                });
                updateLeadGoal(parseFloat(document.getElementById('lead-goal').value));

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
