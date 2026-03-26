// settings.js
import { renderNav } from '../components/nav.js';
import { getStore, updateProfile, updateGoals } from '../store.js';

export function renderSettings() {
    // We bind the event listeners after HTML is rendered using setScreenModule
    window.setScreenModule({ attachEvents: settingsAttachEvents });
    const store = getStore();
    const reminders = store.profile.reminderTimes || [];

    // Quick helper to check if a reminder is active
    const isChecked = (val) => reminders.includes(val) ? 'checked' : '';

    return `
        ${renderNav()}
<div class="main-content" style="max-width: 600px;">
    <div class="flex justify-between items-center mb-6">
        <h2>Settings</h2>
        <a href="#/progress" class="btn btn-ghost" style="font-size: 0.875rem;">← Back</a>
    </div>

    <div class="card">
        <h3 class="mb-4">Profile & Goals</h3>
        <form id="settings-form">
            <!-- Profile Info -->
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Your Name</label>
                <input type="text" id="set-name" class="form-input" value="${store.profile.name || ''}" required>
            </div>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Business Name</label>
                <input type="text" id="set-biz" class="form-input" value="${store.profile.businessName || ''}" required>
            </div>
            
            <div class="form-group mb-6">
                <label class="form-label" style="font-weight: 600;">Business Logo</label>
                <div style="display: flex; gap: 1rem; align-items: flex-start; margin-bottom: 0.5rem;">
                    <div style="width: 60px; height: 60px; border-radius: var(--radius-md); background: var(--color-bg-light); border: 1px dashed var(--color-border); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                        ${store.profile.logo ? `<img src="${store.profile.logo}" id="logo-preview-img" style="width: 100%; height: 100%; object-fit: contain;">` : `<span id="logo-preview-placeholder" style="color: var(--color-text-muted); font-size: 0.75rem;">No Logo</span><img src="" id="logo-preview-img" style="display: none; width: 100%; height: 100%; object-fit: contain;">`}
                    </div>
                    <div style="flex-grow: 1;">
                        <input type="text" id="set-logo-url" class="form-input mb-2" value="${store.profile.logo && store.profile.logo.startsWith('http') ? store.profile.logo : ''}" placeholder="Paste Image URL here...">
                        <label for="set-logo-file" class="btn btn-outline btn-sm" style="display: inline-block; cursor: pointer; font-size: 0.8rem; padding: 0.25rem 0.75rem;">Upload Image File</label>
                        <input type="file" id="set-logo-file" accept="image/*" style="display: none;">
                        <input type="hidden" id="set-logo-base64" value="${store.profile.logo && store.profile.logo.startsWith('data:image') ? store.profile.logo : ''}">
                    </div>
                </div>
            </div>

            <!-- CEO Profiling -->
            <h4 class="mb-4 pt-4" style="border-top: 1px solid var(--color-border); color: var(--color-primary-dark);">CEO Business Profile</h4>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Top Business Bottleneck</label>
                <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">The AI Coach uses this to prioritize its Friday Advice.</p>
                <select id="set-bottleneck" class="form-input" style="padding: 0.75rem;">
                    <option value="Sales Conversion" ${store.profile.bottleneck === 'Sales Conversion' ? 'selected' : ''}>Sales Conversion (Traffic is high, Sales are low)</option>
                    <option value="Audience Size" ${store.profile.bottleneck === 'Audience Size' ? 'selected' : ''}>Audience Size (Offers are great, Visibility is low)</option>
                    <option value="Time & Delivery" ${store.profile.bottleneck === 'Time & Delivery' || !store.profile.bottleneck ? 'selected' : ''}>Time / Delivery (Overworked & Burnt out)</option>
                </select>
            </div>

            <div class="form-group mb-6">
                <label class="form-label" style="font-weight: 600;">CEO Strategy Mode</label>
                <p style="color: #6941C6; font-size: 0.85rem; margin-bottom: 0.5rem;"><strong>Important:</strong> Changing this completely rewrites the AI Planning Assistant and Smart Prompts to focus on this strict trajectory.</p>
                <select id="set-strategy" class="form-input" style="padding: 0.75rem;">
                    <option value="First Sale Sprint" ${store.profile.strategyMode === 'First Sale Sprint' ? 'selected' : ''}>First Sale Sprint (Focus: Direct Outreach & Fast Cash)</option>
                    <option value="Offer Launch Quarter" ${store.profile.strategyMode === 'Offer Launch Quarter' ? 'selected' : ''}>Offer Launch Quarter (Focus: Build Hype & Open Cart)</option>
                    <option value="Audience Growth" ${store.profile.strategyMode === 'Audience Growth' ? 'selected' : ''}>Audience Growth (Focus: Massive Lead Generation)</option>
                    <option value="CEO Reset" ${store.profile.strategyMode === 'CEO Reset' || !store.profile.strategyMode ? 'selected' : ''}>CEO Reset (Focus: Systems, Automating & Hiring)</option>
                </select>
            </div>

            <!-- 90 Day Goals -->
            <h4 class="mb-4 pt-4" style="border-top: 1px solid var(--color-border); color: var(--color-primary-dark);">90-Day Vision</h4>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Main Focus</label>
                <input type="text" id="set-focus" class="form-input" value="${store.goals.focus || ''}" placeholder="e.g. Launch new coaching program" required>
            </div>
            <div class="form-group mb-4">
                <label class="form-label" style="font-weight: 600;">Measurable Outcome</label>
                <input type="text" id="set-outcome" class="form-input" value="${store.goals.outcome || ''}" placeholder="e.g. 10 beta clients at $1.5k" required>
            </div>
            
            <div class="form-group mb-6">
                <label class="form-label" style="font-weight: 600;">Top 3 Priorities</label>
                <input type="text" id="set-p1" class="form-input mb-2" value="${store.goals.priorities?.[0] || ''}" placeholder="Priority 1" required>
                <input type="text" id="set-p2" class="form-input mb-2" value="${store.goals.priorities?.[1] || ''}" placeholder="Priority 2">
                <input type="text" id="set-p3" class="form-input" value="${store.goals.priorities?.[2] || ''}" placeholder="Priority 3">
            </div>

            <h4 class="mb-4 pt-4" style="border-top: 1px solid var(--color-border); color: var(--color-secondary-dark);">Weekly Setup</h4>
            <div class="form-group mb-6">
                <label class="form-label" style="font-size: 1.05rem; color: var(--color-black);">Planning Day</label>
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

            <h3 class="mb-4 pt-4" style="border-top: 1px solid var(--color-border);">Reminders & Prompts</h3>
            <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 1.5rem;">
                Select when you'd like the app to remind you about CEO tasks.
                <i>(Note: In this MVP, this visually sets your preferences. Full push notifications require backend infra).</i>
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

            <div class="mt-8 flex justify-end">
                <button type="submit" class="btn btn-primary">Save Preferences</button>
            </div>
        </form>
    </div>

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

            // Determine Logo
            const urlVal = document.getElementById('set-logo-url').value;
            const base64Val = document.getElementById('set-logo-base64').value;
            let finalLogo = urlVal || base64Val || '';

            const focus = document.getElementById('set-focus').value;
            const outcome = document.getElementById('set-outcome').value;
            const p1 = document.getElementById('set-p1').value;
            const p2 = document.getElementById('set-p2').value;
            const p3 = document.getElementById('set-p3').value;

            updateGoals({
                focus: focus,
                outcome: outcome,
                priorities: [p1, p2, p3].filter(Boolean)
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
