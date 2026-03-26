// weeklyPlanner.js
import { renderNav } from '../components/nav.js';
import { getStore, addWeeklyPlan, updateWeeklyPlan } from '../store.js';

export function renderPlanner() {
    window.setScreenModule({ attachEvents: plannerAttachEvents });
    const store = getStore();
    let activePlan = store.weeklyPlans.length > 0 ? store.weeklyPlans[store.weeklyPlans.length - 1] : null;

    if (activePlan) {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(activePlan.date)) / (1000 * 60 * 60 * 24));
        if (diffDays > 6) {
            activePlan = null;
        }
    }

    const win = activePlan ? activePlan.winCondition : '';
    const p1 = activePlan && activePlan.topActions ? (activePlan.topActions[0] || '') : (store.goals?.priorities?.[0] || '');
    const p2 = activePlan && activePlan.topActions ? (activePlan.topActions[1] || '') : (store.goals?.priorities?.[1] || '');
    const p3 = activePlan && activePlan.topActions ? (activePlan.topActions[2] || '') : (store.goals?.priorities?.[2] || '');
    const rev = activePlan ? activePlan.revenueAction : '';
    const vis = activePlan ? activePlan.visibilityAction : '';
    const fol = activePlan ? activePlan.followUps : '';

    const prompts = getSmartPrompts(store.profile?.strategyMode);

    return `
        ${renderNav()}
        <div class="main-content" style="max-width: 700px;">
            <div style="margin-bottom: 2rem;">
                <h2>Weekly CEO Plan</h2>
                <p style="color: var(--color-text-muted);">Set your intentions and priorities for the week ahead.</p>
            </div>

            ${store.profile?.strategyMode ? `
            <!-- Generated Weekly Focus Insight -->
            <div class="card mb-6" style="background: var(--color-primary-light); border-left: 4px solid var(--color-primary);">
                <div class="flex items-center gap-2 mb-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-dark)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 16 12 12 12 8"></polyline><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <h4 style="margin: 0; color: var(--color-primary-dark);">Suggested Focus for this Strategy Mode</h4>
                </div>
                <p style="font-size: 0.95rem; margin-bottom: 0;">${getSuggestedFocus(store.profile.strategyMode)}</p>
            </div>
            ` : ''}
            
            <!-- AI Planning Assistant Suggestions (always visible) -->
            <div class="card mb-6" style="border-top: 4px solid var(--color-secondary);">
                <div class="flex items-center gap-2 mb-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary-dark)" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M12 7v6"></path><path d="M12 17h.01"></path></svg>
                    <h4 style="margin: 0; color: var(--color-black);">AI Planning Assistant</h4>
                </div>
                <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 0.75rem;">Generated based on your <strong>monthly focus</strong>, priorities, and recent activity to move your business forward.</p>
                <div style="background: var(--color-bg-light); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.95rem; color: var(--color-secondary-dark);">
                    <ul style="margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 0.75rem;">
                        ${generatePlanSuggestions(store).map((s, index) => `
                        <li style="display: flex; gap: 0.75rem; align-items: flex-start; background: #fff; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div style="flex-grow: 1; line-height: 1.4;">
                                <strong style="color: var(--color-primary-dark);">${s.type}:</strong> ${s.action}
                            </div>
                            <button type="button" class="btn btn-outline apply-suggestion-btn" data-type="${s.type.toLowerCase()}" data-action="${s.action}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; flex-shrink: 0;">Apply</button>
                        </li>
                        `).join('')}
                    </ul>
                </div>
                <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 0.75rem; text-align: center;">Steal these ideas or write your own below!</p>
            </div>

            <form id="planner-form" class="card" data-plan-id="${activePlan ? activePlan.id : ''}">
                <div class="form-group">
                    <label class="form-label" style="font-size: 1.1rem; color: var(--color-primary-dark);">${store.profile?.name ? store.profile.name + ", w" : "W"}hat would make this week a win?</label>
                    <textarea class="form-textarea" id="plan-win" placeholder="e.g., Getting 3 sales calls booked and finishing the landing page layout." required>${win}</textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem;">Top 3 Most Important Actions</label>
                    <p class="form-helper mb-2">${store.profile?.name ? store.profile.name + ", w" : "W"}hat three actions would move your business forward this week?</p>
                    <input type="text" class="form-input mb-2" id="pa-1" value="${p1}" placeholder="1." required />
                    <input type="text" class="form-input mb-2" id="pa-2" value="${p2}" placeholder="2." required />
                    <input type="text" class="form-input" id="pa-3" value="${p3}" placeholder="3." required />
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem; color: var(--color-secondary-dark);">Revenue-Generating Actions</label>
                    <p class="form-helper mb-2">${prompts.revenueHelper}</p>
                    <textarea class="form-textarea" id="plan-revenue" style="min-height: 80px;" required>${rev}</textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem; color: var(--color-accent-dark);">Visibility & Marketing</label>
                    <p class="form-helper mb-2">${prompts.visibilityHelper}</p>
                    <textarea class="form-textarea" id="plan-visibility" style="min-height: 80px;" required>${vis}</textarea>
                </div>

                <div class="form-group mt-6">
                    <label class="form-label" style="font-size: 1.1rem;">Follow-ups & Conversations</label>
                    <p class="form-helper mb-2">${prompts.followupHelper}</p>
                    <textarea class="form-textarea" id="plan-followup" style="min-height: 80px;" required>${fol}</textarea>
                </div>

                <div class="flex justify-end mt-8">
                    <button type="submit" class="btn btn-primary">${activePlan ? 'Update Weekly Plan' : 'Save Weekly Plan'}</button>
                </div>
            </form>
        </div>
    `;
}

function plannerAttachEvents() {
    // Nav
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-planner')?.classList.add('active');

    // Handle 'Apply' buttons for AI Suggestions
    document.querySelectorAll('.apply-suggestion-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.getAttribute('data-type');
            const actionText = e.target.getAttribute('data-action');

            let targetId = '';
            if (type.includes('revenue')) targetId = 'plan-revenue';
            else if (type.includes('visibility')) targetId = 'plan-visibility';
            else if (type.includes('follow')) targetId = 'plan-followup';
            else {
                // Find the next empty action box (pa-1, pa-2, pa-3) OR one that just has the default 90-day priority text
                const actionBoxes = ['pa-1', 'pa-2', 'pa-3'];
                const store = getStore();
                const defaultPriorities = store.goals?.priorities || [];
                
                for (let i = 0; i < actionBoxes.length; i++) {
                    const id = actionBoxes[i];
                    const el = document.getElementById(id);
                    if (el) {
                        const val = el.value.trim();
                        // Overwrite if it's empty OR if it matches the generic 90-day placeholder
                        if (val === '' || val === (defaultPriorities[i] || '').trim()) {
                            targetId = id;
                            break;
                        }
                    }
                }
                
                if (!targetId) {
                    alert("Your Top 3 Priority slots are all full with custom tasks! Please clear one of the boxes to apply an AI Action suggestion.");
                    return;
                }
            }

            if (targetId) {
                const el = document.getElementById(targetId);
                if (el) {
                    if (targetId.startsWith('pa-')) {
                        // For inputs, just overwrite (since appending a newline breaks input fields)
                        el.value = actionText;
                    } else if (el.value.trim() !== '') {
                        // For textareas (Revenue, Visibility, Follow-up), append
                        el.value += '\n' + actionText;
                    } else {
                        el.value = actionText;
                    }
                    // Visual feedback
                    e.target.textContent = 'Applied ✓';
                    e.target.style.backgroundColor = 'var(--color-primary-light)';
                    e.target.style.color = 'var(--color-primary-dark)';
                    e.target.style.borderColor = 'var(--color-primary-light)';
                    e.target.disabled = true;
                }
            }
        });
    });

    const form = document.getElementById('planner-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const p1 = document.getElementById('pa-1').value;
            const p2 = document.getElementById('pa-2').value;
            const p3 = document.getElementById('pa-3').value;

            const plan = {
                winCondition: document.getElementById('plan-win').value,
                topActions: [p1, p2, p3],
                revenueAction: document.getElementById('plan-revenue').value,
                visibilityAction: document.getElementById('plan-visibility').value,
                followUps: document.getElementById('plan-followup').value,
            };

            const planId = form.getAttribute('data-plan-id');
            if (planId) {
                updateWeeklyPlan(planId, plan);
                alert("Weekly plan updated!");
            } else {
                addWeeklyPlan(plan);
                alert("Weekly plan saved! Have a great week, CEO.");
            }

            // Show success and redirect
            window.location.hash = '#/dashboard';
        });
    }
}

function getSuggestedFocus(mode) {
    if (!mode) return "What is the ONE thing that moves the needle this week?";

    const m = mode.toLowerCase();

    if (m.includes('first sale')) {
        return "You're in the First Sale Sprint! Your primary focus must be visibility and direct conversations. Aim to make at least 5 direct invitations to your offer this week.";
    }

    if (m.includes('launch')) {
        return "It's an Offer Launch Quarter! This week, prioritize tasks that move your launch timeline forward (e.g. warming up the audience, finalizing promo assets, or sending sales emails). Ignore distractions.";
    }

    if (m.includes('audience')) {
        return "Audience Growth is your focus. Dedicate 60% of your time to creating high-value content, driving traffic to a lead magnet, and engaging with new ideal clients.";
    }

    if (m.includes('reset')) {
        return "You are in CEO Reset mode. Your priority is to simplify your delivery, automate where possible, and document your processes so you can scale without burning out.";
    }

    return "What is the ONE thing that moves the needle this week based on your current big goal?";
}

function getSmartPrompts(mode) {
    const m = (mode || '').toLowerCase();

    if (m.includes('first sale')) {
        return {
            revenueHelper: "Your priority is direct sales. e.g., Pitching 3 people in DMs, sending a direct sales email, inviting people to a discovery call.",
            visibilityHelper: "Keep this simple. It's just to support your outreach. e.g., 1 post sharing your story and offer.",
            followupHelper: "Critical: Follow up with anyone who showed interest in the past 30 days."
        };
    }
    if (m.includes('launch')) {
        return {
            revenueHelper: "Focus on launch mechanics. e.g., Finalizing the sales page, writing the launch email sequence, opening the cart.",
            visibilityHelper: "Warm up your audience. e.g., Teasing the launch, sharing behind-the-scenes, hosting a free masterclass.",
            followupHelper: "Follow up with waitlist members or highly engaged leads."
        };
    }
    if (m.includes('audience')) {
        return {
            revenueHelper: "Secondary focus this quarter. e.g., Mention your evergreen offer at the end of content.",
            visibilityHelper: "MAJOR FOCUS: How are you driving new traffic? e.g., Collaborations, Pinterest pins, SEO blogs, daily short-form video.",
            followupHelper: "Engage with new followers, reply to all comments."
        };
    }
    if (m.includes('reset')) {
        return {
            revenueHelper: "Keep the baseline running. e.g., Automated sales sequences or passive income streams.",
            visibilityHelper: "Maintain consistency without burning out. e.g., Repurposing old content.",
            followupHelper: "Clear out your inbox and delegate customer service if possible."
        };
    }

    return {
        revenueHelper: "How will you actively generate sales or leads this week? (e.g., DM outreach, sending a promo email, hosting a webinar)",
        visibilityHelper: "How will you show up visibly? (e.g., 3 IG Posts, 1 YouTube video)",
        followupHelper: "Who do you need to reply to or follow up with to close loops?"
    };
}

function generatePlanSuggestions(store) {
    const goals = store.goals || {};
    const priorities = goals.priorities || ['', '', ''];
    const focus90 = goals.focus || '';
    const milestones = goals.milestones || {};
    const mode = (store.profile?.strategyMode || '').toLowerCase();
    const reviews = store.reviews || [];
    const revInsights = typeof getRevenueInsights === 'function' ? getRevenueInsights() : {};

    // Determine current month milestone
    const quarterStartMonth = Math.floor(new Date().getMonth() / 3) * 3;
    const currentMonthInQuarter = new Date().getMonth() - quarterStartMonth + 1;
    const currentMilestone = milestones[`month${currentMonthInQuarter}`] || '';

    // Combine all user goals into searchable text
    const allGoalText = [focus90, currentMilestone, ...priorities].join(' ').toLowerCase();

    let suggestions = [];

    // === KEYWORD-TO-ACTION MAP ===
    // Each entry maps goal keywords to concrete tactical actions
    const actionMap = [
        {
            keywords: ['testimonial', 'testimonials', 'review', 'reviews', 'case study', 'case studies', 'social proof'],
            actions: [
                { type: 'Action', action: 'Draft a short testimonial request email — ask one clear question like "What result did you get from working together?"' },
                { type: 'Action', action: 'Reach out personally to 3 past clients and ask for a quick written or video testimonial.' },
                { type: 'Action', action: 'Create a simple Google Form for collecting testimonials and share the link with your most engaged clients.' },
            ]
        },
        {
            keywords: ['launch', 'beta', 'pre-sale', 'presale', 'pre-launch', 'prelaunch', 'cart open', 'waitlist'],
            actions: [
                { type: 'Action', action: 'Write 3 emails for your launch sequence: a teaser, a value email, and the cart-open announcement.' },
                { type: 'Action', action: 'Create or refine your landing page or sign-up form to capture early interest and build your waitlist.' },
                { type: 'Action', action: 'Plan your launch timeline: set specific dates for teaser content, cart open, and cart close.' },
                { type: 'Action', action: 'Post 2 behind-the-scenes pieces of content this week to warm up your audience before the launch.' },
            ]
        },
        {
            keywords: ['course', 'program', 'curriculum', 'module', 'lesson', 'training', 'workshop content'],
            actions: [
                { type: 'Action', action: 'Outline the next module or lesson — write the key learning outcome and 3-5 teaching points.' },
                { type: 'Action', action: 'Record or write one lesson this week. Done is better than perfect — aim for 80% good enough.' },
                { type: 'Action', action: 'Create one worksheet, template, or resource that students can use immediately after the lesson.' },
            ]
        },
        {
            keywords: ['sales page', 'landing page', 'checkout', 'sales copy', 'conversion page', 'funnel'],
            actions: [
                { type: 'Action', action: 'Write the headline and first 3 sections of your sales page — focus on the transformation, not features.' },
                { type: 'Action', action: 'Add 2-3 testimonials or proof points to your sales page. If you don\'t have them yet, collect them this week.' },
                { type: 'Action', action: 'Test your full checkout flow end-to-end: payment, confirmation email, and delivery. Fix anything broken.' },
            ]
        },
        {
            keywords: ['email', 'newsletter', 'sequence', 'nurture', 'autoresponder', 'welcome sequence'],
            actions: [
                { type: 'Action', action: 'Write and schedule 2 value-packed emails this week — teach something useful and include one clear call-to-action.' },
                { type: 'Action', action: 'Review your welcome sequence: does it introduce you, deliver value, and make an offer within the first 5 emails?' },
                { type: 'Action', action: 'Segment your email list by engagement. Send a re-engagement email to inactive subscribers.' },
            ]
        },
        {
            keywords: ['content', 'post', 'reel', 'video', 'tiktok', 'instagram', 'youtube', 'blog', 'podcast', 'social media'],
            actions: [
                { type: 'Action', action: 'Batch-create 3 pieces of content: 1 educational, 1 story-driven, 1 with a direct call-to-action.' },
                { type: 'Action', action: 'Repurpose your best-performing past content into a new format (e.g., turn a post into a reel or email).' },
                { type: 'Action', action: 'Engage intentionally: spend 20 minutes daily replying to comments and DMs to build trust with your audience.' },
            ]
        },
        {
            keywords: ['lead', 'leads', 'subscriber', 'subscribers', 'lead magnet', 'freebie', 'opt-in', 'list building', 'grow list', 'grow audience'],
            actions: [
                { type: 'Action', action: 'Create or refine a lead magnet that solves one specific problem for your ideal client.' },
                { type: 'Action', action: 'Publish 2 posts this week that directly promote your lead magnet with a clear call-to-action.' },
                { type: 'Action', action: 'Set up or optimize a simple landing page for your lead magnet — test the sign-up flow yourself.' },
            ]
        },
        {
            keywords: ['webinar', 'masterclass', 'live', 'challenge', 'event', 'speaking'],
            actions: [
                { type: 'Action', action: 'Plan and schedule your live event: set the date, create a registration page, and write the promo post.' },
                { type: 'Action', action: 'Outline your talk: what is the ONE takeaway? Structure it as problem → insight → action → offer.' },
                { type: 'Action', action: 'Promote the event daily this week — share the registration link in at least 3 different places.' },
            ]
        },
        {
            keywords: ['client', 'clients', 'onboard', 'onboarding', 'deliver', 'delivery', 'fulfillment', 'serve'],
            actions: [
                { type: 'Action', action: 'Create or improve your client onboarding flow: welcome email, intake form, and first-session prep.' },
                { type: 'Action', action: 'Check in with each active client this week — ask what\'s working and where they need support.' },
                { type: 'Action', action: 'Document one repeatable process from your delivery so you can eventually delegate or automate it.' },
            ]
        },
        {
            keywords: ['outreach', 'pitch', 'collab', 'collaboration', 'partnership', 'guest', 'networking'],
            actions: [
                { type: 'Action', action: 'Identify 5 people in complementary niches and send a personalized collaboration or guest pitch.' },
                { type: 'Action', action: 'Draft a simple pitch template that highlights the mutual value of working together.' },
                { type: 'Action', action: 'Follow up with anyone who responded to previous outreach — persistence closes partnerships.' },
            ]
        },
        {
            keywords: ['hire', 'va', 'delegate', 'team', 'outsource', 'automate', 'system', 'systems', 'process'],
            actions: [
                { type: 'Action', action: 'List all tasks you did last week that someone else could do. Pick 1 to delegate this week.' },
                { type: 'Action', action: 'Write a simple SOP (step-by-step guide) for your most repetitive task so it can be handed off.' },
                { type: 'Action', action: 'Research one automation tool (Zapier, Calendly, email scheduler) that could save you 2+ hours/week.' },
            ]
        },
        {
            keywords: ['sales', 'sell', 'selling', 'close', 'closing', 'revenue', 'income', 'money', 'offer'],
            actions: [
                { type: 'Action', action: 'Reach out to 5 warm leads this week with a personalized message — people who already know your work.' },
                { type: 'Action', action: 'Create 1 piece of content that addresses the #1 objection your ideal customer has about buying.' },
                { type: 'Action', action: 'Book 2 discovery or sales calls this week. Listen to their problem before pitching your solution.' },
            ]
        },
        {
            keywords: ['brand', 'branding', 'positioning', 'niche', 'ideal client', 'messaging'],
            actions: [
                { type: 'Action', action: 'Write a clear one-liner: "I help [who] achieve [result] through [method]." Test it on 3 people for clarity.' },
                { type: 'Action', action: 'Audit your social profiles: does your bio clearly communicate who you help and how? Update if needed.' },
                { type: 'Action', action: 'Create 1 piece of content this week that speaks directly to your ideal client\'s biggest frustration.' },
            ]
        }
    ];

    // Match user goals against keyword map
    let matchedActions = [];

    actionMap.forEach(mapping => {
        const matched = mapping.keywords.some(kw => allGoalText.includes(kw));
        if (matched) {
            mapping.actions.forEach(a => matchedActions.push(a));
        }
    });

    // Pick the top 3 most important matched actions
    if (matchedActions.length > 0) {
        // Shuffle for variety, pick up to 3
        matchedActions = matchedActions.sort(() => Math.random() - 0.5);
        suggestions = matchedActions.slice(0, 3);
    }

    // If no or too few keyword matches, fall back to priority-based suggestions
    if (suggestions.length < 3) {
        const p1 = priorities[0] || focus90 || 'your main goal';
        const p2 = priorities[1] || '';
        const p3 = priorities[2] || '';

        if (suggestions.length === 0) {
            suggestions.push({
                type: 'Action',
                action: `Break "${currentMilestone || focus90 || p1}" into 3 specific tasks. What is the very first step you need to complete this week?`
            });
        }
        if (p1 && suggestions.length < 2) {
            suggestions.push({
                type: 'Action',
                action: `Dedicate a 90-minute focus block this week to make tangible progress on "${p1}".`
            });
        }
        if (p2 && suggestions.length < 3) {
            suggestions.push({
                type: 'Action',
                action: `Advance "${p2}" — what does "done" look like for this priority this week? Complete one deliverable.`
            });
        }
    }

    // === Add Revenue, Visibility, and Follow-up suggestions based on goals ===
    const p1Label = priorities[0] || focus90 || 'your goal';

    // Revenue suggestion
    if (allGoalText.match(/testimonial|review|social proof|case stud/)) {
        suggestions.push({ type: 'Revenue', action: `Turn your best testimonials into a sales asset — feature them on your sales page, in emails, or as social proof posts.` });
    } else if (allGoalText.match(/launch|beta|pre-sale|waitlist|cart/)) {
        suggestions.push({ type: 'Revenue', action: `Write and send a promotional email to your warmest leads — highlight the transformation and include a clear buy/join link.` });
    } else if (allGoalText.match(/course|program|training/)) {
        suggestions.push({ type: 'Revenue', action: `Offer an early-bird or founding-member price to your existing audience to generate first sales and validate demand.` });
    } else if (allGoalText.match(/sales|sell|close|revenue|income|offer/)) {
        suggestions.push({ type: 'Revenue', action: `Reach out to 5 warm leads with a personalized message — ask about their biggest challenge and offer a solution call.` });
    } else {
        suggestions.push({ type: 'Revenue', action: `What is ONE thing you can do this week that directly generates income or moves a prospect closer to buying? Schedule it now.` });
    }

    // Visibility suggestion
    if (allGoalText.match(/launch|beta|pre-launch|waitlist/)) {
        suggestions.push({ type: 'Visibility', action: `Post 2 behind-the-scenes pieces showing your launch prep — build anticipation and let your audience feel part of the journey.` });
    } else if (allGoalText.match(/content|post|reel|video|blog|podcast|social/)) {
        suggestions.push({ type: 'Visibility', action: `Publish 1 educational post and 1 story-driven post this week. Educational builds trust, story builds connection.` });
    } else if (allGoalText.match(/lead|subscriber|list|audience|grow/)) {
        suggestions.push({ type: 'Visibility', action: `Create 2 posts that promote your lead magnet — one teaching a quick win, one sharing a client result or your own story.` });
    } else if (allGoalText.match(/brand|positioning|niche|messaging/)) {
        suggestions.push({ type: 'Visibility', action: `Share 1 piece of content that clearly communicates your unique perspective — what do you believe that others in your space don't?` });
    } else {
        suggestions.push({ type: 'Visibility', action: `Show up at least twice this week where your ideal clients spend time. Teach, share a story, or start a conversation.` });
    }

    // Follow-up suggestion
    if (allGoalText.match(/testimonial|review|case stud/)) {
        suggestions.push({ type: 'Follow-up', action: `Follow up with clients who said they'd send a testimonial but haven't yet — a gentle reminder often does the trick.` });
    } else if (allGoalText.match(/launch|beta|waitlist/)) {
        suggestions.push({ type: 'Follow-up', action: `Personally DM or email 5 people who showed interest — ask if they have questions and invite them to join.` });
    } else if (allGoalText.match(/outreach|collab|partnership|pitch/)) {
        suggestions.push({ type: 'Follow-up', action: `Follow up on all pending outreach from the last 2 weeks — a polite bump email often turns silence into a yes.` });
    } else if (allGoalText.match(/client|onboard|deliver/)) {
        suggestions.push({ type: 'Follow-up', action: `Check in with each active client — ask what's working and if there's anything else they need from you.` });
    } else {
        suggestions.push({ type: 'Follow-up', action: `Review your inbox, DMs, and comments. Follow up with anyone who engaged last week — a quick personal reply can close a deal.` });
    }

    return suggestions;
}

