// coach.js
import { renderNav } from '../components/nav.js';
import { getStore } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';

export function renderCoach() {
    window.setScreenModule({ attachEvents: coachAttachEvents });
    const store = getStore();

    // Generate AI Insights
    const insight = generateInsights(store);

    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 800px;">
            <div style="margin-bottom: 2rem;">
                <h2>CEO Coach & Insights</h2>
                <p style="color: var(--color-text-muted);">AI-powered analysis and decision filtering based on your recent activity.</p>
            </div>

            <!-- CEO Insight Engine -->
            <div class="card mb-8" style="border-top: 4px solid var(--color-primary);">
                <div class="flex items-center gap-2 mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    <h3 style="margin: 0; display: flex; align-items: center;">
                        Weekly CEO Insight
                        ${renderTooltip("Identifies the area most likely slowing your progress right now.", "Solving the right problem is faster than doing more work. If you have a bottleneck, a CEO stops and fixes the pipe before pouring more water.")}
                    </h3>
                </div>
                <div style="background: var(--color-bg-main); padding: 1.5rem; border-radius: var(--radius-md); font-size: 1.05rem; line-height: 1.6; color: var(--color-black);">
                    ${insight}
                </div>
            </div>

            <!-- Decision Filter -->
            <div class="card mb-8" style="border-top: 4px solid var(--color-secondary);">
                <div class="flex items-center gap-2 mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary-dark)" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    <h3 style="margin: 0; display: flex; align-items: center;">
                        CEO vs Busy Work
                        ${renderTooltip("A simple filter to test if a new idea or task is worth doing.", "We all have 'squirrel!' moments. Before you drop everything to launch a new funnel or switch platforms, run it through this filter.")}
                    </h3>
                </div>
                <p style="color: var(--color-text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">Should I focus on this? Paste a new idea below to evaluate it against your 90-day goal and current priorities.</p>
                
                <form id="decision-filter-form">
                    <div class="form-group">
                        <textarea class="form-textarea" id="idea-input" placeholder="e.g., Launch a new mini course, start a TikTok channel..." required></textarea>
                    </div>
                    <button type="submit" class="btn btn-secondary mt-4">Evaluate Idea</button>
                </form>

                <div id="decision-result" class="mt-6" style="display: none; background: var(--color-secondary-light); padding: 1.5rem; border-radius: var(--radius-md); border-left: 4px solid var(--color-secondary);">
                    <div class="flex items-center gap-2 mb-2">
                        <span style="font-weight: 600; color: var(--color-secondary-dark);">Verdict:</span>
                        <span id="alignment-score" style="font-weight: 700; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem;"></span>
                    </div>
                    <p id="alignment-explanation" style="font-size: 0.95rem; color: var(--color-text-main); margin-top: 0.5rem; line-height: 1.5;"></p>
                </div>
            </div>

            <!-- Current Strategy Mode -->
            <div class="card" style="background-color: var(--color-primary-light); border-color: var(--color-primary-light);">
                 <p style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary-dark); font-weight: 600; margin-bottom: var(--spacing-sm);">Active Strategy Mode</p>
                 <h4 style="color: var(--color-black); margin-bottom: 0.5rem;">${store.profile?.strategyMode || 'Standard'}</h4>
                 <p style="font-size: 0.9rem; color: var(--color-text-main);">Your planning prompts and metrics are currently customized for this strategy.</p>
            </div>
        </div>
    `;
}

function generateInsights(store) {
    const reviews = store.reviews || [];
    const plans = store.weeklyPlans || [];
    const name = store.profile?.name || 'CEO';
    const bottleneck = store.profile?.bottleneck || '';

    let baseGreeting = `Hey ${name}, let's look at your momentum. `;

    if (reviews.length < 2 && plans.length < 2) {
        return baseGreeting + "Complete a few more weekly plans and Friday reviews so I can start learning your working patterns and generating personalized insights.";
    }

    // Logic 1: Check Follow-ups vs Visibility (Sales Bottleneck)
    const recentPlans = plans.slice(-3); // Last 3 plans
    let visibilityCount = 0;
    let followUpCount = 0;
    let revActionCount = 0;

    recentPlans.forEach(p => {
        if (p.visibilityAction && p.visibilityAction.length > 5) visibilityCount++;
        if (p.followUps && p.followUps.length > 5 && !p.followUps.toLowerCase().includes('none')) followUpCount++;
        if (p.revenueAction && p.revenueAction.length > 5) revActionCount++;
    });

    if (visibilityCount >= 2 && followUpCount === 0) {
        let msg = baseGreeting + "I'm noticing you've had strong visibility over the last few weeks, which is fantastic! However, I don't see many follow-ups planned. ";
        if (bottleneck.includes('Sales')) {
            msg += "Since you mentioned sales conversion is a bottleneck for you right now, I highly recommend scheduling two follow-up conversations this week to convert that generated interest into revenue.";
        } else {
            msg += "Consider scheduling two follow-up conversations this week to ensure that visibility turns into revenue.";
        }
        return msg;
    }

    if (revActionCount < 2 && recentPlans.length >= 3) {
        return baseGreeting + "I noticed that revenue-generating actions haven't been your main focus for the past couple of weeks. As a CEO, protecting your revenue time is crucial. Let's make direct sales conversations or a promotional push your top priority this week.";
    }

    // Logic 2: Review difficulty analysis (Delivery/Time bottleneck)
    const recentReviews = reviews.slice(-3);
    let difficultMentionsEmailOrContent = false;
    recentReviews.forEach(r => {
        if (r.difficult) {
            const difficult = r.difficult.toLowerCase();
            if (difficult.includes('email') || difficult.includes('content') || difficult.includes('writing') || difficult.includes('post')) {
                difficultMentionsEmailOrContent = true;
            }
        }
    });

    if (difficultMentionsEmailOrContent) {
        let msg = baseGreeting + "You've consistently mentioned content creation or email writing as a drain in your recent Friday reviews. ";
        if (bottleneck.includes('Time')) {
            msg += "Since time and delivery are already tight for you, consider batch-creating your content, lowering your posting volume, or dedicating a specific 90-minute block early in the week to get it out of the way.";
        } else {
            msg += "Consider lowering the volume, or dedicating a specific focused block early in the week to get it out of the way before it drains your energy.";
        }
        return msg;
    }

    // Default positive reinforcement
    return baseGreeting + "You are consistently logging your plans and protecting your CEO time—well done! Keep focusing closely on your revenue-generating actions and notice what brings you energy this week.";
}

function coachAttachEvents() {
    // Nav active state update
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-coach')?.classList.add('active');

    const form = document.getElementById('decision-filter-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const idea = document.getElementById('idea-input').value.toLowerCase();
            const store = getStore();
            const focus = (store.goals?.focus || '').toLowerCase();
            const priorities = (store.goals?.priorities || []).join(' ').toLowerCase();
            const mode = (store.profile?.strategyMode || '').toLowerCase();

            let score = "Busy Work";
            let color = "#B42318";
            let bg = "#FEE4E2";
            let explanation = "This idea does not strongly align with your current 90-day focus or priorities. It may be a distraction. Put it in an idea parking lot for the next quarter.";

            // Basic AI simulation logic using keyword matching
            const ideaWords = idea.split(' ').filter(w => w.length > 3);
            let matchCount = 0;

            ideaWords.forEach(word => {
                if (focus.includes(word) || priorities.includes(word) || mode.includes(word)) {
                    matchCount++;
                }
            });

            if (matchCount >= 2 || (idea.includes('course') && mode.includes('offer')) || (idea.includes('post') && mode.includes('audience'))) {
                score = "Strategic";
                color = "#027A48";
                bg = "#E1FDF4";
                explanation = "This idea strongly supports your current 90-day focus and aligns with your Strategy Mode. It's a solid action to add to your weekly plan.";
            } else if (matchCount === 1 || idea.includes('email') || idea.includes('client')) {
                score = "Busy Work";
                color = "#B54708";
                bg = "#FEF0C7";
                explanation = "This idea has some alignment with your goals, but might be secondary to your Top 3 Priorities. Only proceed if you have extra capacity this week.";
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
