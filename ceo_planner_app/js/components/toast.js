// toast.js
//
// One place for "the action finished" feedback. Before this, nearly every action
// in the app ended in a native alert() followed by window.location.reload() —
// a modal the user had to dismiss, then a full page rebuild that lost their
// scroll position and flashed the whole UI.
//
// showToast    — non-blocking confirmation, disappears on its own
// showConfirm  — promise-based replacement for confirm(), for destructive actions
// rerenderScreen — re-runs the router for the current hash instead of reloading

const TOAST_CONTAINER_ID = 'ceo-toast-container';

function getToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = TOAST_CONTAINER_ID;
        container.className = 'toast-container';
        // Announce politely so a screen reader hears the confirmation without
        // interrupting whatever it is currently reading.
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('role', 'status');
        document.body.appendChild(container);
    }
    return container;
}

// type: 'success' | 'error' | 'info'
export function showToast(message, type = 'success', duration = 3500) {
    const container = getToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'error' ? '⚠️' : (type === 'info' ? 'ℹ️' : '✅');
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message"></span>`;
    // textContent, not innerHTML — messages can carry user-entered text
    toast.querySelector('.toast-message').textContent = message;

    container.appendChild(toast);

    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        toast.classList.add('toast-leaving');
        setTimeout(() => toast.remove(), 250);
    };

    toast.addEventListener('click', dismiss);
    // Errors linger a little longer; they usually carry something to act on.
    setTimeout(dismiss, type === 'error' ? Math.max(duration, 6000) : duration);

    return dismiss;
}

// Promise-based confirm. Resolves true if the user confirms, false otherwise.
// opts: { title, confirmText, cancelText, danger }
export function showConfirm(message, opts = {}) {
    const {
        title = 'Are you sure?',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        danger = false
    } = opts;

    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-card card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
                <h3 id="confirm-title" class="confirm-title"></h3>
                <p class="confirm-message"></p>
                <div class="confirm-actions">
                    <button type="button" class="btn btn-ghost confirm-cancel"></button>
                    <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} confirm-ok"></button>
                </div>
            </div>
        `;
        overlay.querySelector('.confirm-title').textContent = title;
        overlay.querySelector('.confirm-message').textContent = message;
        overlay.querySelector('.confirm-cancel').textContent = cancelText;
        overlay.querySelector('.confirm-ok').textContent = confirmText;

        const previouslyFocused = document.activeElement;

        const close = (result) => {
            document.removeEventListener('keydown', onKeydown);
            overlay.remove();
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus();
            }
            resolve(result);
        };

        const onKeydown = (e) => {
            if (e.key === 'Escape') close(false);
        };

        overlay.querySelector('.confirm-ok').addEventListener('click', () => close(true));
        overlay.querySelector('.confirm-cancel').addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });
        document.addEventListener('keydown', onKeydown);

        document.body.appendChild(overlay);
        overlay.querySelector(danger ? '.confirm-cancel' : '.confirm-ok').focus();
    });
}

// Re-render whatever screen is currently routed. The router already listens for
// hashchange, so this reuses the one code path that knows how to build a screen —
// without the page reload that used to follow every save.
export function rerenderScreen() {
    window.dispatchEvent(new Event('hashchange'));
}
