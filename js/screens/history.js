// history.js — quarter-over-quarter and the year view (Pro item 3)
//
// The one screen in the app that looks further back than ninety days. Every
// figure on it comes from getQuarterHistory() in store.js, which reads the
// live quarter from getRevenueInsights / getFunnelInsights and counts the
// archived ones with the same rules. Nothing here does arithmetic on the
// store: a history screen with its own maths would eventually tell the user
// that a quarter she is still living in earned two different amounts.
//
// One line, not wrapped — build_bundle.ps1 strips imports with a single-line
// regex, so a multi-line import survives into the bundle and breaks it.
import { renderNav } from '../components/nav.js';
import { getStore, getQuarterHistory, formatAmount } from '../store.js';
import { renderTooltip } from '../components/tooltip.js';
import { canUseHistory, proCardHeading, PRO_CARD_HEADING_STYLE } from '../components/proGate.js';

// Goals, reflections and channel names are free text the user typed and all of
// it lands in card bodies here. Deliberately not called escapeHtml or
// escapeField: the bundle flattens every file into one scope and both of those
// names are already taken elsewhere, so a third definition would silently win
// or silently lose depending on file order.
function escapeHistoryText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// The app's success green, the one the "what worked really well" label and the
// success toast already use. Deliberately not --color-secondary-dark, which is
// the gold used for the Won stage: at this size on a white card it reads as a
// warning rather than as good news, and these are the numbers on the page most
// likely to be read at a glance.
const UP_COLOUR = '#027A48';
const DOWN_COLOUR = '#B42318';

// A movement, as a small coloured chip. `change` is the object store.js built,
// so the arrow the table shows and the arrow any future card shows come from
// the same comparison.
//
// A null percent prints as no percentage at all rather than as 100%. Going from
// nothing to two thousand is not a hundred per cent rise; there was no baseline
// to rise from, and inventing one is the kind of number a user quotes back to
// herself later.
function changeChip(change, prefix = '') {
    if (!change) return `<span class="history-change history-change-none">First quarter</span>`;
    if (change.direction === 'level') return `<span class="history-change history-change-none">No change</span>`;

    const up = change.direction === 'up';
    const arrow = up ? '▲' : '▼';
    const size = Math.abs(change.delta);
    const amount = prefix ? `${prefix}${formatAmount(size)}` : formatAmount(Math.round(size));
    const percent = change.percent === null ? '' : ` (${Math.abs(Math.round(change.percent))}%)`;

    return `<span class="history-change" style="color: ${up ? UP_COLOUR : DOWN_COLOUR};">${arrow} ${amount}${percent}</span>`;
}

function percentText(value) {
    return value === null || value === undefined ? '—' : `${Math.round(value)}%`;
}

// The headline: this quarter against the last one at the same point in its life.
//
// Comparing a quarter five weeks in against ninety finished days is the one
// thing this screen could easily get wrong, and it would get it wrong in the
// most discouraging direction possible — telling someone doing fine that she is
// sixty per cent down. So the comparison is against where the previous quarter
// stood on its own day 35, and the finished total is given separately as the
// thing still to beat.
function renderSamePoint(history, currency) {
    const sp = history.samePoint;
    if (!sp) return '';

    const weeks = sp.weeksElapsed;
    const weekText = weeks === 1 ? 'One week in' : `${weeks} weeks in`;
    const ahead = sp.delta > 0;
    const level = sp.delta === 0;

    const verdict = level
        ? `exactly where you were at this point in ${escapeHistoryText(sp.previousLabel)}`
        : `${currency}${formatAmount(Math.abs(sp.delta))} ${ahead ? 'ahead of' : 'behind'} where you were at this point in ${escapeHistoryText(sp.previousLabel)}`;

    return `
        <div class="card mb-6" style="border-top: 4px solid var(--color-primary);">
            <p style="${PRO_CARD_HEADING_STYLE}">${proCardHeading('history', 'This quarter against the last one')}</p>
            <p style="font-size: 1.05rem; line-height: 1.6; color: var(--color-black); margin: 0 0 0.75rem 0;">
                ${weekText}, you are on <strong>${currency}${formatAmount(sp.currentRevenue)}</strong> —
                <strong style="color: ${level ? 'var(--color-text-muted)' : (ahead ? UP_COLOUR : DOWN_COLOUR)};">${verdict}</strong>.
            </p>
            <p style="font-size: 0.9rem; color: var(--color-text-muted); margin: 0; line-height: 1.5;">
                ${escapeHistoryText(sp.previousLabel)} had ${currency}${formatAmount(sp.previousRevenue)} on the board by this day and
                finished on ${currency}${formatAmount(sp.previousFinal)}. That last figure is the one to beat.
            </p>
        </div>
    `;
}

// The comparison table. Scrolls inside its own wrapper rather than pushing the
// page sideways — the same rule the pipeline board follows.
function renderQuarterTable(history, currency) {
    const rows = history.quarters.map(q => {
        // ⚠️ The quarter in progress does NOT get compared against the previous
        // quarter's finished total. Six weeks of trading against ninety days of
        // it prints a red "down 55%" at someone who is in fact ahead, which is
        // the one thing this screen must never do. It gets the same-point
        // comparison the headline card uses, labelled as such, or nothing.
        const changeCell = !q.isCurrent
            ? changeChip(q.change ? q.change.revenue : null, currency)
            : (history.samePoint
                ? `${changeChip(history.samePoint, currency)}<span class="history-row-dates">at this point in ${escapeHistoryText(history.samePoint.previousLabel)}</span>`
                : `<span class="history-change history-change-none">In progress</span>`);

        return `
        <tr${q.isCurrent ? ' class="history-row-current"' : ''}>
            <td>
                <strong>${escapeHistoryText(q.label)}</strong>
                ${q.isCurrent ? '<span class="history-live-tag">in progress</span>' : ''}
                <span class="history-row-dates">${escapeHistoryText(q.rangeLabel)}</span>
            </td>
            <td class="history-num"><strong>${currency}${formatAmount(q.revenue)}</strong></td>
            <td class="history-num">${q.goal > 0 ? `${currency}${formatAmount(q.goal)}` : '—'}</td>
            <td class="history-num">${percentText(q.progressPercent)}</td>
            <td class="history-num">${changeCell}</td>
            <td class="history-num">${formatAmount(q.leads)}</td>
            <td class="history-num">${formatAmount(q.calls)}</td>
            <td class="history-num">${formatAmount(q.closes)}</td>
            <td class="history-num">${percentText(q.callCloseRate)}</td>
        </tr>
    `;
    }).join('');

    return `
        <div class="card mb-6">
            <div class="flex items-center gap-2 mb-4">
                <h3 style="margin: 0; display: flex; align-items: center;">
                    Quarter by quarter
                    ${renderTooltip(
                        "Every 90-day quarter you have finished, newest first, with the one you are in at the top.",
                        "Revenue counts sales dated inside each quarter, so anything you back-entered from before a quarter opened is left out of that quarter's total. A finished quarter is compared with the one before it; the quarter you are in is compared with where the last one stood on the same day, because it has not had ninety days yet.",
                        "bottom",
                        { what: 'What this shows', why: 'What counts in each row' }
                    )}
                </h3>
            </div>
            <div class="history-table-wrap">
                <table class="history-table">
                    <thead>
                        <tr>
                            <th>Quarter</th>
                            <th class="history-num">Revenue</th>
                            <th class="history-num">Goal</th>
                            <th class="history-num">Of goal</th>
                            <th class="history-num">vs previous</th>
                            <th class="history-num">Leads</th>
                            <th class="history-num">Calls</th>
                            <th class="history-num">Closes</th>
                            <th class="history-num">Close rate</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <p style="font-size: 0.8rem; color: var(--color-text-muted); margin: 1rem 0 0 0; line-height: 1.5;">
                Close rate reads as a dash until you have logged a close, because no closes recorded is not the same as none happening.
            </p>
        </div>
    `;
}

// Revenue by calendar year, as a bar per year. Plain divs rather than a chart
// library: three or four bars do not justify a dependency, and this has to keep
// working with the app installed offline.
function renderYearView(history, currency) {
    const years = history.years;
    if (years.length === 0) return '';

    const biggest = years.reduce((max, y) => Math.max(max, y.revenue), 0);

    const rows = years.map(y => {
        const width = biggest > 0 ? Math.max(2, (y.revenue / biggest) * 100) : 2;
        const quarterNote = y.quartersFinished === 0
            ? ''
            : ` · ${y.quartersFinished} ${y.quartersFinished === 1 ? 'quarter' : 'quarters'} finished`;
        return `
            <div class="history-year-row">
                <div class="history-year-head">
                    <span class="history-year-label">${y.year}</span>
                    <span class="history-year-total">${currency}${formatAmount(y.revenue)}</span>
                </div>
                <div class="history-year-track">
                    <div class="history-year-bar" style="width: ${width}%;"></div>
                </div>
                <p class="history-year-meta">${formatAmount(y.salesCount)} ${y.salesCount === 1 ? 'sale' : 'sales'}${quarterNote}</p>
            </div>
        `;
    }).join('');

    return `
        <div class="card mb-6">
            <div class="flex items-center gap-2 mb-4">
                <h3 style="margin: 0; display: flex; align-items: center;">
                    Your year
                    ${renderTooltip(
                        "What you have earned in each calendar year, across every quarter.",
                        "This one counts every sale by the date it landed on, including anything logged outside a 90-day window, so it will not always match the quarter totals above adding up. It is the figure that answers 'what did this business earn last year'.",
                        "bottom",
                        { what: 'What this shows', why: 'Why it can differ from the table' }
                    )}
                </h3>
            </div>
            ${rows}
        </div>
    `;
}

// The written record: what each quarter was for, and the four answers given on
// the way out of it. These are the most considered thing the user writes all
// quarter and they were being thrown away entirely before batch 2 archived
// them. This screen is the first place they have ever been readable.
function renderQuarterDetail(history) {
    const archived = history.quarters.filter(q => !q.isCurrent);
    if (archived.length === 0) return '';

    const cards = archived.map(q => {
        const r = q.reflection || {};
        const answers = [
            ['What worked really well', r.worked],
            ["What didn't work", r.didntWork],
            ['What explicitly created results', r.results],
            ['What should change next quarter', r.changeNextQuarter]
        ].filter(([, text]) => text && String(text).trim());

        const body = answers.length === 0
            ? `<p style="font-size: 0.9rem; color: var(--color-text-muted); margin: 0;">No wrap-up was written for this quarter.</p>`
            : answers.map(([label, text]) => `
                <div class="history-answer">
                    <p class="history-answer-label">${label}</p>
                    <p class="history-answer-text">${escapeHistoryText(text)}</p>
                </div>
            `).join('');

        return `
            <details class="card mb-4 history-detail">
                <summary class="history-detail-summary">
                    <span>
                        <strong>${escapeHistoryText(q.label)}</strong>
                        <span class="history-row-dates">${escapeHistoryText(q.rangeLabel)}</span>
                    </span>
                    <!-- Both labels are rendered and CSS shows whichever matches
                         the open state, so <details> keeps doing the toggling
                         and this screen still needs no event handler. -->
                    <span class="history-detail-hint">
                        <span class="history-hint-closed">${answers.length > 0 ? 'Read the wrap-up' : 'Details'}</span>
                        <span class="history-hint-open">Hide</span>
                    </span>
                </summary>
                <div class="history-detail-body">
                    ${q.focus ? `
                        <div class="history-answer">
                            <p class="history-answer-label">The 90-day focus</p>
                            <p class="history-answer-text">${escapeHistoryText(q.focus)}</p>
                            ${q.outcome ? `<p class="history-answer-text" style="color: var(--color-text-muted);">${escapeHistoryText(q.outcome)}</p>` : ''}
                        </div>
                    ` : ''}
                    ${body}
                    <p class="history-detail-meta">
                        ${formatAmount(q.plansCount)} weekly ${q.plansCount === 1 ? 'plan' : 'plans'} ·
                        ${formatAmount(q.reviewsCount)} Friday ${q.reviewsCount === 1 ? 'review' : 'reviews'} ·
                        top channel ${escapeHistoryText(q.topSource)} ·
                        best offer ${escapeHistoryText(q.topOffer)}
                        ${q.revenueBeforeQuarter > 0 ? `<br>Not counted above: sales dated before this quarter opened.` : ''}
                    </p>
                </div>
            </details>
        `;
    });

    return `
        <h3 class="mb-4">The written record</h3>
        <p style="color: var(--color-text-muted); margin-bottom: var(--spacing-lg); font-size: 0.9rem;">
            What each quarter was for, and what you said about it on the way out.
        </p>
        ${cards.join('')}
    `;
}

// Nothing archived yet, which is every account until the first Quarter Reset.
// It says what will be here and when, rather than showing an empty table — a
// feature that looks broken on day one is worse than one that explains itself.
function renderFirstQuarter(history, currency) {
    const q = history.current;
    return `
        <div class="card mb-6" style="border-top: 4px solid var(--color-primary);">
            <p style="${PRO_CARD_HEADING_STYLE}">${proCardHeading('history', 'Your first quarter is still running')}</p>
            <p style="font-size: 0.95rem; line-height: 1.6; color: var(--color-text-main); margin: 0 0 1rem 0;">
                There is nothing to compare against yet. When you finish these ninety days with a Quarter Reset, everything in them —
                the revenue, the leads, the plans and the four answers you write on the way out — is archived here instead of cleared,
                and the next quarter gets measured against it.
            </p>
            <p style="font-size: 0.9rem; color: var(--color-text-muted); margin: 0;">
                So far: <strong>${currency}${formatAmount(q.revenue)}</strong>${q.goal > 0 ? ` of your ${currency}${formatAmount(q.goal)} goal` : ''},
                ${formatAmount(q.leads)} ${q.leads === 1 ? 'lead' : 'leads'} and ${formatAmount(q.closes)} ${q.closes === 1 ? 'close' : 'closes'}
                over ${q.weeksElapsed || 1} ${(q.weeksElapsed || 1) === 1 ? 'week' : 'weeks'}.
            </p>
        </div>
    `;
}

export function renderHistory() {
    window.setScreenModule({ attachEvents: historyAttachEvents });

    // Base accounts have no route here from anywhere in the UI, but a typed URL
    // or an old bookmark still lands. Explain rather than redirect, same as the
    // pipeline screen: being bounced with no reason given is the worst version
    // of a paywall.
    if (!canUseHistory()) {
        return `
            ${renderNav()}
            <div class="main-content">
                <div class="card" style="max-width: 620px; margin: 3rem auto; padding: 2rem; text-align: center;" data-locked-history>
                    <p style="${PRO_CARD_HEADING_STYLE} justify-content: center;">${proCardHeading('history', 'Your year, quarter by quarter')}</p>
                    <p style="color: var(--color-text-muted); line-height: 1.6; margin-bottom: 1.5rem;">
                        Finished quarters kept and compared side by side. This one is part of Pro.
                    </p>
                    <button type="button" class="btn btn-primary" data-pro-feature="history">Tell me more</button>
                    <p style="margin-top: 1.5rem;"><a href="#/progress" style="font-size: 0.875rem; color: var(--color-text-muted);">Back to Wins &amp; Progress</a></p>
                </div>
            </div>
        `;
    }

    const store = getStore();
    const currency = store.settings?.currency || '$';
    const history = getQuarterHistory();

    return `
        ${renderNav()}
        <!-- dashboard-layout widens main-content from 800px to 1200px, which the
             comparison table needs before it starts scrolling sideways. -->
        <div class="main-content dashboard-layout">
            <div class="flex justify-between items-center mb-6 flex-mobile-col" style="gap: 1rem;">
                <div>
                    <h2 style="margin-bottom: 0.25rem;">Quarter History</h2>
                    <p style="color: var(--color-text-muted); margin: 0;">Whether this quarter is genuinely better than the last one, or it just feels that way.</p>
                </div>
                <p style="${PRO_CARD_HEADING_STYLE} margin: 0;">${proCardHeading('history', 'History')}</p>
            </div>

            ${history.hasHistory ? renderSamePoint(history, currency) : renderFirstQuarter(history, currency)}
            ${history.hasHistory ? renderQuarterTable(history, currency) : ''}
            ${renderYearView(history, currency)}
            ${renderQuarterDetail(history)}

            <p style="text-align: center; margin-top: var(--spacing-xl);">
                <a href="#/progress" style="font-size: 0.875rem; color: var(--color-text-muted);">Back to Wins &amp; Progress</a>
            </p>
        </div>
    `;
}

function historyAttachEvents() {
    // There is no nav link of its own — this screen is reached from Wins &
    // Progress, so that is the nav item that stays lit while you are here.
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-progress')?.classList.add('active');
}
