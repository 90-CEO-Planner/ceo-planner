// wizard.js
import { getStore, updateGoals, updateProfile, applyGeneratedPlan, updateSettings, updateRevenueSettings, updateLeadGoal } from '../store.js';
import { generate90DayActionPlan } from '../aiService.js';

let currentStep = 1;
const TOTAL_STEPS = 7;

export function renderWizard() {
    window.setScreenModule({ attachEvents: wizardAttachEvents });
    return `
        <div class="main-content" style="max-width: 600px; padding-top: 5vh;">
            <div style="margin-bottom: 2rem; text-align: center;">
                <h2 style="color: var(--color-black); font-size: 1.75rem;">Build Your 90-Day CEO Plan</h2>
                <p style="color: var(--color-text-muted);">Step ${currentStep} of ${TOTAL_STEPS}</p>
            </div>

            <div class="wizard-progress" style="display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 2rem;">
                <div class="wizard-step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}">1</div>
                <div class="wizard-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}">2</div>
                <div class="wizard-step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}">3</div>
                <div class="wizard-step ${currentStep >= 4 ? 'active' : ''} ${currentStep > 4 ? 'completed' : ''}">4</div>
                <div class="wizard-step ${currentStep >= 5 ? 'active' : ''} ${currentStep > 5 ? 'completed' : ''}">5</div>
                <div class="wizard-step ${currentStep >= 6 ? 'active' : ''} ${currentStep > 6 ? 'completed' : ''}">6</div>
                <div class="wizard-step ${currentStep >= 7 ? 'active' : ''}">7</div>
            </div>

            <div class="card" id="wizard-content" style="padding: 2.5rem; box-shadow: var(--shadow-md); border-radius: var(--radius-lg); background: white;">
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
            <div style="text-align: center; padding: 1rem 0;">
                <div style="font-size: 3.5rem; margin-bottom: 1.5rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.05));">🎯</div>
                <h3 style="font-size: 1.5rem; margin-bottom: 1rem; color: var(--color-black); font-family: var(--font-heading); font-weight: 700;">Welcome to CEO Planner</h3>
                <p style="color: var(--color-text-muted); font-size: 1.05rem; margin-bottom: 2.5rem; line-height: 1.6;">
                    Let's set your 90-day goal. This takes 3 minutes and unlocks your personalised Daily 3 action plan.
                </p>
                <form id="wizard-form-1">
                    <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.85rem; font-size: 1.05rem; border-radius: 8px;">Let's Begin</button>
                </form>
            </div>
        `;
    }

    if (currentStep === 2) {
        return `
            <h3 class="mb-2" style="font-family: var(--font-heading); font-weight: 700;">CEO Profile Setup</h3>
            <p class="form-helper mb-6" style="font-size: 0.95rem; color: var(--color-text-muted); line-height: 1.5;">Set up your basic business identity and daily commitment.</p>
            
            <form id="wizard-form-2">
                <div class="form-group mb-4">
                    <label class="form-label" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; display: block;">Your Name</label>
                    <input type="text" id="set-name" class="form-input" value="${store.profile.name || ''}" placeholder="Enter your name" required style="border-radius: 8px; padding: 0.75rem;">
                </div>
                <div class="form-group mb-4">
                    <label class="form-label" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; display: block;">Business Name</label>
                    <input type="text" id="set-biz" class="form-input" value="${store.profile.businessName || ''}" placeholder="Enter your business name" required style="border-radius: 8px; padding: 0.75rem;">
                </div>
                <div class="form-group mb-4">
                    <label class="form-label" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; display: block;">Business Logo / Image</label>
                    <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-top: -0.25rem; margin-bottom: 0.75rem;">Recommended: Paste an Image URL or Upload a File.</p>
                    <div style="display: flex; gap: 1rem; align-items: flex-start; margin-bottom: 0.5rem;">
                        <div style="width: 60px; height: 60px; border-radius: var(--radius-md); background: var(--color-bg-light); border: 1px dashed var(--color-border); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                            ${store.profile.logo ? `<img src="${store.profile.logo}" id="logo-preview-img" style="width: 100%; height: 100%; object-fit: contain;">` : `<span id="logo-preview-placeholder" style="color: var(--color-text-muted); font-size: 0.7rem; text-align: center; padding: 0.2rem;">No Image</span><img src="" id="logo-preview-img" style="display: none; width: 100%; height: 100%; object-fit: contain;">`}
                        </div>
                        <div style="flex-grow: 1;">
                            <input type="text" id="set-logo-url" class="form-input mb-2" value="${store.profile.logo && store.profile.logo.startsWith('http') ? store.profile.logo : ''}" placeholder="Paste Image URL..." style="padding: 0.5rem; font-size: 0.85rem; border-radius: 8px; width: 100%;">
                            <label for="set-logo-file" class="btn btn-outline btn-sm" style="display: inline-block; cursor: pointer; font-size: 0.75rem; padding: 0.2rem 0.5rem; border: 1px solid var(--color-border); border-radius: 6px;">Upload File</label>
                            <input type="file" id="set-logo-file" accept="image/*" style="display: none;">
                            <input type="hidden" id="set-logo-base64" value="${store.profile.logo && store.profile.logo.startsWith('data:image') ? store.profile.logo : ''}">
                        </div>
                    </div>
                </div>
                <div class="form-group mb-6">
                    <label class="form-label" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; display: block;">CEO Commitment Statement</label>
                    <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-top: -0.25rem; margin-bottom: 0.5rem;">Your daily reminder shown on the dashboard.</p>
                    <textarea id="set-commitment" class="form-input" style="border-radius: 8px; padding: 0.75rem; min-height: 80px; width: 100%; font-family: var(--font-body); font-size: 0.95rem;" required>${store.goals.statement || 'I commit to prioritizing my top tasks before checking email, and trusting my strategy.'}</textarea>
                </div>
                
                <div class="flex justify-between mt-8" style="display: flex; gap: 1rem;">
                    <button type="button" class="btn btn-ghost" id="btn-back" style="flex: 1;">Back</button>
                    <button type="submit" class="btn btn-primary" style="flex: 2;">Next Step</button>
                </div>
            </form>
        `;
    }

    if (currentStep === 3) {
        return `
            <h3 class="mb-2" style="font-family: var(--font-heading); font-weight: 700;">Define your 90-Day Focus</h3>
            <p class="form-helper mb-6" style="font-size: 0.95rem; color: var(--color-text-muted); line-height: 1.5;">What is the ONE main objective you are driving towards? A tight focus prevents idea-hopping.</p>
            
            <form id="wizard-form-3">
                <div class="form-group">
                    <label class="form-label" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; display: block;">What's your main focus for the next 90 days?</label>
                    <input type="text" class="form-input" id="goal-focus" value="${g.focus || ''}" placeholder="e.g., Launch Signature Course, Double Email List" required style="border-radius: 8px; padding: 0.75rem;" />
                </div>
                <div class="flex justify-between mt-8" style="display: flex; gap: 1rem;">
                    <button type="button" class="btn btn-ghost" id="btn-back" style="flex: 1;">Back</button>
                    <button type="submit" class="btn btn-primary" style="flex: 2;">Next Step</button>
                </div>
            </form>
        `;
    }

    if (currentStep === 4) {
        return `
            <h3 class="mb-2" style="font-family: var(--font-heading); font-weight: 700;">Tell Us About Your Business</h3>
            <p class="form-helper mb-6" style="font-size: 0.95rem; color: var(--color-text-muted); line-height: 1.5;">Knowing your model, niche, audience, and bottleneck helps the Executive AI Coach tailor all recommendations and content hooks directly to you.</p>
            
            <form id="wizard-form-4">
                <div class="form-group mb-4">
                    <label class="form-label" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; display: block;">Business Model / Type</label>
                    <select class="form-input" id="biz-model" required style="border-radius: 8px; padding: 0.75rem; width: 100%;">
                        <option value="Coaching/Consulting" ${store.profile.businessModel === 'Coaching/Consulting' ? 'selected' : ''}>Coaching / Consulting</option>
                        <option value="Agency/Service Provider" ${store.profile.businessModel === 'Agency/Service Provider' ? 'selected' : ''}>Agency / Service Provider</option>
                        <option value="SaaS/Software" ${store.profile.businessModel === 'SaaS/Software' ? 'selected' : ''}>SaaS / Software</option>
                        <option value="E-commerce/Physical Products" ${store.profile.businessModel === 'E-commerce/Physical Products' ? 'selected' : ''}>E-commerce / Physical Products</option>
                        <option value="Creator/Info Products" ${store.profile.businessModel === 'Creator/Info Products' ? 'selected' : ''}>Creator / Info Products</option>
                        <option value="Other" ${store.profile.businessModel === 'Other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                <div class="form-group mb-4">
                    <label class="form-label" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; display: block;">What is your Industry / Niche?</label>
                    <input type="text" class="form-input" id="industry-niche" value="${store.profile.industryNiche || ''}" placeholder="e.g., Business Coaching, Fitness, B2B Copywriting, E-commerce Fashion" required style="border-radius: 8px; padding: 0.75rem;" />
                </div>
                <div class="form-group mb-4">
                    <label class="form-label" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; display: block;">Who is your ideal client / target audience?</label>
                    <input type="text" class="form-input" id="target-audience" value="${store.profile.targetAudience || ''}" placeholder="e.g., female founders making $3k-10k/mo, busy moms wanting to lose weight" required style="border-radius: 8px; padding: 0.75rem;" />
                </div>
                <div class="form-group mb-6">
                    <label class="form-label" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; display: block;">Top Business Bottleneck</label>
                    <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 0.5rem; line-height: 1.4;">What is the main constraint holding your business back?</p>
                    <input type="text" class="form-input mb-3" id="biz-bottleneck" value="${store.profile.bottleneck || ''}" placeholder="e.g. Sales Conversion, Lead Generation, Delivery Overwhelm" required style="border-radius: 8px; padding: 0.75rem;" />
                    <div class="flex gap-2" style="flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem;">
                        <button type="button" class="btn btn-ghost btn-sm btn-wizard-bottleneck-preset" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border: 1px solid var(--color-border); border-radius: 6px;" data-value="Sales Conversion">Sales Conversion</button>
                        <button type="button" class="btn btn-ghost btn-sm btn-wizard-bottleneck-preset" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border: 1px solid var(--color-border); border-radius: 6px;" data-value="Lead Generation">Lead Generation</button>
                        <button type="button" class="btn btn-ghost btn-sm btn-wizard-bottleneck-preset" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border: 1px solid var(--color-border); border-radius: 6px;" data-value="Delivery Overwhelm">Delivery Overwhelm</button>
                        <button type="button" class="btn btn-ghost btn-sm btn-wizard-bottleneck-preset" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border: 1px solid var(--color-border); border-radius: 6px;" data-value="Offer/Niche Fit">Offer/Niche Fit</button>
                        <button type="button" class="btn btn-ghost btn-sm btn-wizard-bottleneck-preset" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border: 1px solid var(--color-border); border-radius: 6px;" data-value="Marketing Routine">Marketing Routine</button>
                    </div>
                </div>
                <div class="flex justify-between mt-8" style="display: flex; gap: 1rem;">
                    <button type="button" class="btn btn-ghost" id="btn-back" style="flex: 1;">Back</button>
                    <button type="submit" class="btn btn-primary" style="flex: 2;">Next Step</button>
                </div>
            </form>
        `;
    }

    if (currentStep === 5) {
        return `
            <h3 class="mb-2" style="font-family: var(--font-heading); font-weight: 700;">Financial Target</h3>
            <p class="form-helper mb-6" style="font-size: 0.95rem; color: var(--color-text-muted); line-height: 1.5;">Set a clear, measurable revenue milestone for this 90-day period.</p>
            
            <form id="wizard-form-5">
                <div class="form-group">
                    <label class="form-label" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; display: block;">What revenue target are you aiming for?</label>
                    <div style="position: relative; display: flex; align-items: center;">
                        <span style="position: absolute; left: 1rem; font-weight: 600; color: var(--color-text-muted);">${store.settings?.currency || '$'}</span>
                        <input type="number" class="form-input" id="rev-goal" value="${store.revenue?.quarterlyGoal || ''}" min="0" step="1" placeholder="e.g., 15000" required style="border-radius: 8px; padding: 0.75rem 0.75rem 0.75rem 2rem; width: 100%;" />
                    </div>
                </div>
                <div class="flex justify-between mt-8" style="display: flex; gap: 1rem;">
                    <button type="button" class="btn btn-ghost" id="btn-back" style="flex: 1;">Back</button>
                    <button type="submit" class="btn btn-primary" style="flex: 2;">Next Step</button>
                </div>
            </form>
        `;
    }

    if (currentStep === 6) {
        return `
            <h3 class="mb-2" style="font-family: var(--font-heading); font-weight: 700;">Choose Your Top 3 Priorities</h3>
            <p class="form-helper mb-6" style="font-size: 0.95rem; color: var(--color-text-muted); line-height: 1.5;">To achieve your focus, what are the three big projects that will move the needle?</p>
            
            <form id="wizard-form-6">
                <div class="form-group" style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <label class="form-label" style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; display: block;">Priority 1</label>
                        <input type="text" class="form-input" id="p1" value="${g.priorities[0] || ''}" placeholder="e.g., Build course sales page" required style="border-radius: 8px; padding: 0.75rem;" />
                    </div>
                    <div>
                        <label class="form-label" style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; display: block;">Priority 2</label>
                        <input type="text" class="form-input" id="p2" value="${g.priorities[1] || ''}" placeholder="e.g., Map out 4-week launch email sequence" required style="border-radius: 8px; padding: 0.75rem;" />
                    </div>
                    <div>
                        <label class="form-label" style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; display: block;">Priority 3</label>
                        <input type="text" class="form-input" id="p3" value="${g.priorities[2] || ''}" placeholder="e.g., Host weekly IG live Q&As" required style="border-radius: 8px; padding: 0.75rem;" />
                    </div>
                </div>
                <div class="flex justify-between mt-8" id="wizard-step-6-buttons" style="display: flex; gap: 1rem;">
                    <button type="button" class="btn btn-ghost" id="btn-back" style="flex: 1;">Back</button>
                    <button type="submit" class="btn btn-primary" id="btn-complete-setup" style="flex: 2;">Generate My 90-Day Plan</button>
                </div>
                <div id="wizard-loading" style="display: none; text-align: center; padding: 2rem 0;">
                    <div class="spinner" style="margin: 0 auto 1rem auto; width: 40px; height: 40px; border: 4px solid var(--color-bg-light); border-top: 4px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <p style="color: var(--color-primary-dark); font-weight: 600;">Building your 90-day roadmap... this takes about 20 seconds</p>
                </div>
            </form>
        `;
    }

    if (currentStep === 7) {
        return `
            <div style="text-align: center; padding: 1rem 0;">
                <div style="font-size: 3.5rem; margin-bottom: 1.5rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.05));">🎉</div>
                <h3 style="font-size: 1.5rem; margin-bottom: 1rem; color: var(--color-black); font-family: var(--font-heading); font-weight: 700;">Your Daily 3 is ready!</h3>
                <p style="color: var(--color-text-muted); font-size: 1.05rem; margin-bottom: 2.5rem; line-height: 1.6;">
                    Head to your dashboard to see today's most important actions.
                </p>
                <button id="btn-go-dashboard" class="btn btn-primary" style="width: 100%; padding: 0.85rem; font-size: 1.05rem; border-radius: 8px;">Go to Dashboard</button>
            </div>
        `;
    }
}

function wizardAttachEvents() {
    const form = document.getElementById(`wizard-form-${currentStep}`);
    const btnBack = document.getElementById('btn-back');

    if (btnBack) {
        btnBack.addEventListener('click', () => {
            if (currentStep > 1) {
                currentStep--;
                document.getElementById('app-container').innerHTML = renderWizard();
                wizardAttachEvents();
            }
        });
    }

    if (currentStep === 2) {
        // Handle File Input for Logo
        const fileInput = document.getElementById('set-logo-file');
        const urlInput = document.getElementById('set-logo-url');
        const base64Input = document.getElementById('set-logo-base64');
        const previewImg = document.getElementById('logo-preview-img');
        const previewPlaceholder = document.getElementById('logo-preview-placeholder');

        if (fileInput) {
            fileInput.addEventListener('change', function (e) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function (event) {
                        const base64Str = event.target.result;
                        base64Input.value = base64Str;
                        urlInput.value = '';
                        if (previewImg) {
                            previewImg.src = base64Str;
                            previewImg.style.display = 'block';
                        }
                        if (previewPlaceholder) {
                            previewPlaceholder.style.display = 'none';
                        }
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        if (urlInput) {
            urlInput.addEventListener('input', function (e) {
                const url = e.target.value;
                if (url) {
                    base64Input.value = '';
                    if (previewImg) {
                        previewImg.src = url;
                        previewImg.style.display = 'block';
                    }
                    if (previewPlaceholder) {
                        previewPlaceholder.style.display = 'none';
                    }
                } else if (!base64Input.value) {
                    if (previewImg) {
                        previewImg.style.display = 'none';
                    }
                    if (previewPlaceholder) {
                        previewPlaceholder.style.display = 'block';
                    }
                }
            });
        }
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const store = getStore();
            const currentGoals = store.goals;

            if (currentStep === 1) {
                currentStep++;
                document.getElementById('app-container').innerHTML = renderWizard();
                wizardAttachEvents();
            }
            else if (currentStep === 2) {
                const name = document.getElementById('set-name').value.trim();
                const bizName = document.getElementById('set-biz').value.trim();
                const commitment = document.getElementById('set-commitment').value.trim();
                
                const urlVal = document.getElementById('set-logo-url').value.trim();
                const base64Val = document.getElementById('set-logo-base64').value;
                const finalLogo = urlVal || base64Val || '';
                
                updateProfile({
                    name: name,
                    businessName: bizName,
                    logo: finalLogo
                });
                
                currentGoals.statement = commitment;
                updateGoals(currentGoals);

                currentStep++;
                document.getElementById('app-container').innerHTML = renderWizard();
                wizardAttachEvents();
            }
            else if (currentStep === 3) {
                currentGoals.focus = document.getElementById('goal-focus').value.trim();
                updateGoals(currentGoals);

                currentStep++;
                document.getElementById('app-container').innerHTML = renderWizard();
                wizardAttachEvents();
            }
            else if (currentStep === 4) {
                const businessModel = document.getElementById('biz-model').value;
                const targetAudience = document.getElementById('target-audience').value.trim();
                const industryNiche = document.getElementById('industry-niche').value.trim();
                const bottleneck = document.getElementById('biz-bottleneck').value.trim();
                updateProfile({ businessModel, targetAudience, industryNiche, bottleneck });

                currentStep++;
                document.getElementById('app-container').innerHTML = renderWizard();
                wizardAttachEvents();
            }
            else if (currentStep === 5) {
                const quarterlyGoal = parseFloat(document.getElementById('rev-goal').value);
                updateRevenueSettings({ quarterlyGoal });

                currentStep++;
                document.getElementById('app-container').innerHTML = renderWizard();
                wizardAttachEvents();
            }
            else if (currentStep === 6) {
                currentGoals.priorities = [
                    document.getElementById('p1').value.trim(),
                    document.getElementById('p2').value.trim(),
                    document.getElementById('p3').value.trim()
                ];
                currentGoals.outcome = `Achieve 90-day focus: ${currentGoals.focus}`;
                currentGoals.milestones = {
                    month1: `Build out and execute priorities for ${currentGoals.priorities[0]}`,
                    month2: `Promote and launch ${currentGoals.priorities[1]}`,
                    month3: `Scale and stabilize ${currentGoals.priorities[2]}`
                };
                // Keeps statement already set in Step 2 instead of hard-overwriting it here
                updateGoals(currentGoals);

                // Set defaults for settings
                updateSettings({
                    currency: store.settings?.currency || '$'
                });
                updateRevenueSettings({
                    quarterlyGoal: parseFloat(store.revenue?.quarterlyGoal || 0),
                    averageOfferPrice: 1000
                });
                updateLeadGoal(100);

                // Show loading spinner
                const buttonsDiv = document.getElementById('wizard-step-6-buttons');
                const loadingDiv = document.getElementById('wizard-loading');
                if (buttonsDiv && loadingDiv) {
                    buttonsDiv.style.display = 'none';
                    loadingDiv.style.display = 'block';
                }

                // Call AI Action Plan generator
                generate90DayActionPlan().then(plan => {
                    if (plan) {
                        applyGeneratedPlan(plan);
                        
                        updateProfile({
                            trialStartDate: new Date().toISOString(),
                            stage: store.profile?.stage || 'growth',
                            bottleneck: store.profile?.bottleneck || 'Lead Generation'
                        });

                        currentStep = 7;
                        document.getElementById('app-container').innerHTML = renderWizard();
                        wizardAttachEvents();
                    } else {
                        if (buttonsDiv && loadingDiv) {
                            buttonsDiv.style.display = 'flex';
                            loadingDiv.style.display = 'none';
                        }
                        alert("Couldn't generate your plan right now — try again in a moment.");
                    }
                }).catch(err => {
                    console.error("AI action plan generation failed", err);
                    if (buttonsDiv && loadingDiv) {
                        buttonsDiv.style.display = 'flex';
                        loadingDiv.style.display = 'none';
                    }
                    alert("Couldn't generate your plan right now — try again in a moment.");
                });
            }
        });
    }

    // Handle Wizard Bottleneck Presets
    document.querySelectorAll('.btn-wizard-bottleneck-preset').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const val = e.target.getAttribute('data-value');
            const input = document.getElementById('biz-bottleneck');
            if (input) {
                input.value = val;
            }
        });
    });

    const btnGoDashboard = document.getElementById('btn-go-dashboard');
    if (btnGoDashboard) {
        btnGoDashboard.addEventListener('click', () => {
            currentStep = 1; // reset step counter
            window.location.hash = '#/dashboard';
        });
    }
}
