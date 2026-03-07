// tooltip.js

export function renderTooltip(whatStr, whyStr) {
    // Generate a unique ID for aria properties
    const id = 'tt_' + Math.random().toString(36).substr(2, 9);

    return `
        <span class="tooltip-container" tabindex="0" aria-describedby="${id}">
            <svg class="info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span class="tooltip-content" id="${id}" role="tooltip">
                <span class="tooltip-section">
                    <strong>What it is:</strong> ${whatStr}
                </span>
                <span class="tooltip-section">
                    <strong>Why it matters:</strong> ${whyStr}
                </span>
            </span>
        </span>
    `;
}
