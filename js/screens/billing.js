// billing.js

export function renderBilling() {
    window.setScreenModule({ attachEvents: billingAttachEvents });

    return `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-bg-main) 100%); padding: 1.5rem;">
            <div class="card fade-up" style="width: 100%; max-width: 480px; padding: 3rem 2.5rem; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(10px);">
                
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: rgba(252, 165, 165, 0.2); color: #DC2626; border-radius: 16px; margin-bottom: 1.5rem;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                
                <h2 style="font-size: 1.75rem; color: var(--color-black); margin-bottom: 1rem; letter-spacing: -0.02em;">Command Center Locked</h2>
                
                <p style="color: var(--color-text-muted); font-size: 1.05rem; margin-bottom: 2rem; line-height: 1.6;">
                    Your trial has ended or your payment method failed. Please update your billing information to regain access to your dashboard and 90-day plan.
                </p>

                <!-- This will be dynamically replaced with the Stripe Customer Portal link -->
                <button id="btn-portal" class="btn btn-primary" style="width: 100%; padding: 1rem; font-size: 1.1rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(78, 14, 255, 0.2); margin-bottom: 1rem;">
                    Update Payment Method
                </button>
                
                <a href="#" onclick="localStorage.removeItem('ceo_auth'); localStorage.removeItem('ceoPlanner_store'); window.location.hash='#/login'; window.location.reload(); return false;" style="color: var(--color-text-muted); font-size: 0.875rem; text-decoration: underline;">Sign out</a>
            </div>
        </div>
    `;
}

function billingAttachEvents() {
    const btnPortal = document.getElementById('btn-portal');
    if (btnPortal) {
        btnPortal.addEventListener('click', () => {
            // In a real app, you would hit your Supabase Edge Function to generate a Stripe Customer Portal session URL.
            // For now, this is where the user puts their hardcoded Stripe Customer Portal link from the Stripe Dashboard.
            // Example: https://billing.stripe.com/p/session/test_12345
            alert("This will redirect to the Stripe Customer Portal where the user can update their card.");
        });
    }
}
