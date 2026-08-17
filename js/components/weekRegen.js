// Rewrite one week of the roadmap — the Pro answer to "the plan needs to bend".
//
// The dashboard already has a Regenerate Plan button, and it is deliberately
// blunt: it replaces every week you have not started yet. That is the right tool
// when the quarter itself is wrong, and the wrong one when a single week stopped
// being realistic because a launch slipped or a client landed. This is that
// second tool.
//
// Two things about the flow are on purpose:
//
// 1. Nothing is written until the user has read the new week. The quarter
//    regenerator commits straight away, which is defensible when it is replacing
//    a plan the user already declared wrong. Here the user is choosing one week
//    out of twelve and has every right to say "no, the old one was better" — so
//    the model's answer is shown first and the store is only touched on Use.
// 2. Only unapplied generated weeks are offered. getRegenerableWeeks() is the
//    single place that rule lives; this file never filters weeks itself.

import { getRegenerableWeeks, replaceGeneratedWeek } from '../store.js';
import { regenerateOneWeek } from '../aiService.js';
import { showToast, rerenderScreen } from './toast.js';
import { canRegenerateWeek } from './proGate.js';

const NOTE_MAX = 300;

// `preselectId` is the id of a stored weekly plan to open on. The dashboard
// passes nothing, because from there the user has not said which week they mean;
// the roadmap passes the week whose button was pressed.
export function showWeekRegenModal(preselectId) {
    // Belt and braces. The dashboard only renders the button for accounts that
    // pass this, but the modal is exported and a future caller might not.
    if (!canRegenerateWeek()) return;

    const weeks = getRegenerableWeeks();

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-card card week-regen-card" role="dialog" aria-modal="true" aria-labelledby="week-regen-title">
            <span class="pro-badge">PRO</span>
            <h3 id="week-regen-title" class="confirm-title" style="margin-top: 0.5rem;">Redo one week</h3>
            <div class="week-regen-body"></div>
        </div>
    `;

    const body = overlay.querySelector('.week-regen-body');
    const previouslyFocused = document.activeElement;

    const close = () => {
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
    };

    // Escape closes, except while the model is working — closing mid-call would
    // leave the user with no way back to a week they are about to be charged a
    // request for.
    let working = false;
    const onKeydown = (e) => {
        if (e.key === 'Escape' && !working) close();
    };
    document.addEventListener('keydown', onKeydown);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay && !working) close();
    });

    // --- Nothing to rewrite --------------------------------------------------
    //
    // Either the quarter has not been generated yet, or every generated week has
    // already been applied. Both are ordinary states, so this explains the rule
    // rather than reading as an error.
    if (weeks.length === 0) {
        body.innerHTML = `
            <p class="confirm-message">There is no week to rewrite right now. This works on weeks of your 90-Day Plan that you haven't started yet — once you've applied a week on the Weekly Planner it stays exactly as you worked it.</p>
            <div class="confirm-actions">
                <button type="button" class="btn btn-primary week-regen-close">Got it</button>
            </div>
        `;
        body.querySelector('.week-regen-close').addEventListener('click', close);
        document.body.appendChild(overlay);
        body.querySelector('.week-regen-close').focus();
        return;
    }

    // --- Step one: which week, and what changed ------------------------------
    const options = weeks.map(w => {
        const focus = (w.winCondition || 'No focus set').slice(0, 70);
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = `Week ${w.weekNumber} — ${focus}`;
        return opt.outerHTML;
    }).join('');

    body.innerHTML = `
        <p class="confirm-message">Pick a week and I'll write it again from scratch, keeping the other eleven exactly as they are.</p>
        <label class="form-label" for="week-regen-select">Week to rewrite</label>
        <select id="week-regen-select" class="form-input">${options}</select>
        <label class="form-label" for="week-regen-note" style="margin-top: 1rem;">What changed? <span style="font-weight: 400; color: var(--color-text-muted);">(optional)</span></label>
        <textarea id="week-regen-note" class="form-input" rows="3" maxlength="${NOTE_MAX}" placeholder="A launch slipped, a client landed, I'm ill this week..."></textarea>
        <p style="font-size: 0.8rem; color: var(--color-text-muted); margin: 0.35rem 0 1.25rem 0;">Telling me why makes the new week land better than a blank rewrite.</p>
        <div class="confirm-actions">
            <button type="button" class="btn btn-ghost week-regen-cancel">Cancel</button>
            <button type="button" class="btn btn-primary week-regen-go">Rewrite this week</button>
        </div>
    `;

    const select = body.querySelector('#week-regen-select');
    const note = body.querySelector('#week-regen-note');
    const btnGo = body.querySelector('.week-regen-go');

    if (preselectId && weeks.some(w => String(w.id) === String(preselectId))) {
        select.value = String(preselectId);
    }

    body.querySelector('.week-regen-cancel').addEventListener('click', close);

    btnGo.addEventListener('click', async () => {
        const target = weeks.find(w => String(w.id) === String(select.value));
        if (!target) return;

        working = true;
        btnGo.disabled = true;
        select.disabled = true;
        note.disabled = true;
        btnGo.textContent = 'Writing week ' + target.weekNumber + '...';

        let fresh = null;
        try {
            fresh = await regenerateOneWeek(target, note.value);
        } catch (err) {
            console.error(err);
        }

        working = false;

        if (!fresh) {
            btnGo.disabled = false;
            select.disabled = false;
            note.disabled = false;
            btnGo.textContent = 'Rewrite this week';
            showToast("Couldn't rewrite that week right now. Please try again in a moment.", 'error');
            return;
        }

        renderPreview(target, fresh);
    });

    // --- Step two: read it, then decide --------------------------------------
    function renderPreview(target, fresh) {
        body.innerHTML = `
            <p class="confirm-message week-regen-summary"></p>
            <div class="week-regen-preview">
                <p class="week-regen-focus"></p>
                <p class="week-regen-label">Top 3</p>
                <ul class="week-regen-list"></ul>
                <p class="week-regen-label">The triplet</p>
                <div class="week-regen-triplet"></div>
            </div>
            <div class="confirm-actions">
                <button type="button" class="btn btn-ghost week-regen-discard">Keep the old one</button>
                <button type="button" class="btn btn-primary week-regen-use">Use this week</button>
            </div>
        `;

        // Everything below is model output going onto the page, so it is set as
        // text rather than as HTML.
        body.querySelector('.week-regen-summary').textContent =
            fresh.whatChanged || `Here is week ${target.weekNumber} rewritten. Nothing is saved until you say so.`;
        body.querySelector('.week-regen-focus').textContent = fresh.weeklyFocus;

        const list = body.querySelector('.week-regen-list');
        (fresh.topPriorities || []).forEach(p => {
            const li = document.createElement('li');
            li.textContent = p;
            list.appendChild(li);
        });

        const triplet = body.querySelector('.week-regen-triplet');
        [
            ['Visibility', fresh.visibilityAction],
            ['Revenue', fresh.revenueAction],
            ['Follow-up', fresh.followUpAction]
        ].forEach(([label, value]) => {
            if (!value) return;
            const row = document.createElement('div');
            const strong = document.createElement('strong');
            strong.textContent = label + ': ';
            row.appendChild(strong);
            row.appendChild(document.createTextNode(value));
            triplet.appendChild(row);
        });

        body.querySelector('.week-regen-discard').addEventListener('click', () => {
            close();
            showToast(`Week ${target.weekNumber} left as it was`);
        });

        body.querySelector('.week-regen-use').addEventListener('click', () => {
            const saved = replaceGeneratedWeek(target.id, fresh);
            close();
            if (saved) {
                showToast(`Week ${target.weekNumber} rewritten`);
                rerenderScreen();
            } else {
                // The only way here is the week having been applied in another
                // tab while this modal was open. Saying so is better than a
                // success message over a week that did not change.
                showToast(`Week ${target.weekNumber} has been started since you opened this, so it was left alone.`, 'error');
            }
        });

        body.querySelector('.week-regen-use').focus();
    }

    document.body.appendChild(overlay);
    select.focus();
}
