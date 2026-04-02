// auth.js

export function renderAuth(isSignup = false) {
    window.setScreenModule({ attachEvents: authAttachEvents });

    const title = isSignup ? "Create your account" : "Log in to your account";
    const subtitle = isSignup ? "Start your 90-day CEO journey today." : "Welcome back! Please enter your details.";
    const btnText = isSignup ? "Create Account" : "Sign In";
    const switchText = isSignup ? "Already have an account? <a href='#/login' style='color: var(--color-primary-dark); text-decoration: none; font-weight: 600;'>Log in</a>" : "Don't have an account? <a href='#/signup' style='color: var(--color-primary-dark); text-decoration: none; font-weight: 600;'>Sign up</a>";

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
                    ${isSignup ? `
                    <div class="form-group" style="margin: 0;">
                        <label style="font-size: 0.875rem; font-weight: 500; color: var(--color-text-main); margin-bottom: 0.4rem;">Full Name</label>
                        <input type="text" id="auth-name" class="form-input" placeholder="Enter your name" required style="border-radius: 8px;">
                    </div>
                    ` : ''}

                    <div class="form-group" style="margin: 0;">
                        <label style="font-size: 0.875rem; font-weight: 500; color: var(--color-text-main); margin-bottom: 0.4rem;">Email</label>
                        <input type="email" id="auth-email" class="form-input" placeholder="Enter your email" required style="border-radius: 8px;">
                    </div>

                    <div class="form-group" style="margin: 0;">
                        <label style="font-size: 0.875rem; font-weight: 500; color: var(--color-text-main); margin-bottom: 0.4rem; display: flex; justify-content: space-between;">
                            Password
                            ${!isSignup ? `<a href="#" style="color: var(--color-primary); text-decoration: none; font-size: 0.8rem;">Forgot password?</a>` : ''}
                        </label>
                        <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required style="border-radius: 8px;" minlength="6">
                    </div>

                    <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 1rem; border-radius: 8px; margin-top: 0.5rem; box-shadow: 0 4px 6px -1px rgba(78, 14, 255, 0.2);">${btnText}</button>
                </form>

                <div style="text-align: center; margin-top: 2rem; font-size: 0.9rem; color: var(--color-text-muted);">
                    ${switchText}
                </div>
            </div>
        </div>
    `;
}

function authAttachEvents() {
    const form = document.getElementById('auth-form');
    // Determine if we are on the signup screen by looking for the explicit signup field
    const isSignup = document.getElementById('auth-name') !== null;

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // In a real app, this would hit an API via fetch().
            // For MVP, we simply authenticate the user via local storage security state.
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            
            if (email && password) {
                const btn = form.querySelector('button[type="submit"]');
                const originalText = btn.innerText;
                btn.innerText = "Authenticating...";
                btn.style.opacity = '0.8';
                
                if (isSignup) {
                    const name = document.getElementById('auth-name').value;
                    // Real Supabase Signup
                    db.auth.signUp({
                        email: email,
                        password: password,
                        options: { data: { name: name } }
                    }).then(async ({ data, error }) => {
                        if (error) {
                            alert("Sign up failed: " + error.message);
                            btn.innerText = originalText;
                            btn.style.opacity = '1';
                        } else {
                            localStorage.setItem('ceo_auth', 'true');
                            window.location.hash = '#/';
                            window.location.reload();
                        }
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
                            // Fetch user's cloud data and populate local storage BEFORE reloading the app
                            try {
                                const { data: dbData, error: dbError } = await db
                                    .from('user_data')
                                    .select('data')
                                    .eq('user_id', data.user.id)
                                    .single();
                                
                                if (dbError && dbError.code !== 'PGRST116') {
                                    alert("Error fetching cloud profile: " + dbError.message);
                                }

                                if (dbData && dbData.data) {
                                    localStorage.setItem('ceoPlanner_store', JSON.stringify(dbData.data));
                                }
                            } catch (err) {
                                console.log("No cloud profile found or error fetching. Starting fresh.", err);
                            }

                            localStorage.setItem('ceo_auth', 'true');
                            window.location.hash = '#/';
                            window.location.reload();
                        }
                    });
                }
            }
        });
    }
}
