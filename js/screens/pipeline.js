// pipeline.js — the named lead pipeline (Pro item 2)
//
// One screen, one job: who am I talking to, where has it got to, and who needs
// me today. Everything numerical on this page that could also appear somewhere
// else — leads, calls, closes, the close rate — is READ from getFunnelInsights
// rather than worked out here. That is not a style preference: the Revenue
// screen, the AI coach and the executive report all read from that one function
// precisely because they used to each do their own maths and disagree in front
// of the user. A pipeline screen with a fourth opinion would undo that.
//
// getPipelineInsights supplies the board's own shape (columns, follow-ups, who
// has gone quiet) and deliberately computes no rates at all.
import { renderNav } from '../components/nav.js';
// One line, not wrapped. build_bundle.ps1 strips imports with a single-line
// regex, so a multi-line import survives into the bundle and breaks it at parse
// time — the same trap CLAUDE.md documents for multi-line exports.
import { getStore, getFunnelInsights, getPipelineInsights, addContact, updateContact, deleteContact, PIPELINE_STAGES, PIPELINE_COLD_DAYS, PIPELINE_PROBABILITIES, CONTACT_SOURCES, formatAmount } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';
import { showToast, showConfirm, rerenderScreen } from '../components/toast.js';
import { canUseLeadPipeline, proCardHeading, PRO_CARD_HEADING_STYLE } from '../components/proGate.js';

// Which card is open for editing, at module level so a re-render keeps it open —
// the same reason activeLogTab lives at module level in revenue.js.
let editingId = null;

// Contact names, sources and notes are free text the user typed, and they land
// in value="" attributes and in card bodies. Deliberately not called escapeHtml:
// the bundle flattens every file into one scope, fridayReview.js already has a
// global by that name, and two identical-looking definitions where the last one
// silently wins is a trap waiting for whoever edits one of them.
function escapeField(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// The stage a contact is in, as a coloured chip. Won and lost are the only two
// that get colour — they are the outcomes, and everything else is in motion.
// The value used by the offer dropdown to mean "not one of my saved offers".
// A sentinel rather than an empty string, because empty already means "no offer
// chosen" and the two need different behaviour.
const OFFER_OTHER = '__other__';

// Builds a <select> of the user's saved quick offers, plus Other.
//
// Quick offers are capped at three on the base plan (Pro item 9 lifts it), so
// anyone selling a fourth thing would be stuck with a dropdown that cannot
// describe their deal. Other reveals a text box instead of blocking them.
function offerSelectHtml(idPrefix, currentOffer) {
    const store = getStore();
    const offers = (store.revenue?.quickOffers || []).map(o => o.name).filter(Boolean);
    const isSaved = currentOffer && offers.includes(currentOffer);
    const showOther = currentOffer && !isSaved;

    return `
        <select class="form-control" id="${idPrefix}-select" data-offer-select>
            <option value=""${!currentOffer ? ' selected' : ''}>No offer yet</option>
            ${offers.map(name => `<option value="${escapeField(name)}"${name === currentOffer ? ' selected' : ''}>${escapeField(name)}</option>`).join('')}
            <option value="${OFFER_OTHER}"${showOther ? ' selected' : ''}>Other…</option>
        </select>
        <input type="text" class="form-control mt-2" id="${idPrefix}-other" data-offer-other
               placeholder="Name the offer" value="${showOther ? escapeField(currentOffer) : ''}"
               style="display: ${showOther ? 'block' : 'none'};">
    `;
}

// Reads whichever of the two offer controls is actually in play.
function readOfferValue(scope, idPrefix) {
    const select = scope.querySelector(`#${idPrefix}-select`);
    if (!select) return '';
    if (select.value !== OFFER_OTHER) return select.value;
    const other = scope.querySelector(`#${idPrefix}-other`);
    return other ? other.value.trim() : '';
}

// Shows and hides the "Other" text box. Delegated in attachEvents so both the
// add form and any open edit form get it without separate wiring.
function bindOfferSelects(root) {
    root.querySelectorAll('[data-offer-select]').forEach(select => {
        select.addEventListener('change', () => {
            const other = select.parentElement.querySelector('[data-offer-other]');
            if (!other) return;
            const wantsOther = select.value === OFFER_OTHER;
            other.style.display = wantsOther ? 'block' : 'none';
            if (wantsOther) other.focus();
        });
    });
}

// One field in the add form: a label row that always sits on its own line, an
// info circle explaining what the field is for, then the control underneath.
//
// This exists because the fields used to be bare <label> + .form-control inside
// a .form-group. A bare <label> is inline by default, and `.form-control` is not
// defined anywhere in the CSS — it is a class the codebase uses but never
// styles. So each label only wrapped above its input when the input happened to
// be wide enough to push it there, and a narrow <select> sat beside its label
// instead. The result was a row of fields at four different heights.
function field(id, labelText, tip, controlHtml) {
    return `
        <div class="pipeline-field">
            <div class="pipeline-field-label">
                <label for="${id}">${labelText}</label>
                ${tip}
            </div>
            ${controlHtml}
        </div>
    `;
}

const STAGE_COLOURS = {
    'lead': 'var(--color-text-muted)',
    'call-booked': 'var(--color-primary-dark)',
    'proposal': 'var(--color-accent-dark)',
    'won': 'var(--color-secondary-dark)',
    'lost': 'var(--color-text-muted)'
};

export function renderPipeline() {
    window.setScreenModule({ attachEvents: pipelineAttachEvents });

    // Base accounts have no nav link to here, but a typed URL or an old
    // bookmark still lands. Explain rather than redirect: being bounced with no
    // reason given is the worst version of a paywall.
    if (!canUseLeadPipeline()) {
        return `
            ${renderNav()}
            <div class="main-content">
                <div class="card" style="max-width: 620px; margin: 3rem auto; padding: 2rem; text-align: center;" data-locked-pipeline>
                    <p style="${PRO_CARD_HEADING_STYLE} justify-content: center;">${proCardHeading('lead-pipeline', 'A real lead pipeline')}</p>
                    <p style="color: var(--color-text-muted); line-height: 1.6; margin-bottom: 1.5rem;">
                        Named contacts instead of a running count. This one is part of Pro.
                    </p>
                    <button type="button" class="btn btn-primary" data-pro-feature="lead-pipeline">Tell me more</button>
                    <p style="margin-top: 1.5rem;"><a href="#/revenue" style="font-size: 0.875rem; color: var(--color-text-muted);">Back to Revenue</a></p>
                </div>
            </div>
        `;
    }

    const store = getStore();
    const currency = store.settings?.currency || '$';
    const pipeline = getPipelineInsights();
    const funnel = getFunnelInsights();

    // Already de-duplicated and prioritised by getPipelineInsights. Not
    // assembled here, so the count in the heading and the rows underneath can
    // never disagree.
    const needsYou = pipeline.needsYou;

    return `
        ${renderNav()}
        <!-- dashboard-layout widens main-content from 800px to 1200px. Without it
             the five stage columns need a sideways scroll on a full desktop
             window, which defeats the point of a board. -->
        <div class="main-content dashboard-layout">
            <div class="flex justify-between items-center mb-6 flex-mobile-col" style="gap: 1rem;">
                <div>
                    <h2 style="margin-bottom: 0.25rem;">Lead Pipeline</h2>
                    <p style="color: var(--color-text-muted); margin: 0;">Every conversation you have open, and who is waiting on you.</p>
                </div>
                <p style="${PRO_CARD_HEADING_STYLE} margin: 0;">${proCardHeading('lead-pipeline', 'Pipeline')}</p>
            </div>

            <div class="grid-cols-4 mb-6">
                <div class="card" style="padding: 1.5rem; text-align: center;">
                    <p style="font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase;">Open Deals</p>
                    <h3 style="font-size: 1.75rem; color: var(--color-black); margin: 0;">${pipeline.openCount}</h3>
                </div>
                <div class="card" style="padding: 1.5rem; text-align: center; border: 2px solid var(--color-primary-light);">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--color-primary-dark); font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase;">
                        Pipeline Value
                        ${renderTooltip(
                            "What your open conversations are worth if every one of them lands, and underneath, the same figure discounted by how likely you said each one is.",
                            "It is deliberately kept out of your revenue figures and your quarter progress. This is money that might happen; everything on the Revenue screen is money that did.",
                            "bottom",
                            { what: 'What this answers', why: 'Why it is not in your revenue' }
                        )}
                    </p>
                    <h3 style="font-size: 1.75rem; color: var(--color-primary-dark); margin: 0;">${currency}${formatAmount(pipeline.openValue)}</h3>
                    ${pipeline.weightedCount > 0 ? `
                    <p style="font-size: 0.7rem; color: var(--color-text-muted); margin: 0.5rem 0 0 0; line-height: 1.35;">
                        ${currency}${formatAmount(pipeline.weightedValue)} allowing for how likely they are${pipeline.unweightedCount > 0 ? `, from the ${pipeline.weightedCount} you have rated` : ''}
                    </p>` : pipeline.openCount > 0 ? `
                    <p style="font-size: 0.7rem; color: var(--color-text-muted); margin: 0.5rem 0 0 0; line-height: 1.35;">
                        Set how likely each one is and you'll get a weighted figure here too.
                    </p>` : ''}
                </div>
                <div class="card" style="padding: 1.5rem; text-align: center; border: 2px solid var(--color-accent-light);">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--color-accent-dark); font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase;">
                        Expected This Quarter
                        ${renderTooltip(
                            "Of the deals you expect to close before your 90 days are up, what they are worth once discounted by how likely each one is.",
                            "It only counts open deals that have both a close date inside this quarter and a confidence set, so it is an honest floor rather than a hopeful ceiling. Like every figure on this page it stays out of your revenue and your quarter progress.",
                            "bottom",
                            { what: 'What this answers', why: 'What it does and does not include' }
                        )}
                    </p>
                    <h3 style="font-size: 1.75rem; color: var(--color-accent-dark); margin: 0;">${currency}${formatAmount(pipeline.expectedThisQuarter)}</h3>
                    ${pipeline.noCloseDateCount > 0 ? `
                    <p style="font-size: 0.7rem; color: var(--color-text-muted); margin: 0.5rem 0 0 0; line-height: 1.35;">
                        ${pipeline.noCloseDateCount} open ${pipeline.noCloseDateCount === 1 ? 'deal has' : 'deals have'} no close date, so ${pipeline.noCloseDateCount === 1 ? 'it is' : 'they are'} not in this
                    </p>` : ''}
                </div>
                <div class="card" style="padding: 1.5rem; text-align: center;">
                    <p style="display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase;">
                        Call Close Rate
                        ${renderTooltip(
                            "Of the calls you booked, how many turned into a sale.",
                            "This is the same figure shown on Revenue and the same one your AI coach reads. It counts calls and closes from this pipeline, from any leads you log in bulk, and from your monthly snapshots, so all three agree.",
                            "bottom",
                            { what: 'What this answers', why: 'Where the number comes from' }
                        )}
                    </p>
                    <h3 style="font-size: 1.75rem; color: var(--color-black); margin: 0;">${funnel.callCloseRate === null ? '&mdash;' : funnel.callCloseRate.toFixed(1) + '%'}</h3>
                </div>
            </div>

            ${needsYou.length > 0 ? `
            <div class="card mb-6" style="border-left: 4px solid var(--color-accent); padding: 1.5rem;">
                <h3 style="margin: 0 0 1rem 0;">Needs you today (${needsYou.length})</h3>
                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                    ${needsYou.map(c => `
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border);">
                            <div>
                                <span style="font-weight: 600; color: var(--color-black);">${escapeField(c.name)}</span>
                                <span style="font-size: 0.8rem; color: var(--color-text-muted); display: block;">
                                    ${stageLabel(c.stage)}${c.source ? ' • ' + escapeField(c.source) : ''}
                                </span>
                                ${c.nextSteps ? `
                                <span style="font-size: 0.8rem; color: var(--color-text-main); display: block; margin-top: 0.2rem;">
                                    Next: ${escapeField(c.nextSteps)}
                                </span>` : ''}
                            </div>
                            <span style="font-size: 0.8rem; font-weight: 600; color: ${c.followUpDue ? 'var(--color-accent-dark)' : '#B54708'};">
                                ${c.followUpDue
                                    ? 'Follow up due ' + escapeField(c.followUpDate)
                                    : c.closeOverdue
                                        ? 'Was due to close ' + escapeField(c.closeDate)
                                        : 'Quiet for ' + c.daysSinceMove + ' days'}
                            </span>
                        </div>
                    `).join('')}
                </div>
                <p style="font-size: 0.8rem; color: var(--color-text-muted); margin: 1rem 0 0 0;">
                    Three things land here: a follow-up date that has arrived, a close date that has passed, and anything still open and untouched for ${PIPELINE_COLD_DAYS} days.
                </p>
            </div>
            ` : ''}

            <div class="card mb-6" style="padding: 1.5rem;">
                <h3 style="margin: 0 0 0.25rem 0;">Add a contact</h3>
                <p style="font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 1.25rem 0;">
                    Only the name is required. Everything else can be filled in later, and each circle explains what the field is for.
                </p>
                <form id="add-contact-form">
                    <div class="pipeline-form-grid">
                        ${field('contact-name', 'Name', renderTooltip(
                            "The person you are talking to, however you would say their name out loud.",
                            "It is the only field you have to fill in. A pipeline with one name in it is already more useful than a number.",
                            'bottom', { what: 'What goes here', why: 'Good to know' }
                        ), `<input type="text" id="contact-name" class="form-control" required placeholder="e.g. Sarah Miles">`)}

                        ${field('contact-source', 'Source', renderTooltip(
                            "Where this person came from, whether that was a post, a referral or an email.",
                            "It is the same list the Revenue page uses, so Which Channel Earns can tell you which of your channels actually turns into money.",
                            'bottom', { what: 'What goes here', why: 'What it feeds' }
                        ), `
                            <select id="contact-source" class="form-control">
                                <option value="">Not sure yet</option>
                                ${CONTACT_SOURCES.map(s => `<option value="${s}">${s}</option>`).join('')}
                            </select>`)}

                        ${field('contact-offer-select', 'Offer', renderTooltip(
                            "Which of your offers this conversation is about.",
                            "Built from your Quick Offers so it matches what you log on the Revenue page. Choose Other if it is something not on that list yet.",
                            'bottom', { what: 'What goes here', why: 'Where the list comes from' }
                        ), offerSelectHtml('contact-offer', ''))}

                        ${field('contact-value', `Value (${currency})`, renderTooltip(
                            "What this deal is worth to you if it lands.",
                            "It feeds your pipeline value and your forecast, and it deliberately stays out of your revenue figures until the money has actually arrived.",
                            'bottom', { what: 'What goes here', why: 'What it feeds' }
                        ), `<input type="number" id="contact-value" class="form-control" min="0" step="any" placeholder="0.00">`)}

                        ${field('contact-probability', 'How likely', renderTooltip(
                            "Your honest gut feel on whether this one closes: low, medium or high.",
                            "It is what discounts your forecast. Leave it blank and the deal is simply left out of the weighted figure rather than being guessed at.",
                            'bottom', { what: 'What goes here', why: 'Why blank is fine' }
                        ), `
                            <select id="contact-probability" class="form-control">
                                <option value="">Not sure yet</option>
                                ${PIPELINE_PROBABILITIES.map(p => `<option value="${p.key}">${p.label}</option>`).join('')}
                            </select>`)}

                        ${field('contact-stage', 'Stage', renderTooltip(
                            "How far along the conversation has got.",
                            "Moving someone to Call booked counts a call in your funnel, and Won counts a close. Move them back and both undo, so a mis-click is always fixable.",
                            'bottom', { what: 'What goes here', why: 'What it changes' }
                        ), `
                            <select id="contact-stage" class="form-control">
                                ${PIPELINE_STAGES.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}
                            </select>`)}

                        ${field('contact-close', 'Close date', renderTooltip(
                            "When you expect this one to actually land.",
                            "Different from a follow-up date. This is what Expected This Quarter is built from, and if the date passes while the deal is still open it appears in Needs You Today.",
                            'bottom', { what: 'What goes here', why: 'How it differs from follow-up' }
                        ), `<input type="date" id="contact-close" class="form-control">`)}

                        ${field('contact-followup', 'Follow up', renderTooltip(
                            "The day you want to be reminded to chase this one.",
                            "It appears in Needs You Today the moment that date arrives, and anything left untouched for two weeks shows up there anyway.",
                            'bottom', { what: 'What goes here', why: 'What it triggers' }
                        ), `<input type="date" id="contact-followup" class="form-control">`)}

                        ${field('contact-next', 'Next step', renderTooltip(
                            "The one thing you will actually do next. Send the payment plan, not follow up.",
                            "It shows on the card and beside the reminder, so when the day comes you do not have to remember what you meant.",
                            'bottom', { what: 'What goes here', why: 'Why it is worth writing' }
                        ), `<input type="text" id="contact-next" class="form-control" placeholder="e.g. Send the payment plan">`)}
                    </div>
                    <button type="submit" class="btn btn-primary mt-4" style="width: 100%;">Add to pipeline</button>
                </form>
            </div>

            ${pipeline.total === 0 ? `
                <div class="card" style="padding: 3rem 2rem; text-align: center;">
                    <p style="font-size: 1.05rem; color: var(--color-text-main); margin: 0 0 0.5rem 0;">Nothing in the pipeline yet.</p>
                    <p style="color: var(--color-text-muted); margin: 0;">
                        Add the person you spoke to most recently. One name is enough to make this useful.
                    </p>
                </div>
            ` : `
                <div class="pipeline-board">
                    ${PIPELINE_STAGES.map(stage => renderColumn(stage, pipeline.byStage[stage.key], currency)).join('')}
                </div>
                <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 1rem;">
                    These contacts add ${funnel.contactLeads} ${funnel.contactLeads === 1 ? 'lead' : 'leads'},
                    ${funnel.contactCalls} ${funnel.contactCalls === 1 ? 'call' : 'calls'} and
                    ${funnel.contactCloses} ${funnel.contactCloses === 1 ? 'close' : 'closes'} to the funnel on your Revenue screen,
                    on top of anything you log there in bulk.
                </p>
            `}
        </div>
    `;
}

function stageLabel(key) {
    const stage = PIPELINE_STAGES.find(s => s.key === key);
    return stage ? stage.label : key;
}

function renderColumn(stage, contacts, currency) {
    const list = contacts || [];
    const value = list.reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);

    return `
        <div class="pipeline-column">
            <div class="pipeline-column-head">
                <span class="pipeline-column-title" style="color: ${STAGE_COLOURS[stage.key]};">${stage.label}</span>
                <span class="pipeline-column-count">${list.length}</span>
            </div>
            <p class="pipeline-column-hint">${stage.hint}</p>
            ${value > 0 ? `<p class="pipeline-column-value">${currency}${formatAmount(value)}</p>` : ''}
            <div class="pipeline-column-body">
                ${list.length === 0
                    ? `<p class="pipeline-column-empty">Empty</p>`
                    : list.map(c => renderCard(c, currency)).join('')}
            </div>
        </div>
    `;
}

function renderCard(contact, currency) {
    if (String(editingId) === String(contact.id)) return renderEditCard(contact, currency);

    const meta = [contact.source, contact.offer].filter(Boolean).map(escapeField).join(' • ');
    const prob = PIPELINE_PROBABILITIES.find(p => p.key === contact.probability);

    return `
        <div class="pipeline-card" data-id="${contact.id}">
            <div class="pipeline-card-top">
                <span class="pipeline-card-name">${escapeField(contact.name)}</span>
                ${contact.value > 0 ? `<span class="pipeline-card-value">${currency}${formatAmount(contact.value)}</span>` : ''}
            </div>
            ${meta ? `<p class="pipeline-card-meta">${meta}</p>` : ''}
            ${prob ? `<span class="pipeline-card-prob pipeline-card-prob-${prob.key}">${prob.label} chance</span>` : ''}
            ${contact.closeDate && contact.isOpen && !contact.closeOverdue
                ? `<p class="pipeline-card-flag">Closing ${escapeField(contact.closeDate)}</p>`
                : ''}
            ${contact.followUpDue
                ? `<p class="pipeline-card-flag pipeline-card-flag-due">Follow up due ${escapeField(contact.followUpDate)}</p>`
                : contact.closeOverdue
                    ? `<p class="pipeline-card-flag pipeline-card-flag-cold">Was due to close ${escapeField(contact.closeDate)}</p>`
                    : contact.isCold
                        ? `<p class="pipeline-card-flag pipeline-card-flag-cold">Quiet for ${contact.daysSinceMove} days</p>`
                        : contact.followUpDate && contact.isOpen
                            ? `<p class="pipeline-card-flag">Follow up ${escapeField(contact.followUpDate)}</p>`
                            : ''}
            ${contact.nextSteps ? `<p class="pipeline-card-next">Next: ${escapeField(contact.nextSteps)}</p>` : ''}
            <select class="form-control pipeline-card-stage" data-stage-for="${contact.id}" aria-label="Stage for ${escapeField(contact.name)}">
                ${PIPELINE_STAGES.map(s => `<option value="${s.key}"${s.key === contact.stage ? ' selected' : ''}>${s.label}</option>`).join('')}
            </select>
            <div class="pipeline-card-actions">
                <button type="button" class="btn btn-ghost btn-sm btn-edit-contact" data-id="${contact.id}">Edit</button>
                <button type="button" class="btn btn-ghost btn-sm btn-delete-contact" data-id="${contact.id}" aria-label="Remove ${escapeField(contact.name)}">🗑️</button>
            </div>
        </div>
    `;
}

// The edit form replaces the card in place rather than opening a modal. A
// pipeline you cannot correct is worse than no pipeline: the first typo in a
// name, or a value entered as 47 when it was 470, has to be fixable without
// deleting the contact and losing the stage history with it.
function renderEditCard(contact, currency) {
    return `
        <div class="pipeline-card pipeline-card-editing" data-id="${contact.id}">
            <form class="pipeline-edit-form" data-edit-for="${contact.id}">
                <label class="pipeline-edit-label">Name</label>
                <input type="text" class="form-control" data-field="name" value="${escapeField(contact.name)}" required>

                <label class="pipeline-edit-label">Where they came from</label>
                <select class="form-control" data-field="source">
                    <option value=""${!contact.source ? ' selected' : ''}>Not sure yet</option>
                    ${CONTACT_SOURCES.map(s => `<option value="${s}"${s === contact.source ? ' selected' : ''}>${s}</option>`).join('')}
                    ${contact.source && !CONTACT_SOURCES.includes(contact.source)
                        // A source typed before this became a dropdown, or one
                        // that arrived from an import. Kept as its own option so
                        // opening the edit form can never silently rewrite it.
                        ? `<option value="${escapeField(contact.source)}" selected>${escapeField(contact.source)}</option>`
                        : ''}
                </select>

                <label class="pipeline-edit-label">Offer</label>
                ${offerSelectHtml('edit-offer-' + contact.id, contact.offer)}

                <label class="pipeline-edit-label">Deal value (${currency})</label>
                <input type="number" class="form-control" data-field="value" min="0" step="any" value="${contact.value || ''}">

                <label class="pipeline-edit-label">How likely</label>
                <select class="form-control" data-field="probability">
                    <option value=""${!contact.probability ? ' selected' : ''}>Not sure yet</option>
                    ${PIPELINE_PROBABILITIES.map(p => `<option value="${p.key}"${p.key === contact.probability ? ' selected' : ''}>${p.label}</option>`).join('')}
                </select>

                <label class="pipeline-edit-label">Expected to close</label>
                <input type="date" class="form-control" data-field="closeDate" value="${escapeField(contact.closeDate)}">

                <label class="pipeline-edit-label">Follow up on</label>
                <input type="date" class="form-control" data-field="followUpDate" value="${escapeField(contact.followUpDate)}">

                <label class="pipeline-edit-label">Next step</label>
                <input type="text" class="form-control" data-field="nextSteps" value="${escapeField(contact.nextSteps)}">

                <label class="pipeline-edit-label">Notes</label>
                <textarea class="form-control" data-field="notes" rows="2">${escapeField(contact.notes)}</textarea>

                <div class="pipeline-card-actions">
                    <button type="submit" class="btn btn-primary btn-sm">Save</button>
                    <button type="button" class="btn btn-ghost btn-sm btn-cancel-edit">Cancel</button>
                </div>
            </form>
        </div>
    `;
}

function pipelineAttachEvents() {
    if (!canUseLeadPipeline()) {
        // The locked view's only control is the modal trigger, and initProGate's
        // delegated listener already owns that. Nothing to bind.
        return;
    }

    // Every offer dropdown on the screen at once — the add form's, plus the one
    // in whichever card is open for editing.
    bindOfferSelects(document);

    const addForm = document.getElementById('add-contact-form');
    if (addForm) {
        addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('contact-name').value.trim();
            if (!name) {
                showToast('Give them a name first.', 'error');
                return;
            }
            addContact({
                name,
                source: document.getElementById('contact-source').value,
                offer: readOfferValue(addForm, 'contact-offer'),
                value: document.getElementById('contact-value').value,
                probability: document.getElementById('contact-probability').value,
                stage: document.getElementById('contact-stage').value,
                closeDate: document.getElementById('contact-close').value,
                followUpDate: document.getElementById('contact-followup').value,
                nextSteps: document.getElementById('contact-next').value
            });
            showToast(`${name} added to your pipeline.`);
            rerenderScreen();
        });
    }

    document.querySelectorAll('[data-stage-for]').forEach(select => {
        select.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-stage-for');
            const contact = updateContact(id, { stage: e.target.value });
            if (contact) {
                showToast(`${contact.name} moved to ${stageLabel(contact.stage)}.`);
            }
            rerenderScreen();
        });
    });

    document.querySelectorAll('.btn-edit-contact').forEach(btn => {
        btn.addEventListener('click', () => {
            editingId = btn.getAttribute('data-id');
            rerenderScreen();
        });
    });

    document.querySelectorAll('.btn-cancel-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            editingId = null;
            rerenderScreen();
        });
    });

    document.querySelectorAll('.pipeline-edit-form').forEach(form => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = form.getAttribute('data-edit-for');
            const changes = {};
            form.querySelectorAll('[data-field]').forEach(input => {
                changes[input.getAttribute('data-field')] = input.value;
            });
            // Offer is the one field with two controls behind it, so it is read
            // by name rather than swept up with the rest.
            changes.offer = readOfferValue(form, 'edit-offer-' + id);
            if (!String(changes.name || '').trim()) {
                showToast('A contact needs a name.', 'error');
                return;
            }
            updateContact(id, changes);
            editingId = null;
            showToast('Saved.');
            rerenderScreen();
        });
    });

    document.querySelectorAll('.btn-delete-contact').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const store = getStore();
            const contact = (store.contacts || []).find(c => String(c.id) === String(id));
            const ok = await showConfirm(
                `Remove ${contact ? contact.name : 'this contact'} from your pipeline? Their calls and closes stop counting towards your funnel.`,
                { title: 'Remove contact', confirmText: 'Remove', danger: true }
            );
            if (!ok) return;
            deleteContact(id);
            if (String(editingId) === String(id)) editingId = null;
            showToast('Removed.');
            rerenderScreen();
        });
    });
}
