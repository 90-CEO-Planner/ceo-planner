// tooltip.js

// labels lets a caller rename the two headings. "What it is / Why it matters"
// suits a single metric, but a whole card is better explained as "what this
// answers / how to use it". Defaults are unchanged, so every existing tooltip
// keeps the wording it already had.
export function renderTooltip(whatStr, whyStr, position = 'top', labels = {}) {
    // Generate a unique ID for aria properties
    const id = 'tt_' + Math.random().toString(36).substr(2, 9);

    const whatLabel = labels.what || 'What it is';
    const whyLabel = labels.why || 'Why it matters';

    let content = '';
    if (whatStr) {
        content += `<span class="tooltip-section"><strong>${whatLabel}:</strong> ${whatStr}</span>`;
    }
    if (whyStr) {
        content += `<span class="tooltip-section"><strong>${whyLabel}:</strong> ${whyStr}</span>`;
    }

    return `
        <span class="tooltip-container ${position === 'bottom' ? 'tooltip-bottom' : ''}" tabindex="0" aria-describedby="${id}">
            <svg class="info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span class="tooltip-content" id="${id}" role="tooltip">
                ${content}
            </span>
        </span>
    `;
}
