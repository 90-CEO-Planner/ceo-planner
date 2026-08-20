// auth.js
import { showToast } from '../components/toast.js';
import { clearLiveAICache } from '../liveAI.js';
import { clearAiAllowance } from '../components/proGate.js';

export function renderAuth(mode = 'login') {
    // Keep compatibility with old boolean signature
    if (mode === true) mode = 'signup';
    if (mode === false) mode = 'login';
    
    window.setScreenModule({ attachEvents: authAttachEvents });

    let title = "Log in to your account";
    let subtitle = "Welcome back! Please enter your details.";
    let btnText = "Sign In";
    let switchText = "New here? <a href='#/signup' style='color: var(--color-primary-dark); text-decoration: none; font-weight: 600;'>Start your free trial</a>";

    if (mode === 'signup') {
        title = "Start your free trial";
        subtitle = "14 days free. No card needed.";
        btnText = "Create Account";
        switchText = "Already have an account? <a href='#/login' style='color: var(--color-primary-dark); text-decoration: none; font-weight: 600;'>Log in</a>";
    } else if (mode === 'forgot') {
        title = "Reset your password";
        subtitle = "Enter your email to receive a password reset link.";
        btnText = "Send Reset Link";
        switchText = "Remember your password? <a href='#/login' style='color: var(--color-primary-dark); text-decoration: none; font-weight: 600;'>Log in</a>";
    } else if (mode === 'reset') {
        title = "Create new password";
        subtitle = "Please enter your new password below.";
        btnText = "Update Password";
        switchText = "";
    }

    return `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-bg-main) 100%); padding: 1.5rem;">
            <div class="card" style="width: 100%; max-width: 440px; padding: 2.5rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(10px);">
                
                <div style="text-align: center; margin-bottom: 2rem;">
                    <img src="./logo.png" alt="CEO Planner" style="max-height: 24px; max-width: 100%; object-fit: contain; margin-bottom: 1.5rem;">
                    <h2 style="font-size: 1.75rem; color: var(--color-black); margin-bottom: 0.5rem; letter-spacing: -0.02em;">${title}</h2>
                    <p style="color: var(--color-text-muted); font-size: 0.95rem;">${subtitle}</p>
                </div>

                <form id="auth-form" style="display: flex; flex-direction: column; gap: 1.25rem;">
                    ${mode === 'signup' ? `
                    <div class="form-group" style="margin: 0;">
                        <label style="font-size: 0.875rem; font-weight: 500; color: var(--color-text-main); margin-bottom: 0.4rem;">Full Name</label>
                        <input type="text" id="auth-name" class="form-input" placeholder="Enter your name" required style="border-radius: 8px;">
                    </div>
                    ` : ''}

                    ${mode !== 'reset' ? `
                    <div class="form-group" style="margin: 0;">
                        <label style="font-size: 0.875rem; font-weight: 500; color: var(--color-text-main); margin-bottom: 0.4rem;">Email</label>
                        <input type="email" id="auth-email" class="form-input" placeholder="Enter your email" required style="border-radius: 8px;">
                    </div>
                    ` : ''}

                    ${mode !== 'forgot' ? `
                    <div class="form-group" style="margin: 0;">
                        <label style="font-size: 0.875rem; font-weight: 500; color: var(--color-text-main); margin-bottom: 0.4rem; display: flex; justify-content: space-between;">
                            ${mode === 'reset' ? 'New Password' : 'Password'}
                            ${mode === 'login' ? `<a href="#/forgot-password" style="color: var(--color-primary); text-decoration: none; font-size: 0.8rem;">Forgot password?</a>` : ''}
                        </label>
                        <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required style="border-radius: 8px;" minlength="${mode === 'login' ? 6 : 8}">
                        ${mode === 'signup' || mode === 'reset' ? `
                        <p style="font-size: 0.8rem; color: var(--color-text-muted); margin: 0.4rem 0 0;">
                            At least 8 characters.
                        </p>
                        ` : ''}
                    </div>
                    ` : ''}

                    ${mode === 'login' ? `
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: -0.5rem; margin-bottom: 0.5rem;">
                        <input type="checkbox" id="auth-remember" style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--color-primary);">
                        <label for="auth-remember" style="font-size: 0.85rem; color: var(--color-text-muted); cursor: pointer; user-select: none;">Remember me</label>
                    </div>
                    ` : ''}

                    ${mode !== 'reset' ? `
                    <div id="auth-captcha" style="display: flex; justify-content: center; min-height: 0;"></div>
                    ` : ''}

                    <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 1rem; border-radius: 8px; margin-top: 0.5rem; box-shadow: 0 4px 6px -1px rgba(78, 14, 255, 0.2);">${btnText}</button>

                    ${mode === 'signup' ? `
                    <p style="text-align: center; font-size: 0.85rem; color: var(--color-text-muted); margin: 0;">
                        No card required. We'll only ask for payment details if you decide to stay after 14 days.
                    </p>
                    ` : ''}
                </form>

                ${switchText ? `
                <div style="text-align: center; margin-top: 2rem; font-size: 0.9rem; color: var(--color-text-muted);">
                    ${switchText}
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

// --- Bot protection ---------------------------------------------------------
//
// Added after a run of automated signups in August 2026: roughly one every few
// hours, each with a keyboard-mash name and a Gmail address wearing scattered
// dots. They cost nothing in AI usage, but every one of them reached Loops as a
// live trial contact, and junk addresses on the list are what damage sending
// reputation for the real subscribers.
//
// Two independent defences, because either alone leaves a gap. Turnstile stops
// the automated traffic; canonicalEmail stops one person quietly farming an
// unlimited run of free trials out of a single inbox.

let turnstileWidgetId = null;

function captchaSiteKey() {
    return window.CEO_TURNSTILE_SITE_KEY || null;
}

// Supabase enforces the captcha on signup, password sign-in *and* password
// recovery the moment it is switched on, so all three need a token. Only the
// reset form is exempt: it calls updateUser on an already-valid session, which
// is not a captcha-protected endpoint.
//
// The Account page's "Change password" asks for a recovery email too, so it is
// captcha-protected in exactly the same way. It had no widget at all until
// 20 Aug 2026, which meant it sent no token and failed every single time with
// "no captcha_token found" — a button that could never once have worked. These
// three are exported rather than copied so the two screens cannot drift into
// disagreeing about when a token is needed.
export function captchaAppliesTo(mode) {
    return mode !== 'reset' && !!captchaSiteKey();
}

export function mountCaptcha(mode, attempt = 0, holderId = 'auth-captcha') {
    if (!captchaAppliesTo(mode)) return;

    const holder = document.getElementById(holderId);
    if (!holder) return;

    // The Turnstile script is loaded async from Cloudflare, so on a cold load it
    // is routinely not ready by the time this screen attaches its events. Wait
    // for it rather than leaving the form with no widget and no way to submit.
    if (typeof window.turnstile === 'undefined') {
        if (attempt < 40) setTimeout(() => mountCaptcha(mode, attempt + 1, holderId), 150);
        return;
    }

    // Navigating login -> signup rebuilds the form, orphaning the old widget.
    if (turnstileWidgetId !== null) {
        try { window.turnstile.remove(turnstileWidgetId); } catch (err) { /* already gone */ }
        turnstileWidgetId = null;
    }
    holder.innerHTML = '';

    turnstileWidgetId = window.turnstile.render(holder, {
        sitekey: captchaSiteKey(),
        theme: 'light',
    });
}

export function captchaToken(mode) {
    if (!captchaAppliesTo(mode) || turnstileWidgetId === null) return undefined;
    try {
        return window.turnstile.getResponse(turnstileWidgetId) || undefined;
    } catch (err) {
        return undefined;
    }
}

// Tokens are single use. Every failed attempt has to hand the widget back a
// fresh one, or the retry is refused for a reason the customer cannot see.
export function resetCaptcha() {
    if (turnstileWidgetId === null || typeof window.turnstile === 'undefined') return;
    try { window.turnstile.reset(turnstileWidgetId); } catch (err) { /* nothing to reset */ }
}

// One Gmail inbox, one account.
//
// Gmail ignores dots in the local part and everything after a `+`, so
// `l.o.gan@gmail.com`, `logan+x@gmail.com` and `logan@gmail.com` are all the
// same mailbox. That is precisely how the August bot run produced a stream of
// "unique" addresses that still received mail, and it is the standard way to
// farm an endless supply of free trials. Folding an address back to its
// canonical form means the second attempt collides with the existing account
// and Supabase refuses it.
//
// Applied on the way in to signup, login and password recovery alike, so the
// same inbox always resolves to the same account however the address is typed.
//
// Deliberately limited to Gmail's own domains. Most providers treat dots as
// significant, and stripping them elsewhere would merge two unrelated people.
function canonicalEmail(email) {
    if (!email) return email;

    const at = email.lastIndexOf('@');
    if (at === -1) return email;

    let local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (domain !== 'gmail.com' && domain !== 'googlemail.com') return email;

    const plus = local.indexOf('+');
    if (plus !== -1) local = local.slice(0, plus);
    local = local.split('.').join('');

    // An address that was nothing but dots and tags. Leave it exactly as typed
    // and let Supabase reject it, rather than inventing an empty local part.
    if (!local) return email;

    return local + '@gmail.com';
}

function authAttachEvents() {
    const form = document.getElementById('auth-form');
    if (!form) return;

    const hash = window.location.hash || '#/';
    const isSignup = hash.startsWith('#/signup');
    const isForgot = hash.startsWith('#/forgot-password');
    const isReset = hash.startsWith('#/reset-password');

    const captchaMode = isReset ? 'reset' : 'auth';
    mountCaptcha(captchaMode);

    // Auto-fill email if they came from Stripe Checkout or password reset link
    const hashQuery = hash.includes('?') ? hash.split('?')[1] : '';
    const urlParams = new URLSearchParams(window.location.search || hashQuery);
    const stripeEmail = urlParams.get('email');
    if (stripeEmail && document.getElementById('auth-email')) {
        document.getElementById('auth-email').value = stripeEmail;
    } else if (!isSignup && !isForgot && !isReset) {
        // Email only. Supabase already persists the session, so there is never a
        // reason to keep the password anywhere on the device.
        const rememberedEmail = localStorage.getItem('ceo_remembered_email');
        if (rememberedEmail && document.getElementById('auth-email')) {
            document.getElementById('auth-email').value = rememberedEmail;
        }
        if (rememberedEmail && document.getElementById('auth-remember')) {
            document.getElementById('auth-remember').checked = true;
        }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const emailEl = document.getElementById('auth-email');
        const rawEmail = emailEl ? emailEl.value : null;
        const email = rawEmail ? canonicalEmail(rawEmail.trim().toLowerCase()) : null;

        const passwordEl = document.getElementById('auth-password');
        const password = passwordEl ? passwordEl.value : null;

        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerText;

        // Turnstile usually solves itself in the background, but it can still be
        // working when somebody submits quickly. Supabase would answer with a
        // raw "captcha protection: request disallowed", so say something useful
        // instead and leave the form exactly as it was.
        const token = captchaToken(captchaMode);
        if (captchaAppliesTo(captchaMode) && !token) {
            showToast("Still checking you're human. Give it a second and try again.", 'error');
            return;
        }

        btn.innerText = "Processing...";
        btn.style.opacity = '0.8';

        if (isForgot) {
            if (email) {
                window.db.auth.resetPasswordForEmail(email, {
                    // No '#/reset-password' on the end: Supabase appends the token as a
                    // fragment, and a redirect that already has one collides with it.
                    redirectTo: window.location.origin + window.location.pathname,
                    captchaToken: token
                }).then(({ error }) => {
                    btn.innerText = originalText;
                    btn.style.opacity = '1';
                    resetCaptcha();
                    if (error) {
                        showToast("We couldn't send that reset email: " + error.message, 'error');
                    } else {
                        showToast("Password reset email sent. Please check your inbox.");
                        window.location.hash = '#/login';
                    }
                });
            }
        } else if (isReset) {
            if (password) {
                window.db.auth.updateUser({ password: password }).then(({ error }) => {
                    btn.innerText = originalText;
                    btn.style.opacity = '1';
                    if (error) {
                        showToast("Reset failed: " + error.message, 'error');
                    } else {
                        showToast("Password updated. Please log in with your new password.");
                        window.location.hash = '#/login';
                    }
                });
            }
        } else if (isSignup) {
            const name = document.getElementById('auth-name').value;

            // Signup is open to everyone. The database trigger starts a 14-day
            // trial, so no card and no payment is needed to get in.
            window.db.auth.signUp({
                email: email,
                password: password,
                options: { data: { name: name }, captchaToken: token }
            }).then(async ({ data: signUpData, error: signUpError }) => {
                if (signUpError) {
                    showToast("Sign up failed: " + signUpError.message, 'error');
                    btn.innerText = originalText;
                    btn.style.opacity = '1';
                    resetCaptcha();
                    return;
                }

                // Give the profile trigger a moment, then read back the real trial state
                await new Promise(resolve => setTimeout(resolve, 600));
                const access = await window.refreshAccessState();
                if (!access) {
                    // Couldn't read it back (e.g. email confirmation required).
                    // Assume a fresh trial so they aren't bounced to billing.
                    localStorage.setItem('ceo_sub_status', 'trialing');
                }

                // Card-free signups never touch Stripe, so this is what puts them
                // into Loops for the welcome and trial-ending emails.
                try {
                    await window.db.functions.invoke('signup-sync');
                } catch (err) {
                    // Never block someone getting into the app over an email sync
                    console.warn('Loops sync failed at signup:', err.message);
                }

                // A brand new account starts empty. Without this, whatever plan and
                // revenue happened to be in this browser — a previous user's, or a
                // half-finished wizard — is adopted by the new account and pushed to
                // their cloud row on the first save.
                localStorage.removeItem('ceoPlanner_store');
                clearLiveAICache();
                clearAiAllowance();

                localStorage.setItem('ceo_auth', 'true');
                window.location.hash = '#/';
                window.location.reload();
            });
        } else {
            // Real Supabase Login
            window.db.auth.signInWithPassword({
                email: email,
                password: password,
                options: { captchaToken: token }
            }).then(async ({ data, error }) => {
                if (error) {
                    showToast("Login failed: " + error.message, 'error');
                    btn.innerText = originalText;
                    btn.style.opacity = '1';
                    resetCaptcha();
                } else {
                    // Drop whoever was on this device before doing anything else.
                    // This used to only *overwrite* on a successful cloud read, and
                    // the read used .single(), which throws when there is no row —
                    // so logging in as a second user on a shared browser handed them
                    // the first user's plans and revenue, and wrote it to their row.
                    // Never destroy the outgoing copy outright. Signing in
                    // replaces local data with whatever the server holds, and on
                    // 20 Aug 2026 that meant a Monday plan written on a desktop
                    // with a dead session — never synced, so never on the server —
                    // would have been gone for good the moment she signed in
                    // again. Keep the last three, so a bad sync is recoverable
                    // instead of final.
                    //
                    // Deliberately NOT auto-restored: this wipe exists because a
                    // shared browser once wrote one person's plans into another
                    // person's row, and nothing here can prove whose data this is.
                    // Recovery is a decision, not a default.
                    try {
                        const outgoing = localStorage.getItem('ceoPlanner_store');
                        if (outgoing && outgoing.length > 2) {
                            localStorage.setItem('ceoPlanner_rescue_' + new Date().toISOString(), outgoing);
                            const rescues = Object.keys(localStorage)
                                .filter(k => k.startsWith('ceoPlanner_rescue_'))
                                .sort();
                            while (rescues.length > 3) localStorage.removeItem(rescues.shift());
                        }
                    } catch (err) {
                        // A full storage quota must not block signing in.
                        console.warn('Could not keep a rescue copy:', err.message);
                    }

                    localStorage.removeItem('ceoPlanner_store');
                    // Same reasoning for the cached AI suggestions and the AI
                    // usage count: both belonged to the previous account.
                    clearLiveAICache();
                    clearAiAllowance();

                    // Then restore this account's own data, if they have any yet.
                    try {
                        const { data: dbData, error: dbError } = await window.db
                            .from('user_data')
                            .select('data')
                            .eq('user_id', data.user.id)
                            .maybeSingle();

                        if (dbError) throw dbError;

                        if (dbData && dbData.data) {
                            localStorage.setItem('ceoPlanner_store', JSON.stringify(dbData.data));
                        }
                    } catch (err) {
                        // A new account with no cloud row lands here legitimately.
                        console.log("No cloud data for this account yet. Starting fresh.", err);
                    }

                    // Read the real subscription and trial state from the database
                    const access = await window.refreshAccessState();
                    if (!access) {
                        // Couldn't reach the server. Let them in rather than locking
                        // them out over a blip. The AI is protected server side anyway.
                        localStorage.setItem('ceo_sub_status', 'trialing');
                    }

                    // Handle "Remember me" — the email, and only the email.
                    const rememberEl = document.getElementById('auth-remember');
                    if (rememberEl && rememberEl.checked) {
                        localStorage.setItem('ceo_remembered_email', email);
                    } else {
                        localStorage.removeItem('ceo_remembered_email');
                    }

                    localStorage.setItem('ceo_auth', 'true');
                    window.location.hash = '#/';
                    window.location.reload();
                }
            });
        }
    });
}
