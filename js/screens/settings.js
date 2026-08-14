// settings.js
import { renderNav } from '../components/nav.js';
import { getStore, updateProfile, updateGoals, updateRevenueSettings, updateLeadGoal, updateSettings, REMINDER_WEEKLY, REMINDER_DAILY, REMINDER_FRIDAY } from '../store.js';
import { showToast, rerenderScreen } from '../components/toast.js';
import { proTeaser } from '../components/proGate.js';

// Must stay identical to CURRENCIES in wizard.js. The wizard was the only place
// currency could ever be set, so anyone who accepted the default $ by mistake had
// no way back — and the symbol in that wizard field was invisible at the time.
const SETTINGS_CURRENCIES = [
    { value: '£', label: '£  British Pound (GBP)' },
    { value: '$', label: '$  US Dollar (USD)' },
    { value: '€', label: '€  Euro (EUR)' },
    { value: 'A$', label: 'A$  Australian Dollar (AUD)' },
    { value: 'C$', label: 'C$  Canadian Dollar (CAD)' },
    { value: 'R', label: 'R  South African Rand (ZAR)' }
];

export function renderSettings() {
    // We bind the event listeners after HTML is rendered using setScreenModule
    window.setScreenModule({ attachEvents: settingsAttachEvents });
    const store = getStore();
    const reminders = store.profile.reminderTimes || [];

    // Quick helper to check if a reminder is active
    const isChecked = (val) => reminders.includes(val) ? 'checked' : '';

    return `
        ${renderNav()}
<div class="main-content" style="max-width: 800px;">
    <div class="flex justify-between items-center mb-6">
        <h2>Settings</h2>
        <a href="#/progress" class="btn btn-ghost" style="font-size: 0.875rem;">← Back</a>
    </div>

    <!-- Walkthrough Video Section -->
    <div class="card mb-6" style="padding: 2rem; background: linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.3) 100%); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: var(--shadow-sm); border-radius: var(--radius-lg);">
        <h3 class="mb-2" style="color: var(--color-black); display: flex; align-items: center; gap: 0.5rem; font-family: var(--font-heading); font-weight: 700;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-primary);"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
            CEO Planner Walkthrough
        </h3>
        <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 1.25rem;">
            Watch this step-by-step walkthrough tutorial to learn how to navigate the signup flow, complete the onboarding wizard, set your 90-day plan, and leverage the AI Coach.
        </p>
        <div style="position: relative; width: 100%; border-radius: var(--radius-md); overflow: hidden; box-shadow: var(--shadow-md); background: #ffffff; aspect-ratio: 16/9;">
            <iframe src="https://www.youtube.com/embed/ftUBDlChE-E" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"></iframe>
        </div>
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
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-top: -0.25rem; margin-bottom: 0.75rem;">
                    One sentence about <em>how</em> you want to work this quarter, not what you want to achieve.
                    It sits on your dashboard every day. Leave it blank if you would rather not have one.
                </p>
                <input type="text" id="set-statement" class="form-input" value="${store.goals.statement || ''}" placeholder="e.g. I commit to protecting two deep-work mornings a week, no matter what the inbox says.">
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
                <label class="form-label" style="font-weight: 600;">Currency</label>
                <select id="set-currency" class="form-select">
                    ${SETTINGS_CURRENCIES.map(c => `<option value="${c.value}" ${(store.settings?.currency || '$') === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}
                </select>
                <span class="form-helper">Used everywhere money appears. Changing it relabels your figures, it does not convert them.</span>
            </div>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Quarterly Revenue Goal</label>
                <div style="position: relative; display: flex; align-items: center;">
                    <span style="position: absolute; left: 1rem; z-index: 1; font-weight: 600; color: var(--color-text-muted);">${store.settings?.currency || '$'}</span>
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
                    Select when you'd like the app to nudge you about CEO tasks. Your
                    browser will ask permission the first time you tick one.
                </p>
                <p style="color: #B54708; background: #FFFAEB; border: 1px solid #FEDF89; border-radius: var(--radius-sm); padding: 0.625rem 0.75rem; font-size: 0.8rem; margin-bottom: 1rem;">
                    These only appear while CEO Planner is open in a browser tab. If the
                    app is closed, they won't reach you — so treat them as a nudge while
                    you're working, not an alarm clock.
                </p>
                ${proTeaser(
                    'email-digest',
                    'A nudge that reaches you anywhere',
                    'A short Monday email with your numbers and next steps. Works with the app closed.'
                )}
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                        <input type="checkbox" name="reminder" value="${REMINDER_WEEKLY}" ${isChecked(REMINDER_WEEKLY)} style="margin-top: 0.25rem;">
                        <div>
                            <span style="font-weight: 500; display: block; color: var(--color-black);">Weekly Planning Prompt</span>
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">Reminds you to set your weekly goals (Usually Sunday or Monday)</span>
                        </div>
                    </label>

                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                        <input type="checkbox" name="reminder" value="${REMINDER_DAILY}" ${isChecked(REMINDER_DAILY)} style="margin-top: 0.25rem;">
                        <div>
                            <span style="font-weight: 500; display: block; color: var(--color-black);">Daily Priority Check</span>
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">A morning nudge to review your top 3 priorities</span>
                        </div>
                    </label>

                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                        <input type="checkbox" name="reminder" value="${REMINDER_FRIDAY}" ${isChecked(REMINDER_FRIDAY)} style="margin-top: 0.25rem;">
                        <div>
                            <span style="font-weight: 500; display: block; color: var(--color-black);">Friday CEO Review</span>
                            <span style="font-size: 0.8rem; color: var(--color-text-muted);">Afternoon prompt to log wins and close out the week</span>
                        </div>
                    </label>
                </div>
            </div>
        </div>

        <div class="mt-4 flex justify-end">
            <button type="submit" class="btn btn-primary" style="padding: 0.75rem 2.5rem; font-size: 1.05rem;">Save Preferences</button>
        </div>
    </form>

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

            const currency = document.getElementById('set-currency')?.value;
            if (currency) updateSettings({ currency });

            updateRevenueSettings({ quarterlyGoal: revenueGoal });
            updateLeadGoal(leadGoal);

            updateGoals({
                focus: focus,
                outcome: outcome,
                priorities: [p1, p2, p3].filter(Boolean),
                statement: statement
            });

            showToast('Settings saved');
            rerenderScreen();
        });
    }

    // Bind Notification Permission Request to Checkboxes.
    // These used to be looked up by IDs that were never rendered, so permission was
    // never requested, Notification.permission stayed 'default', and every reminder
    // (including the whole 14-day trial sequence) was silently skipped.
    document.querySelectorAll('input[name="reminder"]').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            if (!e.target.checked || !('Notification' in window)) return;

            if (Notification.permission === 'denied') {
                e.target.checked = false;
                showToast("Notifications are blocked for this site in your browser settings. You'll need to allow them there before reminders can work.", 'error');
                return;
            }

            if (Notification.permission === 'granted') return;

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                e.target.checked = false; // Revert if denied
                showToast("Reminders need notification permission, which wasn't granted.", 'error');
                return;
            }

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification("CEO Planner", {
                        body: "Notifications successfully linked!",
                        icon: "./icon-192.png"
                    });
                });
            }
        });
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
}
