// The branded report — Pro item 8.
//
// The CSV export (batch 7) is the *data*: one flat table, meant to be sorted and
// pivoted in a spreadsheet. This is the *presentation*: the same ninety days laid
// out to be read by somebody who is not the founder — an accountant, a business
// partner, a coach, or the version of her looking back in January.
//
// Three decisions worth knowing before changing anything here:
//
// 1. **No library and no build step.** The report is one self-contained HTML
//    document with its own <style>, shown in an iframe and printed by the
//    browser's own dialogue, where "Save as PDF" is a destination every modern
//    browser already offers. A PDF library was rejected: jsPDF and its autotable
//    plugin are ~300KB from a CDN for output worse than the browser's own
//    renderer, and this app has no bundler to tree-shake them.
// 2. **The preview and the print are the same document.** The iframe holds the
//    finished report, so what is on screen is what comes out of the printer.
//    Building a modal preview in app CSS and a separate print stylesheet would
//    be two things to keep in step, and they would drift.
// 3. **Every figure comes from getRevenueInsights(), getFunnelInsights() and
//    getPipelineInsights().** Nothing here works out its own version of a
//    number the app shows elsewhere. A report that quietly disagrees with the
//    screen it was generated from is worse than no report, because it is the
//    copy that gets emailed to somebody else.

// One line on purpose: build_bundle.ps1 strips imports with a single-line regex,
// and a multi-line import survives it as loose syntax in the bundle.
import { getStore, getRevenueInsights, getFunnelInsights, getPipelineInsights, getQuarterEnd, quarterRangeLabel, formatAmount, getWeekStart, getLocalDateString, PIPELINE_STAGES, PIPELINE_PROBABILITIES } from '../store.js';
import { showToast } from './toast.js';
import { canExportPdf, proBadge } from './proGate.js';

// The coach's written summary, if one was generated in this browser session.
//
// Deliberately session-scoped rather than stored. Persisting reports is a real
// idea and it is written down as the base-tier answer to "my report vanished
// when I closed the modal" — it is not this feature. What this does is make the
// two halves of the Executive Report meet: generate the AI summary, then export,
// and the narrative rides along with the numbers it was written about.
let lastAiReport = null;

export function rememberAiReport(text) {
    if (typeof text !== 'string' || !text.trim()) return;
    lastAiReport = { text, at: new Date() };
}

// User-entered text goes into a document that gets printed, saved and sent on.
// Everything from the store is escaped on the way in.
function esc(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// The app's own brand colours, read from the live stylesheet rather than copied.
// The report is a separate document with no access to the app's CSS variables,
// so the values are resolved once here and written into it literally. Reading
// them means a change in variables.css reaches the report on its own; the
// fallbacks are the current values, for the case where the stylesheet has not
// loaded (offline first paint) and getComputedStyle hands back an empty string.
function brandColours() {
    const fallback = {
        '--color-primary': '#00C2CB',
        '--color-primary-dark': '#0099A1',
        '--color-primary-light': '#E5F9FA',
        '--color-secondary': '#F2C21D',
        '--color-secondary-dark': '#D1A511',
        '--color-accent-dark': '#D47E8D',
        '--color-black': '#0F172A',
        '--color-text-main': '#334155',
        '--color-text-muted': '#64748B'
    };

    const out = {};
    let computed = null;
    try {
        computed = window.getComputedStyle(document.documentElement);
    } catch (err) {
        computed = null;
    }

    Object.keys(fallback).forEach(key => {
        const live = computed ? String(computed.getPropertyValue(key) || '').trim() : '';
        out[key.replace('--color-', '')] = live || fallback[key];
    });
    return out;
}

function stageLabel(key) {
    const found = PIPELINE_STAGES.find(s => s.key === key);
    return found ? found.label : 'Lead';
}

function probabilityLabel(key) {
    const found = PIPELINE_PROBABILITIES.find(p => p.key === key);
    return found ? found.label : 'Not set';
}

function shortDate(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function longDate(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

// --- The weekly chart --------------------------------------------------------
//
// Inline SVG rather than the CSS bars the Revenue screen draws. Those are div
// heights in percentages inside a flex row, which a print renderer collapses the
// moment the container has no fixed height — the chart would come out as a row
// of slivers. An SVG is the same drawing at any size and prints as drawn.
//
// One bar per week of the quarter that has actually happened, including the
// empty ones. A chart that silently skips a week with no sales makes a patchy
// quarter look continuous, which is the one thing a report must not do.
function weeklyChartSvg(insights, store, colours, currency) {
    const startISO = store.quarterStartDate;
    const start = startISO ? getWeekStart(new Date(startISO)) : null;
    if (!start || !Number.isFinite(start.getTime())) return '';

    const entries = insights.quarterEntries || [];
    const buckets = [];
    const cursor = new Date(start);
    const today = new Date();

    // 12 weeks is the quarter; the 90-day window can touch a 13th, so the loop
    // stops at whichever comes first rather than at a flat 12.
    for (let i = 0; i < 13; i++) {
        if (cursor.getTime() > today.getTime()) break;
        buckets.push({ key: getLocalDateString(cursor), start: new Date(cursor), amount: 0 });
        cursor.setDate(cursor.getDate() + 7);
    }
    if (buckets.length === 0) return '';

    entries.forEach(e => {
        const key = getLocalDateString(getWeekStart(new Date(e.date)));
        const bucket = buckets.find(b => b.key === key);
        if (bucket) bucket.amount += parseFloat(e.amount) || 0;
    });

    // The weekly line the goal actually asks for. Drawn as a target rather than
    // stated in words because the whole point of the chart is whether the bars
    // clear it.
    const weeklyGoal = insights.goal > 0 ? insights.goal / 12 : 0;
    const peak = Math.max(...buckets.map(b => b.amount), weeklyGoal, 1);

    const W = 720;
    const H = 260;
    const padL = 8;
    const padR = 8;
    const padTop = 26;   // room for the value labels above the tallest bar
    const padBottom = 34; // room for the week labels
    const plotH = H - padTop - padBottom;
    const slot = (W - padL - padR) / buckets.length;
    const barW = Math.min(46, slot * 0.6);

    const bars = buckets.map((b, i) => {
        const h = peak > 0 ? (b.amount / peak) * plotH : 0;
        const x = padL + (slot * i) + (slot - barW) / 2;
        const y = padTop + plotH - h;
        const label = b.amount > 0
            ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="bar-value">${esc(currency + formatAmount(Math.round(b.amount)))}</text>`
            : '';
        return `
            <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, b.amount > 0 ? 2 : 0).toFixed(1)}" rx="3" class="bar"></rect>
            ${label}
            <text x="${(x + barW / 2).toFixed(1)}" y="${(padTop + plotH + 18).toFixed(1)}" class="bar-label">${esc(shortDate(b.start))}</text>
        `;
    }).join('');

    const goalY = weeklyGoal > 0 ? padTop + plotH - (weeklyGoal / peak) * plotH : null;
    const goalLine = goalY === null ? '' : `
        <line x1="${padL}" y1="${goalY.toFixed(1)}" x2="${W - padR}" y2="${goalY.toFixed(1)}" class="goal-line"></line>
        <text x="${W - padR}" y="${(goalY - 5).toFixed(1)}" class="goal-label" text-anchor="end">Weekly target ${esc(currency + formatAmount(Math.round(weeklyGoal)))}</text>
    `;

    return `
        <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Revenue by week this quarter">
            <style>
                .bar { fill: ${colours.secondary}; }
                .bar-value { font: 600 10px 'Helvetica Neue', Arial, sans-serif; fill: ${colours.black}; text-anchor: middle; }
                .bar-label { font: 600 9px 'Helvetica Neue', Arial, sans-serif; fill: ${colours['text-muted']}; text-anchor: middle; }
                .goal-line { stroke: ${colours['primary-dark']}; stroke-width: 1.5; stroke-dasharray: 5 4; }
                .goal-label { font: 600 9px 'Helvetica Neue', Arial, sans-serif; fill: ${colours['primary-dark']}; }
                .axis { stroke: #E2E8F0; stroke-width: 1; }
            </style>
            <line x1="${padL}" y1="${padTop + plotH}" x2="${W - padR}" y2="${padTop + plotH}" class="axis"></line>
            ${goalLine}
            ${bars}
        </svg>
    `;
}

// --- The document itself -----------------------------------------------------

function buildReportHtml() {
    const store = getStore();
    const insights = getRevenueInsights();
    const funnel = getFunnelInsights();
    const pipeline = getPipelineInsights();
    const colours = brandColours();
    const currency = store.settings?.currency || '$';
    const money = (n) => currency + formatAmount(n);

    const businessName = store.profile?.businessName || store.profile?.name || 'My business';
    const ownerName = store.profile?.name || '';
    const logo = store.profile?.logo || '';
    const quarterEnd = getQuarterEnd(store);
    const range = quarterRangeLabel(
        store.quarterStartDate,
        quarterEnd ? quarterEnd.toISOString() : null
    );

    // Over-goal quarters. progressPercent is capped at 100 so the bar on the
    // Revenue screen cannot overflow its track; the report says the rest out
    // loud instead of quietly reporting a beaten goal as exactly met.
    const beatGoal = insights.goal > 0 && insights.totalRevenue > insights.goal;

    const kpis = [
        {
            label: 'Revenue this quarter',
            value: money(insights.totalRevenue),
            note: insights.goal > 0
                ? `${insights.progressPercent.toFixed(0)}% of the ${money(insights.goal)} goal`
                : 'No quarterly goal set'
        },
        {
            label: 'Pace',
            value: esc(insights.momentum),
            note: insights.goal > 0
                ? `Projecting ${money(Math.round(insights.projectedRevenue))} by the end of the quarter`
                : 'Set a revenue goal to see a projection'
        },
        {
            label: 'Where we are',
            value: `Week ${insights.weeksElapsed} of 12`,
            note: insights.weeksRemaining > 0
                ? `${insights.weeksRemaining} week${insights.weeksRemaining === 1 ? '' : 's'} left`
                : 'Final week of the quarter'
        },
        {
            label: 'Needed each week from here',
            value: money(Math.round(insights.weeklyTargetLength)),
            note: insights.hasOfferPrice
                ? `About ${insights.salesRequiredPerWeek} sale${insights.salesRequiredPerWeek === 1 ? '' : 's'} a week at ${money(insights.averageOfferPrice)}`
                : 'Set an average offer price to see this in sales'
        }
    ];

    if (insights.hasOfferPrice) {
        kpis.push({
            label: 'Sales made',
            value: `${insights.salesMade} of ${insights.salesRequired}`,
            note: insights.salesRemaining > 0
                ? `${insights.salesRemaining} to go`
                : 'Target reached'
        });
    }
    kpis.push({
        label: 'Sales logged',
        value: String(insights.quarterEntryCount),
        note: insights.revenueBeforeQuarter > 0
            ? `Plus ${money(insights.revenueBeforeQuarter)} logged before this quarter began`
            : 'Entries dated inside this quarter'
    });

    const kpiHtml = kpis.map(k => `
        <div class="kpi">
            <p class="kpi-label">${esc(k.label)}</p>
            <p class="kpi-value">${k.value}</p>
            <p class="kpi-note">${k.note}</p>
        </div>
    `).join('');

    // --- Funnel ---
    //
    // callCloseRate is null when calls have been logged but closes never were.
    // It prints as an em dash and says why, exactly as the Revenue screen does:
    // showing 0% would be the report asserting that no call ever closed, which
    // is a claim the data does not make.
    const closeRate = funnel.callCloseRate === null
        ? '—'
        : `${funnel.callCloseRate.toFixed(1)}%`;
    const visitorRate = funnel.visitorToCallRate === null
        ? '—'
        : `${funnel.visitorToCallRate.toFixed(1)}%`;
    const leadSplit = (funnel.bulkLeads > 0 && funnel.contactLeads > 0)
        ? `${funnel.bulkLeads} logged in bulk, ${funnel.contactLeads} named contacts`
        : '';

    const funnelRows = [
        ['Website visitors', funnel.snapshotTraffic.toLocaleString(), 'From your monthly snapshots'],
        ['Leads', funnel.totalLeads.toLocaleString(), leadSplit],
        ['Calls booked', funnel.totalCalls.toLocaleString(), ''],
        ['Calls closed', funnel.anyClosesEverLogged ? funnel.totalCloses.toLocaleString() : '—',
            funnel.anyClosesEverLogged ? '' : 'Not recorded yet'],
        ['Visitor to call', visitorRate, ''],
        ['Call close rate', closeRate, funnel.callCloseRate === null && funnel.totalCalls > 0
            ? 'Calls logged, closes never recorded' : '']
    ].map(([label, value, note]) => `
        <tr>
            <td>${esc(label)}</td>
            <td class="num">${esc(value)}</td>
            <td class="note">${esc(note)}</td>
        </tr>
    `).join('');

    // --- Where the money came from ---
    //
    // Grouped here over quarterEntries rather than read from
    // insights.revenueBySourceQuarter, which despite its name sums EVERY entry
    // including anything dated before the quarter started. Its shares therefore
    // do not divide into totalRevenue, and a report whose percentages add up to
    // 140% is worse than no breakdown at all.
    const sourceTotals = {};
    (insights.quarterEntries || []).forEach(e => {
        const key = e.source || 'Not recorded';
        sourceTotals[key] = (sourceTotals[key] || 0) + (parseFloat(e.amount) || 0);
    });
    const sourceRows = Object.keys(sourceTotals)
        .sort((a, b) => sourceTotals[b] - sourceTotals[a])
        .map(name => {
            const amount = sourceTotals[name];
            const share = insights.totalRevenue > 0
                ? `${((amount / insights.totalRevenue) * 100).toFixed(0)}%`
                : '—';
            return `<tr><td>${esc(name)}</td><td class="num">${money(amount)}</td><td class="num">${share}</td></tr>`;
        }).join('');

    const sourceSection = sourceRows ? `
        <section class="block">
            <h2>Where this quarter's revenue came from</h2>
            <table>
                <thead><tr><th>Source</th><th class="num">Revenue</th><th class="num">Share</th></tr></thead>
                <tbody>${sourceRows}</tbody>
            </table>
        </section>
    ` : '';

    // --- Pipeline ---
    //
    // Money that MIGHT arrive, kept visibly apart from money that did. The
    // caveats are not decoration: an open pipeline printed without its
    // unweighted count reads as a forecast built from answers when part of it is
    // built from silence.
    const open = pipeline.contacts.filter(c => c.isOpen);
    const openSorted = open.slice().sort((a, b) => {
        if (a.closeDate && b.closeDate) return String(a.closeDate).localeCompare(String(b.closeDate));
        if (a.closeDate) return -1;
        if (b.closeDate) return 1;
        return (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0);
    });
    const shown = openSorted.slice(0, 20);

    const pipelineRows = shown.map(c => `
        <tr>
            <td>${esc(c.name || 'Unnamed')}</td>
            <td>${esc(stageLabel(c.stage))}</td>
            <td class="num">${c.value ? money(c.value) : '—'}</td>
            <td>${esc(probabilityLabel(c.probability))}</td>
            <td>${c.closeDate ? esc(shortDate(c.closeDate)) : '—'}</td>
        </tr>
    `).join('');

    const pipelineCaveats = [];
    if (pipeline.unweightedCount > 0) {
        pipelineCaveats.push(`${pipeline.unweightedCount} open deal${pipeline.unweightedCount === 1 ? ' has' : 's have'} no likelihood set, so ${money(pipeline.unweightedValue)} of the total is not in the weighted figure.`);
    }
    if (pipeline.noCloseDateCount > 0) {
        pipelineCaveats.push(`${pipeline.noCloseDateCount} open deal${pipeline.noCloseDateCount === 1 ? ' has' : 's have'} no expected close date, so ${pipeline.noCloseDateCount === 1 ? 'it is' : 'they are'} not counted in what is expected this quarter.`);
    }
    if (shown.length < openSorted.length) {
        pipelineCaveats.push(`Showing the first ${shown.length} of ${openSorted.length} open deals.`);
    }

    const pipelineSection = open.length === 0 ? '' : `
        <section class="block">
            <h2>Open pipeline</h2>
            <p class="lede">Money that might arrive. None of it is counted in the revenue figures above.</p>
            <div class="mini-kpis">
                <div class="mini"><span>${money(pipeline.openValue)}</span><small>${pipeline.openCount} open deal${pipeline.openCount === 1 ? '' : 's'}</small></div>
                <div class="mini"><span>${money(pipeline.weightedValue)}</span><small>Weighted by likelihood (${pipeline.weightedCount} deal${pipeline.weightedCount === 1 ? '' : 's'})</small></div>
                <div class="mini"><span>${money(pipeline.expectedThisQuarter)}</span><small>Expected before this quarter ends</small></div>
            </div>
            <table>
                <thead><tr><th>Contact</th><th>Stage</th><th class="num">Value</th><th>Likelihood</th><th>Expected close</th></tr></thead>
                <tbody>${pipelineRows}</tbody>
            </table>
            ${pipelineCaveats.length ? `<p class="caveat">${pipelineCaveats.map(esc).join(' ')}</p>` : ''}
        </section>
    `;

    // --- The coach's summary, if there is one this session ---
    let aiSection = '';
    if (lastAiReport) {
        let bodyHtml;
        try {
            bodyHtml = window.marked
                ? window.marked.parse(lastAiReport.text)
                : `<pre class="plain">${esc(lastAiReport.text)}</pre>`;
        } catch (err) {
            bodyHtml = `<pre class="plain">${esc(lastAiReport.text)}</pre>`;
        }
        aiSection = `
            <section class="block page-break">
                <h2>The coach's read on this quarter</h2>
                <p class="lede">Generated ${esc(longDate(lastAiReport.at))} from the numbers in this report.</p>
                <div class="prose">${bodyHtml}</div>
            </section>
        `;
    }

    const chart = weeklyChartSvg(insights, store, colours, currency);
    const chartSection = chart ? `
        <section class="block">
            <h2>Revenue by week</h2>
            ${(insights.quarterEntries || []).length === 0
                ? '<p class="lede">Nothing logged in this quarter yet, so every week reads as zero.</p>'
                : ''}
            ${chart}
        </section>
    ` : '';

    const goalNote = beatGoal
        ? `<p class="banner-note">Goal beaten by ${money(insights.totalRevenue - insights.goal)}.</p>`
        : '';

    const barWidth = insights.goal > 0 ? Math.min(100, insights.progressPercent) : 0;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(businessName)} — 90-day report</title>
<style>
    /* Colour survives the print dialogue. Without this Chrome strips every
       background and the report prints as grey text on white. */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    @page { size: A4; margin: 14mm 12mm; }
    body {
        margin: 0;
        padding: 28px 32px 40px 32px;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        color: ${colours['text-main']};
        background: #FFFFFF;
        font-size: 13px;
        line-height: 1.55;
    }
    header.masthead {
        display: flex; align-items: center; justify-content: space-between;
        gap: 24px; padding-bottom: 16px; margin-bottom: 24px;
        border-bottom: 3px solid ${colours.primary};
    }
    .masthead-id { display: flex; align-items: center; gap: 14px; }
    .masthead-logo { max-height: 56px; max-width: 150px; object-fit: contain; }
    h1 { margin: 0; font-size: 20px; color: ${colours.black}; letter-spacing: -0.01em; }
    .masthead-sub { margin: 2px 0 0 0; font-size: 12px; color: ${colours['text-muted']}; }
    .masthead-meta { text-align: right; font-size: 11px; color: ${colours['text-muted']}; }
    .masthead-meta strong { display: block; font-size: 13px; color: ${colours.black}; }

    .banner {
        background: ${colours['primary-light']};
        border: 1px solid ${colours.primary};
        border-radius: 10px; padding: 18px 20px; margin-bottom: 22px;
    }
    .banner-top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .banner-figure { font-size: 30px; font-weight: 700; color: ${colours['primary-dark']}; margin: 0; }
    .banner-goal { font-size: 12px; color: ${colours['text-main']}; margin: 0; }
    .track { height: 10px; background: #FFFFFF; border-radius: 999px; margin-top: 12px; overflow: hidden; border: 1px solid rgba(0,0,0,0.06); }
    .track-fill { height: 100%; background: ${colours.primary}; border-radius: 999px; }
    .banner-note { margin: 10px 0 0 0; font-size: 12px; font-weight: 600; color: ${colours['primary-dark']}; }

    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 26px; }
    .kpi { border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px 14px; }
    .kpi-label { margin: 0; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; color: ${colours['text-muted']}; }
    .kpi-value { margin: 5px 0 3px 0; font-size: 19px; font-weight: 700; color: ${colours.black}; }
    .kpi-note { margin: 0; font-size: 11px; color: ${colours['text-muted']}; line-height: 1.4; }

    section.block { margin-bottom: 26px; page-break-inside: avoid; }
    section.page-break { page-break-before: auto; page-break-inside: auto; }
    h2 {
        margin: 0 0 10px 0; font-size: 14px; color: ${colours.black};
        border-left: 4px solid ${colours.secondary}; padding-left: 9px;
    }
    .lede { margin: 0 0 10px 0; font-size: 11.5px; color: ${colours['text-muted']}; }

    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th {
        text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em;
        color: ${colours['text-muted']}; border-bottom: 2px solid #E2E8F0; padding: 6px 8px;
    }
    td { padding: 7px 8px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    td.note { color: ${colours['text-muted']}; font-size: 11px; }
    tbody tr:nth-child(even) { background: #FAFCFD; }

    .mini-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
    .mini { border-left: 3px solid ${colours['accent-dark']}; padding-left: 10px; }
    .mini span { display: block; font-size: 16px; font-weight: 700; color: ${colours.black}; }
    .mini small { font-size: 10.5px; color: ${colours['text-muted']}; }
    .caveat { margin: 10px 0 0 0; font-size: 11px; color: ${colours['text-muted']}; font-style: italic; }

    .prose { font-size: 12.5px; }
    .prose h1, .prose h2, .prose h3 { font-size: 13px; color: ${colours.black}; margin: 16px 0 6px 0; border: 0; padding: 0; }
    .prose p { margin: 0 0 9px 0; }
    .prose ul, .prose ol { margin: 0 0 9px 0; padding-left: 18px; }
    .prose li { margin-bottom: 4px; }
    .plain { white-space: pre-wrap; font-family: inherit; font-size: 12px; margin: 0; }

    footer {
        margin-top: 30px; padding-top: 12px; border-top: 1px solid #E2E8F0;
        font-size: 10.5px; color: ${colours['text-muted']};
    }
</style>
</head>
<body>
    <header class="masthead">
        <div class="masthead-id">
            ${logo ? `<img class="masthead-logo" src="${esc(logo)}" alt="">` : ''}
            <div>
                <h1>${esc(businessName)}</h1>
                <p class="masthead-sub">90-day executive report${ownerName ? ` · ${esc(ownerName)}` : ''}</p>
            </div>
        </div>
        <div class="masthead-meta">
            <strong>${esc(range)}</strong>
            Prepared ${esc(longDate(new Date()))}
        </div>
    </header>

    <div class="banner">
        <div class="banner-top">
            <p class="banner-figure">${money(insights.totalRevenue)}</p>
            <p class="banner-goal">${insights.goal > 0
                ? `of a ${money(insights.goal)} goal · ${insights.progressPercent.toFixed(0)}% · ${esc(insights.momentum)}`
                : 'No quarterly revenue goal set'}</p>
        </div>
        ${insights.goal > 0 ? `<div class="track"><div class="track-fill" style="width: ${barWidth.toFixed(1)}%;"></div></div>` : ''}
        ${goalNote}
    </div>

    <div class="kpis">${kpiHtml}</div>

    ${chartSection}

    <section class="block">
        <h2>The funnel</h2>
        <table>
            <thead><tr><th>Stage</th><th class="num">Figure</th><th>Note</th></tr></thead>
            <tbody>${funnelRows}</tbody>
        </table>
    </section>

    ${sourceSection}

    ${pipelineSection}

    ${aiSection}

    <footer>
        Generated by CEO Planner on ${esc(longDate(new Date()))}. Revenue figures cover
        ${esc(range)} and count only entries dated inside the quarter. Pipeline values are
        forecasts, not income.
    </footer>
</body>
</html>`;
}

// --- The modal ---------------------------------------------------------------
//
// Shares .confirm-overlay / .confirm-card with showConfirm() and the redo-a-week
// modal, so it is recognisably the same app.

export function showPdfReportModal() {
    // Belt and braces, the same as showWeekRegenModal: the Revenue screen only
    // renders the real button for accounts that pass this, but the function is
    // exported and a future caller might not check.
    if (!canExportPdf()) return;

    let html;
    try {
        html = buildReportHtml();
    } catch (err) {
        console.error('Report build failed:', err);
        showToast("We couldn't build your report just now. Please try again.", 'error');
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-card card pdf-report-card" role="dialog" aria-modal="true" aria-labelledby="pdf-report-title">
            <div class="pdf-report-head">
                <h3 id="pdf-report-title" class="confirm-title" style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                    ${proBadge()} Your 90-day report
                </h3>
                <button type="button" class="pdf-report-x" aria-label="Close">&times;</button>
            </div>
            <p class="pdf-report-note">Print it and choose <strong>Save as PDF</strong> as the destination. Everything below is exactly what comes out.</p>
            <iframe class="pdf-report-frame" title="Report preview"></iframe>
            <div class="confirm-actions pdf-report-actions">
                <button type="button" class="btn btn-outline pdf-report-tab">Open in a new tab</button>
                <button type="button" class="btn btn-primary pdf-report-print">Print or save as PDF</button>
            </div>
        </div>
    `;

    const previouslyFocused = document.activeElement;
    const close = () => {
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
    };
    const onKeydown = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeydown);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.body.appendChild(overlay);

    // Written into the iframe rather than set as srcdoc. srcdoc would need the
    // whole document HTML-escaped into an attribute, and a logo stored as a
    // base64 data URI makes that string enormous; document.write into a
    // same-origin about:blank frame sidesteps both problems.
    const frame = overlay.querySelector('.pdf-report-frame');
    try {
        const doc = frame.contentDocument || frame.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
    } catch (err) {
        console.error('Report preview failed:', err);
        showToast("We couldn't show the preview. Try 'Open in a new tab'.", 'error');
    }

    overlay.querySelector('.pdf-report-x').addEventListener('click', close);

    overlay.querySelector('.pdf-report-print').addEventListener('click', () => {
        try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
        } catch (err) {
            console.error('Print failed:', err);
            showToast("Your browser wouldn't open the print dialogue. Try 'Open in a new tab', then print from there.", 'error');
        }
    });

    // The escape hatch, and the only way to keep a copy of the file itself.
    // Some mobile browsers will not print an iframe, and a report you cannot
    // get out of the app is not a report you can send to your accountant.
    overlay.querySelector('.pdf-report-tab').addEventListener('click', () => {
        try {
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const win = window.open(url, '_blank');
            if (!win) {
                showToast('Your browser blocked the new tab. Allow pop-ups for this site and try again.', 'error');
            }
            // Long enough for the tab to have loaded it. Revoking immediately
            // leaves the new tab pointing at nothing.
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) {
            console.error('Report tab failed:', err);
            showToast("We couldn't open the report in a new tab.", 'error');
        }
    });
}
