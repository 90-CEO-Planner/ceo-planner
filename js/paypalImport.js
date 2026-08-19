// paypalImport.js
//
// Client half of Pro item 10. Talks to the paypal-connect and paypal-sync edge
// functions. The sibling of stripeImport.js, and deliberately the same shape.
//
// Reading imported sales is in importedSales.js, shared with Stripe. Nothing in
// this file reads the sales table.

import { isProUser, isFeatureLive, PAYPAL_IMPORT_LIVE } from './components/proGate.js';
import { fetchConnectionRow, refreshImportedSales } from './importedSales.js';

// --- Is the PayPal card visible? ---------------------------------------------
//
// The switch itself is PAYPAL_IMPORT_LIVE in components/proGate.js, NOT here.
// It lives there because that file also owns the copy that has to agree with it
// (the Pro pop-up, the plan list, the Revenue teaser), and paypalImport already
// imports proGate, so a flag owned here could not be read back without a cycle.
//
// This file used to declare its own `PAYPAL_LIVE`. That was removed rather than
// left in place: two flags for one decision is precisely the bug where someone
// flips the one they can see and nothing happens.

// Can this account actually reach the PayPal connect form on the Account screen?
//
// Gated on the same Pro feature as Stripe (`payment-import` covers both
// processors — PayPal is not a separate purchase), plus PAYPAL_IMPORT_LIVE.
//
// The `ceo_paypal_preview` localStorage escape hatch was removed when the flag
// went true on 19 Aug 2026: once PAYPAL_IMPORT_LIVE is true it could only ever
// read as true, so keeping it would have left a second switch that does nothing
// — the same shape of trap as the duplicate flag noted above. Any browser still
// holding the old key is simply ignored. If the flag is ever turned back off to
// roll PayPal back, restore this pair from git history rather than inventing a
// new one.
export function canConnectPayPal() {
    if (!isProUser()) return false;
    if (!isFeatureLive('payment-import')) return false;
    return PAYPAL_IMPORT_LIVE;
}

// Where the user creates the REST app whose credentials they paste in.
//
// This is the developer dashboard, not the ordinary PayPal account area, and
// that is worth knowing before clicking: it looks like a different company's
// website and asks you to log in again. The Account card says so.
export const PAYPAL_APP_PAGE = 'https://developer.paypal.com/dashboard/applications/live';

// The current PayPal connection. Same three states as Stripe, same rules —
// 'unknown' must never render the connect form.
export async function fetchPayPalConnection() {
    return fetchConnectionRow(
        'paypal_connections',
        'paypal_account_id, granted_scopes, read_only, livemode, connected_at, last_synced_at, last_sync_error'
    );
}

// Hand the user's REST app credentials to the edge function, which validates
// them against PayPal and stores them server side. Resolves to an error string,
// or null on success.
//
// Unlike Stripe there is no prefix check worth doing in the browser: a PayPal
// client id and secret look the same whatever the app can do, so the only real
// validation is the token exchange the function performs. The one obvious
// mistake worth catching here is the empty field.
//
// Neither half is stored in the browser: not in localStorage, not in the store,
// not in a data attribute. The inputs that carried them are cleared by the
// caller the moment this returns.
export async function connectPayPalApp(clientId, clientSecret) {
    const id = String(clientId || '').trim();
    const secret = String(clientSecret || '').trim();

    if (!id) return 'Please paste your PayPal client ID first.';
    if (!secret) return 'Please paste your PayPal secret too.';

    const { data, error } = await window.db.functions.invoke('paypal-connect?action=connect', {
        method: 'POST',
        body: { clientId: id, clientSecret: secret }
    });

    if (error) return await window.readFunctionError(error);
    return data?.ok ? null : 'Could not connect PayPal. Please try again.';
}

export async function disconnectPayPal() {
    const { error } = await window.db.functions.invoke('paypal-connect?action=disconnect', {
        method: 'POST'
    });
    if (error) return await window.readFunctionError(error);
    return null;
}

// Pull new sales. Returns { imported, scanned, refunded, truncated } or an error.
export async function syncPayPalSales() {
    const { data, error } = await window.db.functions.invoke('paypal-sync', { method: 'POST' });
    if (error) return { error: await window.readFunctionError(error) };
    return data || { imported: 0, scanned: 0 };
}

// Import quietly in the background, if it is due.
//
// Same contract as autoSyncStripeIfDue: throttled per browser, deliberately
// silent, never interrupts. A failure just means the figures are as fresh as the
// last successful run, and the manual button is still there with its own
// feedback.
//
// Its own throttle key, so a PayPal sync being due does not depend on when
// Stripe last ran and vice versa.
const PAYPAL_AUTO_SYNC_KEY = 'ceo_paypal_last_autosync';
const PAYPAL_AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;

export async function autoSyncPayPalIfDue() {
    try {
        const last = parseInt(localStorage.getItem(PAYPAL_AUTO_SYNC_KEY) || '0', 10);
        if (Date.now() - last < PAYPAL_AUTO_SYNC_INTERVAL_MS) return null;

        // Only worth a request if this account has actually connected PayPal.
        const { state } = await fetchPayPalConnection();
        if (state !== 'connected') return null;

        // Written before the call, not after: a failing sync should wait its turn
        // like a successful one, rather than retrying on every page load.
        localStorage.setItem(PAYPAL_AUTO_SYNC_KEY, String(Date.now()));

        const result = await syncPayPalSales();
        if (result && !result.error && result.imported) {
            await refreshImportedSales();
            return result;
        }
        return null;
    } catch (err) {
        console.warn('Background PayPal sync skipped:', err.message);
        return null;
    }
}
