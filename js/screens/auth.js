// auth.js

export function renderAuth(mode = 'login') {
    // Keep compatibility with old boolean signature
    if (mode === true) mode = 'signup';
    if (mode === false) mode = 'login';
    
    window.setScreenModule({ attachEvents: authAttachEvents });

    let title = "Log in to your account";
    let subtitle = "Welcome back! Please enter your details.";
    let btnText = "Sign In";
    let switchText = "Just purchased? <a href='#/signup' style='color: var(--color-primary-dark); text-decoration: none; font-weight: 600;'>Create your account here</a>";

    if (mode === 'signup') {
        title = "Create your account";
        subtitle = "Start your 90-day CEO journey today.";
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
                    <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: var(--color-primary); color: white; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: 0 4px 6px -1px rgba(78, 14, 255, 0.3);">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
                    </div>
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
                        <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required style="border-radius: 8px;" minlength="6">
                    </div>
                    ` : ''}

                    <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 1rem; border-radius: 8px; margin-top: 0.5rem; box-shadow: 0 4px 6px -1px rgba(78, 14, 255, 0.2);">${btnText}</button>
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

function authAttachEvents() {
    const form = document.getElementById('auth-form');
    if (!form) return;

    const hash = window.location.hash || '#/';
    const isSignup = hash.startsWith('#/signup');
    const isForgot = hash.startsWith('#/forgot-password');
    const isReset = hash.startsWith('#/reset-password');

    // Auto-fill email if they came from Stripe Checkout or password reset link
    const hashQuery = hash.includes('?') ? hash.split('?')[1] : '';
    const urlParams = new URLSearchParams(window.location.search || hashQuery);
    const stripeEmail = urlParams.get('email');
    if (stripeEmail && document.getElementById('auth-email')) {
        document.getElementById('auth-email').value = stripeEmail;
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const emailEl = document.getElementById('auth-email');
        const email = emailEl ? emailEl.value : null;
        
        const passwordEl = document.getElementById('auth-password');
        const password = passwordEl ? passwordEl.value : null;
        
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.innerText = "Processing...";
        btn.style.opacity = '0.8';
        
        if (isForgot) {
            if (email) {
                db.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + window.location.pathname + '#/reset-password'
                }).then(({ error }) => {
                    btn.innerText = originalText;
                    btn.style.opacity = '1';
                    if (error) {
                        alert("Error: " + error.message);
                    } else {
                        alert("Password reset email sent! Please check your inbox.");
                        window.location.hash = '#/login';
                    }
                });
            }
        } else if (isReset) {
            if (password) {
                db.auth.updateUser({ password: password }).then(({ error }) => {
                    btn.innerText = originalText;
                    btn.style.opacity = '1';
                    if (error) {
                        alert("Reset failed: " + error.message);
                    } else {
                        alert("Password updated successfully! Please log in with your new password.");
                        window.location.hash = '#/login';
                    }
                });
            }
        } else if (isSignup) {
            const name = document.getElementById('auth-name').value;
            
            // Verify email eligibility against paid signups table
            db.rpc('check_allowed_signup', { email_to_check: email }).then(async ({ data: isAllowed, error: rpcError }) => {
                if (rpcError) {
                    console.error("Eligibility check failed:", rpcError);
                }
                
                if (!isAllowed) {
                    alert("Sign up is only available for customers who have purchased a subscription. Please purchase a plan first, or verify you are using the same email address used during purchase.");
                    btn.innerText = originalText;
                    btn.style.opacity = '1';
                    return;
                }
                
                // Real Supabase Signup
                db.auth.signUp({
                    email: email,
                    password: password,
                    options: { data: { name: name } }
                }).then(async ({ data: signUpData, error: signUpError }) => {
                    if (signUpError) {
                        alert("Sign up failed: " + signUpError.message);
                        btn.innerText = originalText;
                        btn.style.opacity = '1';
                    } else {
                        let fetchedStatus = 'trialing'; // default fallback
                        const userId = signUpData.user ? signUpData.user.id : null;
                        if (userId) {
                            try {
                                // Wait briefly for trigger execution to complete
                                await new Promise(resolve => setTimeout(resolve, 500));
                                
                                const { data: profile } = await db
                                    .from('profiles')
                                    .select('subscription_status')
                                    .eq('id', userId)
                                    .single();
                                if (profile && profile.subscription_status) {
                                    fetchedStatus = profile.subscription_status;
                                }
                            } catch (err) {
                                console.log("Error fetching subscription status on signup, defaulting to trialing.", err);
                            }
                        }
                        
                        localStorage.setItem('ceo_auth', 'true');
                        localStorage.setItem('ceo_sub_status', fetchedStatus);
                        window.location.hash = '#/';
                        window.location.reload();
                    }
                });
            });
        } else {
            // Real Supabase Login
            db.auth.signInWithPassword({
                email: email,
                password: password
            }).then(async ({ data, error }) => {
                if (error) {
                    alert("Login failed: " + error.message);
                    btn.innerText = originalText;
                    btn.style.opacity = '1';
                } else {
                    // Fetch user's cloud data and populate local storage
                    try {
                        const { data: dbData, error: dbError } = await db
                            .from('user_data')
                            .select('data')
                            .eq('user_id', data.user.id)
                            .single();
                        
                        if (dbData && dbData.data) {
                            localStorage.setItem('ceoPlanner_store', JSON.stringify(dbData.data));
                        }
                    } catch (err) {
                        console.log("No cloud profile found or error fetching. Starting fresh.", err);
                    }

                    // Fetch Subscription Status separately
                    try {
                        const { data: profile } = await db
                            .from('profiles')
                            .select('subscription_status')
                            .eq('id', data.user.id)
                            .single();
                        
                        if (profile && profile.subscription_status) {
                            localStorage.setItem('ceo_sub_status', profile.subscription_status);
                        } else {
                            localStorage.setItem('ceo_sub_status', 'active'); // Fallback
                        }
                    } catch (err) {
                        console.log("Error fetching subscription status.", err);
                        localStorage.setItem('ceo_sub_status', 'active'); // Fallback
                    }

                    localStorage.setItem('ceo_auth', 'true');
                    window.location.hash = '#/';
                    window.location.reload();
                }
            });
        }
    });
}
