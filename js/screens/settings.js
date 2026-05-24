// settings.js
import { renderNav } from '../components/nav.js';
import { getStore, updateProfile, updateGoals, updateRevenueSettings, updateLeadGoal } from '../store.js';

function getCurrentUserEmail() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                const sessionStr = localStorage.getItem(key);
                if (sessionStr) {
                    const session = JSON.parse(sessionStr);
                    if (session && session.user && session.user.email) {
                        return session.user.email;
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error reading session email from localStorage:", e);
    }
    return null;
}

export function renderSettings() {
    // We bind the event listeners after HTML is rendered using setScreenModule
    window.setScreenModule({ attachEvents: settingsAttachEvents });
    const store = getStore();
    const reminders = store.profile.reminderTimes || [];
    const userEmail = getCurrentUserEmail();
    const isAdmin = userEmail === 'jeanette_spencer@yahoo.com';

    // Quick helper to check if a reminder is active
    const isChecked = (val) => reminders.includes(val) ? 'checked' : '';

    return `
        ${renderNav()}
<div class="main-content" style="max-width: 800px;">
    <div class="flex justify-between items-center mb-6">
        <h2>Settings</h2>
        <a href="#/progress" class="btn btn-ghost" style="font-size: 0.875rem;">← Back</a>
    </div>

    <form id="settings-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
        <!-- Card 1: CEO & Business Profile Info -->
        <div class="card">
            <h3 class="mb-4" style="color: var(--color-black);">CEO & Business Info</h3>
            
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Your Name</label>
                <input type="text" id="set-name" class="form-input" value="${store.profile.name || ''}" required>
            </div>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Business Name</label>
                <input type="text" id="set-biz" class="form-input" value="${store.profile.businessName || ''}" required>
            </div>
            
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Business Logo / Image</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-top: -0.25rem; margin-bottom: 0.75rem;">Recommended: Square dimensions (e.g. 512x512px or 1:1 ratio) for best display.</p>
                <div style="display: flex; gap: 1rem; align-items: flex-start; margin-bottom: 0.5rem;">
                    <div style="width: 80px; height: 80px; border-radius: var(--radius-md); background: var(--color-bg-light); border: 1px dashed var(--color-border); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                        ${store.profile.logo ? `<img src="${store.profile.logo}" id="logo-preview-img" style="width: 100%; height: 100%; object-fit: contain;">` : `<span id="logo-preview-placeholder" style="color: var(--color-text-muted); font-size: 0.75rem; text-align: center; padding: 0.25rem;">No Image</span><img src="" id="logo-preview-img" style="display: none; width: 100%; height: 100%; object-fit: contain;">`}
                    </div>
                    <div style="flex-grow: 1;">
                        <input type="text" id="set-logo-url" class="form-input mb-2" value="${store.profile.logo && store.profile.logo.startsWith('http') ? store.profile.logo : ''}" placeholder="Paste Image URL here...">
                        <label for="set-logo-file" class="btn btn-outline btn-sm" style="display: inline-block; cursor: pointer; font-size: 0.8rem; padding: 0.25rem 0.75rem;">Upload Image File</label>
                        <input type="file" id="set-logo-file" accept="image/*" style="display: none;">
                        <input type="hidden" id="set-logo-base64" value="${store.profile.logo && store.profile.logo.startsWith('data:image') ? store.profile.logo : ''}">
                    </div>
                </div>
            </div>

            <div class="form-group mb-0">
                <label class="form-label" style="font-weight: 600;">CEO Commitment Statement</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-top: -0.25rem; margin-bottom: 0.75rem;">Your daily commitment shown on the dashboard.</p>
                <input type="text" id="set-statement" class="form-input" value="${store.goals.statement || 'I commit to prioritizing my top tasks before checking email, and trusting my strategy.'}" required>
            </div>
        </div>

        <!-- Card 2: CEO Strategy & Niche -->
        <div class="card">
            <h3 class="mb-4" style="color: var(--color-black);">CEO Business Profile</h3>
            
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Business Model / Type</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">Helps the Executive AI Coach tailor content and strategies directly to your business model.</p>
                <select id="set-business-model" class="form-input" style="padding: 0.75rem;">
                    <option value="Coaching/Consulting" ${store.profile.businessModel === 'Coaching/Consulting' ? 'selected' : ''}>Coaching / Consulting</option>
                    <option value="Agency/Service Provider" ${store.profile.businessModel === 'Agency/Service Provider' ? 'selected' : ''}>Agency / Service Provider</option>
                    <option value="SaaS/Software" ${store.profile.businessModel === 'SaaS/Software' ? 'selected' : ''}>SaaS / Software</option>
                    <option value="E-commerce/Physical Products" ${store.profile.businessModel === 'E-commerce/Physical Products' ? 'selected' : ''}>E-commerce / Physical Products</option>
                    <option value="Creator/Info Products" ${store.profile.businessModel === 'Creator/Info Products' ? 'selected' : ''}>Creator / Info Products</option>
                    <option value="Other" ${store.profile.businessModel === 'Other' ? 'selected' : ''}>Other</option>
                </select>
            </div>
            
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Industry / Niche</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">What is your industry or specific market niche?</p>
                <input type="text" id="set-industry-niche" class="form-input" value="${store.profile.industryNiche || ''}" placeholder="e.g., Business Coaching, Fitness, B2B Copywriting, E-commerce Fashion" style="padding: 0.75rem;">
            </div>
            
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Target Audience / Ideal Client</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">Who is your ideal client? (e.g. female founders making $3k-$10k/mo, busy moms wanting to lose weight)</p>
                <input type="text" id="set-target-audience" class="form-input" value="${store.profile.targetAudience || ''}" placeholder="e.g., female founders making $3k-10k/mo" style="padding: 0.75rem;">
            </div>

            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Top Business Bottleneck</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">What is the main constraint holding your business back? The Executive AI Coach uses this to customize your strategic feedback.</p>
                <input type="text" id="set-bottleneck" class="form-input mb-3" value="${store.profile.bottleneck || ''}" placeholder="e.g. Booking discovery calls, delivery burn-out, hiring a manager" style="padding: 0.75rem;">
                <div class="flex gap-2" style="flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
                    <button type="button" class="btn btn-ghost btn-sm btn-bottleneck-preset" style="font-size: 0.8rem; padding: 0.25rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm);" data-value="Sales Conversion">Sales Conversion</button>
                    <button type="button" class="btn btn-ghost btn-sm btn-bottleneck-preset" style="font-size: 0.8rem; padding: 0.25rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm);" data-value="Lead Generation">Lead Generation</button>
                    <button type="button" class="btn btn-ghost btn-sm btn-bottleneck-preset" style="font-size: 0.8rem; padding: 0.25rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm);" data-value="Delivery Overwhelm">Delivery Overwhelm</button>
                    <button type="button" class="btn btn-ghost btn-sm btn-bottleneck-preset" style="font-size: 0.8rem; padding: 0.25rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm);" data-value="Offer/Niche Fit">Offer/Niche Fit</button>
                    <button type="button" class="btn btn-ghost btn-sm btn-bottleneck-preset" style="font-size: 0.8rem; padding: 0.25rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm);" data-value="Marketing Routine">Marketing Routine</button>
                </div>
            </div>

            <div class="form-group mb-0">
                <label class="form-label" style="font-weight: 600;">CEO Strategy Mode</label>
                <p style="color: #6941C6; font-size: 0.85rem; margin-bottom: 0.5rem;"><strong>Important:</strong> Changing this completely rewrites the AI Planning Assistant and Smart Prompts to focus on this strict trajectory.</p>
                <select id="set-strategy" class="form-input" style="padding: 0.75rem;">
                    <option value="First Sale Sprint" ${store.profile.strategyMode === 'First Sale Sprint' ? 'selected' : ''}>First Sale Sprint (Focus: Direct Outreach & Fast Cash)</option>
                    <option value="Offer Launch Quarter" ${store.profile.strategyMode === 'Offer Launch Quarter' ? 'selected' : ''}>Offer Launch Quarter (Focus: Build Hype & Open Cart)</option>
                    <option value="Audience Growth" ${store.profile.strategyMode === 'Audience Growth' ? 'selected' : ''}>Audience Growth (Focus: Massive Lead Generation)</option>
                    <option value="CEO Reset" ${store.profile.strategyMode === 'CEO Reset' || !store.profile.strategyMode ? 'selected' : ''}>CEO Reset (Focus: Systems, Automating & Hiring)</option>
                </select>
            </div>
        </div>

        <!-- Card 3: 90-Day Vision & Targets -->
        <div class="card">
            <h3 class="mb-4" style="color: var(--color-black);">90-Day Vision</h3>
            
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Main Focus</label>
                <input type="text" id="set-focus" class="form-input" value="${store.goals.focus || ''}" placeholder="e.g. Launch new coaching program" required>
            </div>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Measurable Outcome</label>
                <input type="text" id="set-outcome" class="form-input" value="${store.goals.outcome || ''}" placeholder="e.g. 10 beta clients at $1.5k" required>
            </div>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Quarterly Revenue Goal</label>
                <div style="position: relative; display: flex; align-items: center;">
                    <span style="position: absolute; left: 1rem; font-weight: 600; color: var(--color-text-muted);">${store.settings?.currency || '$'}</span>
                    <input type="number" id="set-revenue-goal" class="form-input" value="${store.revenue?.quarterlyGoal || 0}" min="0" required style="padding-left: 2rem;">
                </div>
            </div>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Quarterly Lead Goal</label>
                <input type="number" id="set-lead-goal" class="form-input" value="${store.leads?.quarterlyGoal || 0}" min="0" required>
            </div>
            
            <div class="form-group mb-0">
                <label class="form-label" style="font-weight: 600;">Top 3 Priorities</label>
                <input type="text" id="set-p1" class="form-input mb-2" value="${store.goals.priorities?.[0] || ''}" placeholder="Priority 1" required>
                <input type="text" id="set-p2" class="form-input mb-2" value="${store.goals.priorities?.[1] || ''}" placeholder="Priority 2">
                <input type="text" id="set-p3" class="form-input" value="${store.goals.priorities?.[2] || ''}" placeholder="Priority 3">
            </div>
        </div>

        <!-- Card 4: Weekly Setup & Reminders -->
        <div class="card">
            <h3 class="mb-4" style="color: var(--color-black);">Weekly Setup & Reminders</h3>
            
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Planning Day</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">Select the day you want the guided weekly CEO Planner flow to appear.</p>
                <select id="planning-day-select" class="form-input" style="padding: 0.75rem;">
                    <option value="Sunday" ${store.profile.planningDay === 'Sunday' ? 'selected' : ''}>Sunday</option>
                    <option value="Monday" ${store.profile.planningDay === 'Monday' || !store.profile.planningDay ? 'selected' : ''}>Monday</option>
                    <option value="Tuesday" ${store.profile.planningDay === 'Tuesday' ? 'selected' : ''}>Tuesday</option>
                    <option value="Wednesday" ${store.profile.planningDay === 'Wednesday' ? 'selected' : ''}>Wednesday</option>
                    <option value="Thursday" ${store.profile.planningDay === 'Thursday' ? 'selected' : ''}>Thursday</option>
                    <option value="Friday" ${store.profile.planningDay === 'Friday' ? 'selected' : ''}>Friday</option>
                    <option value="Saturday" ${store.profile.planningDay === 'Saturday' ? 'selected' : ''}>Saturday</option>
                </select>
            </div>

            <div class="form-group mb-0">
                <label class="form-label" style="font-weight: 600; margin-bottom: 0.5rem;">Reminders & Prompts</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 1rem;">
                    Select when you'd like the app to remind you about CEO tasks.
                    <i>(Note: Push notifications require browser permissions).</i>
                </p>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                        <input type="checkbox" name="reminder" value="weekly_plan" ${isChecked('weekly_plan')} style="margin-top: 0.25rem;">
                        <div>
                            <span style="font-weight: 500; display: block; color: var(--color-black);">Weekly Planning Prompt</span>
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">Reminds you to set your weekly goals (Usually Sunday or Monday)</span>
                        </div>
                    </label>

                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                        <input type="checkbox" name="reminder" value="daily_priority" ${isChecked('daily_priority')} style="margin-top: 0.25rem;">
                        <div>
                            <span style="font-weight: 500; display: block; color: var(--color-black);">Daily Priority Check</span>
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">A morning nudge to review your top 3 priorities</span>
                        </div>
                    </label>

                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                        <input type="checkbox" name="reminder" value="friday_review" ${isChecked('friday_review')} style="margin-top: 0.25rem;">
                        <div>
                            <span style="font-weight: 500; display: block; color: var(--color-black);">Friday CEO Review</span>
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">Afternoon prompt to log wins and close out the week</span>
                        </div>
                    </label>
                </div>
            </div>
        </div>

        <!-- Card 5: Generative AI Integration (Admin Only) -->
        ${isAdmin ? `
        <div class="card">
            <h3 class="mb-4" style="color: #10a37f; display: flex; align-items: center; gap: 0.5rem;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                Generative AI Integration
            </h3>
            <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 1rem;">
                Connect your OpenAI API key to unlock the Level 3 Executive AI Coach. Your key is stored <b>exclusively locally</b> in this browser.
            </p>
            <div class="form-group mb-0">
                <label class="form-label" style="font-weight: 600;">ChatGPT API Key</label>
                <input type="password" id="set-openai-key" class="form-input" placeholder="sk-..." value="${localStorage.getItem('ceo_openai_key') || ''}">
            </div>
        </div>
        ` : ''}

        <div class="mt-4 flex justify-end">
            <button type="submit" class="btn btn-primary" style="padding: 0.75rem 2.5rem; font-size: 1.05rem;">Save Preferences</button>
        </div>
    </form>

    <!-- Card 6: Billing & Subscription -->
    <div class="card mt-8">
        <h3 class="mb-4" style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-black);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
            Billing & Subscription
        </h3>
        <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 1.5rem;">
            Manage your payment method, view invoices, or cancel your subscription at any time.
        </p>
        <button type="button" id="btn-manage-subscription" class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary-dark); font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem;">
            Manage Subscription / Cancel
        </button>
    </div>

    <!-- Card 7: Danger Zone -->
    <div class="card mt-6" style="border: 1px solid #FEE4E2;">
        <h3 class="mb-2" style="color: #B42318;">Danger Zone</h3>
        <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 1rem;">Resetting your account will delete all your local data, plans, and historical reviews permanently.</p>
        <button id="btn-reset-data" class="btn btn-outline" style="border-color: #FEE4E2; color: #B42318; background: #FEF3F2;">Erase All Local Data</button>
    </div>
</div>
`;
}

function settingsAttachEvents() {
    // Handle form save
    const form = document.getElementById('settings-form');

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
                    urlInput.value = ''; // Clear URL if file is uploaded
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
                base64Input.value = ''; // Clear base64 if URL is provided
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

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const checkedBoxes = document.querySelectorAll('input[name="reminder"]:checked');
            const newReminders = Array.from(checkedBoxes).map(cb => cb.value);
            const name = document.getElementById('set-name').value;
            const biz = document.getElementById('set-biz').value;
            const statement = document.getElementById('set-statement').value.trim();

            // Determine Logo
            const urlVal = document.getElementById('set-logo-url').value;
            const base64Val = document.getElementById('set-logo-base64').value;
            let finalLogo = urlVal || base64Val || '';

            const focus = document.getElementById('set-focus').value;
            const outcome = document.getElementById('set-outcome').value;
            const p1 = document.getElementById('set-p1').value;
            const p2 = document.getElementById('set-p2').value;
            const p3 = document.getElementById('set-p3').value;

            const planningDay = document.getElementById('planning-day-select').value;
            const bottleneck = document.getElementById('set-bottleneck').value;
            const strategyMode = document.getElementById('set-strategy').value;
            const businessModel = document.getElementById('set-business-model').value;
            const targetAudience = document.getElementById('set-target-audience').value.trim();
            const industryNiche = document.getElementById('set-industry-niche').value.trim();

            const revenueGoal = parseFloat(document.getElementById('set-revenue-goal').value) || 0;
            const leadGoal = parseFloat(document.getElementById('set-lead-goal').value) || 0;

            updateProfile({
                name: name,
                businessName: biz,
                logo: finalLogo,
                bottleneck: bottleneck,
                strategyMode: strategyMode,
                businessModel: businessModel,
                targetAudience: targetAudience,
                industryNiche: industryNiche,
                reminderTimes: newReminders,
                planningDay: planningDay
            });

            updateRevenueSettings({ quarterlyGoal: revenueGoal });
            updateLeadGoal(leadGoal);

            const openaiKeyEl = document.getElementById('set-openai-key');
            if (openaiKeyEl) {
                localStorage.setItem('ceo_openai_key', openaiKeyEl.value);
            }

            updateGoals({
                focus: focus,
                outcome: outcome,
                priorities: [p1, p2, p3].filter(Boolean),
                statement: statement
            });

            alert('Settings saved successfully!');
            window.location.reload();
        });
    }

    // Bind Notification Permission Request to Checkboxes
    ['remind-weekly', 'remind-daily', 'remind-friday'].forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', async (e) => {
                if (e.target.checked && 'Notification' in window) {
                    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                        const permission = await Notification.requestPermission();
                        if (permission !== 'granted') {
                            e.target.checked = false; // Revert if denied
                            alert("You must allow notifications in your browser settings to enable reminders.");
                        } else {
                            if ('serviceWorker' in navigator) {
                                navigator.serviceWorker.ready.then(registration => {
                                    registration.showNotification("CEO Planner", {
                                        body: "Notifications successfully linked!",
                                        icon: "https://cdn-icons-png.flaticon.com/512/864/864685.png"
                                    });
                                });
                            }
                        }
                    }
                }
            });
        }
    });

    // Handle Bottleneck Presets
    document.querySelectorAll('.btn-bottleneck-preset').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const val = e.target.getAttribute('data-value');
            const input = document.getElementById('set-bottleneck');
            if (input) {
                input.value = val;
            }
        });
    });

    // Handle Billing Portal Click
    const btnManageSub = document.getElementById('btn-manage-subscription');
    if (btnManageSub) {
        btnManageSub.addEventListener('click', () => {
            window.location.href = 'https://billing.stripe.com/p/login/eVq3cucex8YXc1q0tk18c00';
        });
    }

    // Handle Factory Reset
    const resetBtn = document.getElementById('btn-reset-data');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const confirmDelete = confirm("Are you sure? This cannot be undone.");
            if (confirmDelete) {
                localStorage.removeItem('ceoPlanner_store');
                window.location.hash = '#/';
                window.location.reload();
            }
        });
    }
}
