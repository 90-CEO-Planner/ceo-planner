// stripeImport.js
//
// Client half of Pro item 1. Talks to the stripe-connect and stripe-sync edge
// functions and reads the imported_sales table.
//
// Deliberately does NOT write imported sales into the planner store. The store
// is one JSON document written wholesale by the browser on every save, so
// merging server-owned rows into it would mean a sync could overwrite whatever
// the user typed a second earlier. Imported sales stay in their own table and
// are merged at read time for display.

import { isProUser, isFeatureLive } from './components/proGate.js';

// Can this account actually reach the connect form on the Account screen?
//
// One answer, used by both the Account card (which is the form) and the Revenue
// teaser (which links to it). Two copies of this rule would eventually disagree,
// and the failure mode is a link that goes to a card that isn't there.
//
// The preview flag is the escape hatch: `payment-import` stays `shipped: false`
// until the revenue merge is done, which would otherwise hide the connect form
// from the one person who has to connect a real Stripe account to test it. Set
// it in the browser console:
//
//   localStorage.setItem('ceo_stripe_preview', '1')
//
// Delete the flag half of this expression when the feature ships.
export function canConnectStripe() {
    if (!isProUser()) return false;
    return isFeatureLive('payment-import') || localStorage.getItem('ceo_stripe_preview') === '1';
}

// Turn the preview flag on from a link instead of the console:
//
//   https://app.…/?stripe_preview=1
//   https://app.…/?stripe_preview=0   (turns it back off)
//
// The flag is localStorage, so it is per browser AND per profile. Setting it in
// Chrome does nothing for Safari, and clearing site data wipes it — which cost
// an hour on 16 Aug 2026, twice, because "the feature has vanished" and "I am on
// an old build" look identical from the outside. A link works on a phone, in a
// second browser, and for anyone who does not want to open a developer console.
//
// The parameter is read from the query string rather than the hash for the same
// reason the Stripe checkout marker is: the router rewrites the hash when it
// bounces an unauthenticated visitor to #/login, which would throw it away.
// It is stripped immediately after being applied, so a reload doesn't re-apply
// it and the URL doesn't get shared around with the flag baked in.
//
// Delete this whole function when `payment-import` ships.
export function applyStripePreviewParam() {
    const match = /[?&]stripe_preview=([01])/.exec(window.location.search);
    if (!match) return;

    if (match[1] === '1') {
        localStorage.setItem('ceo_stripe_preview', '1');
    } else {
        localStorage.removeItem('ceo_stripe_preview');
    }

    const cleaned = window.location.search
        .replace(/[?&]stripe_preview=[01]/, '')
        .replace(/^&/, '?');
    window.history.replaceState({}, '', window.location.pathname + (cleaned === '?' ? '' : cleaned) + window.location.hash);
}

// Where the user creates the key they paste in. Exported so the Account screen
// and any future onboarding step link to the same place.
//
// Checked 16 Aug 2026: Stripe documents no URL parameters for pre-selecting a
// restricted key's permissions, so the resource list cannot be pre-ticked for
// her. The instructions on the Account card carry that weight instead. Don't go
// hunting for a `?permissions[]=` parameter — it isn't in the docs.
export const STRIPE_KEY_PAGE = 'https://dashboard.stripe.com/apikeys/create';

// Sales imported for the signed-in user, newest first. Returns [] when nothing
// is connected, when the tables are missing, or when offline — this is decoration
// on top of the user's own data, so it must never break a screen by throwing.
export async function fetchImportedSales() {
    try {
        const { data: { session } } = await window.db.auth.getSession();
        if (!session || !session.user) return [];

        const { data, error } = await window.db
            .from('imported_sales')
            .select('external_id, amount, currency, occurred_at, description, product_name, product_id, customer_email, refunded')
            .eq('user_id', session.user.id)
            .order('occurred_at', { ascending: false })
            .limit(500);

        if (error) {
            console.warn('Could not read imported sales:', error.message);
            return [];
        }
        return data || [];
    } catch (err) {
        console.warn('Could not read imported sales:', err.message);
        return [];
    }
}

// --- The read-time merge -----------------------------------------------------
//
// getRevenueInsights() in store.js is synchronous and is called during render,
// but imported sales live in Postgres behind an async fetch. Rather than make
// the whole revenue pipeline async, or write server-owned rows into the store
// (which the note at the top of this file explains we must not do), the sales
// are held in memory here. The screens refresh the cache and re-render; the
// maths reads it synchronously.
//
// An empty cache is always a safe answer: it just means "manual entries only",
// which is exactly what the app did before this feature existed.
let importedSalesCache = [];
let importedSalesLoaded = false;

export function getImportedSalesCache() {
    return importedSalesCache;
}

export function hasLoadedImportedSales() {
    return importedSalesLoaded;
}

// Reshape a row from imported_sales into the same shape as a manually logged
// revenue entry, so the rest of the app does not need to know where it came from.
//
// A refunded charge is not revenue, so its amount is zeroed for the maths. The
// row is still returned rather than dropped, because a sale that silently
// vanishes from the feed after a refund looks like a bug, and the original
// figure is kept on grossAmount so the feed can say what happened.
function toEntryShape(row) {
    const gross = parseFloat(row.amount) || 0;
    const refunded = !!row.refunded;
    return {
        id: `stripe:${row.external_id}`,
        date: String(row.occurred_at || '').slice(0, 10),
        amount: refunded ? 0 : gross,
        grossAmount: gross,
        refunded,
        source: 'Stripe',
        offer: row.product_name || row.description || 'Stripe payment',
        type: 'sale',
        imported: true,
        customerEmail: row.customer_email || ''
    };
}

// Pull the latest imported sales into the cache. Returns the cache.
export async function refreshImportedSales() {
    const rows = await fetchImportedSales();
    importedSalesCache = (rows || []).map(toEntryShape);
    importedSalesLoaded = true;
    return importedSalesCache;
}

// The current connection, or null. Also carries last_synced_at and the last
// error, which is what the Account screen shows.
export async function fetchStripeConnection() {
    try {
        const { data: { session } } = await window.db.auth.getSession();
        if (!session || !session.user) return null;

        const { data, error } = await window.db
            .from('stripe_connections')
            .select('stripe_account_id, livemode, connected_at, last_synced_at, last_sync_error')
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (error) {
            console.warn('Could not read Stripe connection:', error.message);
            return null;
        }
        return data || null;
    } catch (err) {
        console.warn('Could not read Stripe connection:', err.message);
        return null;
    }
}

// Hand the user's restricted key to the edge function, which validates it against
// Stripe and stores it server side. Resolves to an error string, or null on
// success.
//
// There is no OAuth redirect any more — Stripe retired the Standard/OAuth path
// for new platforms, so there is no client_id to be had. The user creates a
// read-only key in her own dashboard and pastes it here instead.
//
// The key is passed straight through and never stored in the browser: not in
// localStorage, not in the store, not in a data attribute. The input that
// carried it is cleared by the caller the moment this returns.
export async function connectStripeKey(apiKey) {
    const trimmed = String(apiKey || '').trim();
    if (!trimmed) return 'Please paste your Stripe key first.';

    // The same two checks the function makes, done here so the obvious mistakes
    // are answered instantly and a secret key never leaves the browser at all.
    if (trimmed.startsWith('sk_')) {
        return 'That is a full secret key, which can move money. Please create a restricted key with read-only access instead — it starts with rk_.';
    }
    if (!trimmed.startsWith('rk_')) {
        return 'That does not look like a Stripe restricted key. It should start with rk_.';
    }

    const { error } = await window.db.functions.invoke('stripe-connect?action=connect', {
        method: 'POST',
        body: { apiKey: trimmed }
    });

    if (error) return await window.readFunctionError(error);
    return null;
}

export async function disconnectStripe() {
    const { error } = await window.db.functions.invoke('stripe-connect?action=disconnect', {
        method: 'POST'
    });
    if (error) return await window.readFunctionError(error);
    return null;
}

// Pull new sales. Returns { imported, scanned, truncated } or an error string.
export async function syncStripeSales() {
    const { data, error } = await window.db.functions.invoke('stripe-sync', { method: 'POST' });
    if (error) return { error: await window.readFunctionError(error) };
    return data || { imported: 0, scanned: 0 };
}

// `readStripeOutcome()` used to live here, translating the ?stripe=<code> that
// the OAuth callback redirected back with. There is no redirect any more — the
// connection happens inside one request from this page — so it was deleted
// rather than left to rot. Don't reintroduce it: a ?stripe= parameter arriving
// now would mean something has gone wrong, not something has succeeded.
