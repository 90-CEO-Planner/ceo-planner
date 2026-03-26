// coach.js
import { renderNav } from '../components/nav.js';
import { getStore } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';

export function renderCoach() {
    window.setScreenModule({ attachEvents: coachAttachEvents });
    const store = getStore();

    // Generate AI Insights (Classic)
    const insight = generateInsights(store);

    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 800px; padding-top: 2rem;">
            
            <div style="margin-bottom: 2rem; text-align: center;">
                <h2>AI Coach</h2>
                <p style="color: var(--color-text-muted);">Your personalized strategic advisor.</p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2rem;">
                
                <!-- CEO Insight Engine -->
                <div class="card" style="border-top: 4px solid var(--color-primary);">
                    <div class="flex items-center gap-2 mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                        <h3 style="margin: 0; display: flex; align-items: center;">
                            Weekly CEO Insight
                            ${renderTooltip("Identifies the area most likely slowing your progress right now.", "Solving the right problem is faster than doing more work.")}
                        </h3>
                    </div>
                    <div style="background: var(--color-bg-main); padding: 1.25rem; border-radius: var(--radius-md); font-size: 1.05rem; line-height: 1.6; color: var(--color-black);">
                        ${insight}
                    </div>
                </div>

                <!-- Decision Filter -->
                <div class="card" style="border-top: 4px solid var(--color-secondary);">
                    <div class="flex items-center gap-2 mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary-dark)" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                        <h3 style="margin: 0; display: flex; align-items: center;">
                            CEO vs Busy Work
                            ${renderTooltip("A simple filter to test if a new idea or task is worth doing.", "Before you drop everything to launch a new funnel, run it through this filter.")}
                        </h3>
                    </div>
                    <p style="color: var(--color-text-muted); font-size: 0.95rem; margin-bottom: 1.5rem;">Paste a new idea below to evaluate it against your 90-day goal.</p>
                    <form id="decision-filter-form">
                        <div class="form-group mb-4">
                            <textarea class="form-textarea" id="idea-input" placeholder="e.g., Start a TikTok channel..." required style="min-height: 80px;"></textarea>
                        </div>
                        <button type="submit" class="btn btn-secondary" style="width: 100%;">Evaluate Idea</button>
                    </form>
                    <div id="decision-result" class="mt-6" style="display: none; background: var(--color-secondary-light); padding: 1.5rem; border-radius: var(--radius-md); border-left: 4px solid var(--color-secondary);">
                        <div class="flex items-center gap-2 mb-2">
                            <span style="font-weight: 600; color: var(--color-secondary-dark); font-size: 0.95rem;">Verdict:</span>
                            <span id="alignment-score" style="font-weight: 700; font-size: 0.95rem; padding: 0.25rem 0.5rem; border-radius: 8px;"></span>
                        </div>
                        <p id="alignment-explanation" style="font-size: 1rem; color: var(--color-text-main); margin-top: 0.5rem; line-height: 1.5;"></p>
                    </div>
                </div>

            </div>
        </div>
    `;
}

// Logic Rules Engine
function generateInsights(store) {
    const reviews = store.reviews || [];
    const plans = store.weeklyPlans || [];
    
    // Check if we have enough data
    if (reviews.length < 2 && plans.length < 2) {
        return "Not enough data yet. Complete a few more weekly plans and Friday reviews so your Coach can spot patterns and generate personalized insights.";
    }

    const recentPlans = plans.slice(-3);
    let visibilityCount = 0; let followUpCount = 0; let revActionCount = 0;

    recentPlans.forEach(p => {
        if (p.visibilityAction && p.visibilityAction.length > 5) visibilityCount++;
        if (p.followUps && p.followUps.length > 5 && !p.followUps.toLowerCase().includes('none')) followUpCount++;
        if (p.revenueAction && p.revenueAction.length > 5) revActionCount++;
    });

    // 1. Sales/Conversion Check
    if (visibilityCount >= 2 && (followUpCount === 0 || revActionCount === 0)) {
        return "<strong>Sales/Conversion Alert:</strong> You have been doing a lot of 'Visibility' and marketing actions recently, but you are failing to log 'Follow-up' or direct 'Revenue' actions. Stop marketing immediately and start scheduling sales conversations to convert your generated interest into revenue.";
    }

    // 2. Time/Energy Check
    const recentReviews = reviews.slice(-3);
    let difficultContent = false;
    recentReviews.forEach(r => {
        if (r.difficult) {
            const diff = r.difficult.toLowerCase();
            if (diff.includes('email') || diff.includes('content') || diff.includes('writing')) difficultContent = true;
        }
    });

    if (difficultContent) {
        return "<strong>Energy Drain Alert:</strong> You consistently mention that writing, emails, or content creation was difficult or draining. Consider lowering your content volume or immediately start batch-creating it on Mondays so it stops dragging down your energy all week.";
    }

    return "Your momentum looks clean. You are protecting your CEO time and focusing on revenue-generating actions. Keep executing your 90-day plan.";
}

function coachAttachEvents() {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-coach')?.classList.add('active');

    // Decision Filter Events
    const filterForm = document.getElementById('decision-filter-form');
    if (filterForm) {
        filterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const idea = document.getElementById('idea-input').value.toLowerCase();
            const store = getStore();
            
            const focus = (store.goals?.focus || '').toLowerCase();
            const priorities = (store.goals?.priorities || []).join(' ').toLowerCase();
            const strategyMode = (store.profile?.stage || '').toLowerCase(); // Approximating Strategy Mode from stage

            let score = "Busy Work";
            let color = "#B42318";
            let bg = "#FEE4E2";
            let explanation = "This idea represents a tangent, distraction, or simply doesn't share DNA with your current Top 3 priorities. Put it in an idea parking lot for the next quarter.";

            const ideaWords = idea.split(' ').filter(w => w.length > 3);
            let matchCount = 0;
            
            ideaWords.forEach(word => {
                if (focus.includes(word) || priorities.includes(word) || strategyMode.includes(word)) {
                    matchCount++;
                }
            });

            // "If the idea directly aligns with your stated 90-day focus or heavily supports your active Strategy Mode"
            if (matchCount >= 2 || (idea.includes('sales') || idea.includes('revenue') || idea.includes('offer'))) {
                score = "Strategic";
                color = "#027A48"; bg = "#E1FDF4";
                explanation = "This idea directly aligns with your stated 90-day focus and supports your active Strategy Mode. Add it to your weekly plan.";
            }

            const scoreEl = document.getElementById('alignment-score');
            scoreEl.textContent = score; 
            scoreEl.style.color = color; 
            scoreEl.style.backgroundColor = bg;
            document.getElementById('alignment-explanation').textContent = explanation;
            document.getElementById('decision-result').style.display = 'block';
        });
    }
}
