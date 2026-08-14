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

// Sales imported for the signed-in user, newest first. Returns [] when nothing
// is connected, when the tables are missing, or when offline — this is decoration
// on top of the user's own data, so it must never break a screen by throwing.
export async function fetchImportedSales() {
    try {
        const { data: { session } } = await window.db.auth.getSession();
        if (!session || !session.user) return [];

        const { data, error } = await window.db
            .from('imported_sales')
            .select('external_id, amount, currency, occurred_at, description, customer_email, refunded')
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

// Begin the OAuth handshake. Resolves to an error string, or navigates away.
export async function startStripeConnect() {
    const { data, error } = await window.db.functions.invoke('stripe-connect?action=start', {
        method: 'POST'
    });

    if (error) return await window.readFunctionError(error);
    if (!data || !data.url) return 'Could not start the connection. Please try again.';

    window.location.href = data.url;
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

// Outcome of the OAuth round trip, passed back by the edge function as
// ?stripe=<code>. Read once and cleared, so a refresh doesn't repeat the toast.
export function readStripeOutcome() {
    const match = /[?&]stripe=([^&#]+)/.exec(window.location.search);
    if (!match) return null;

    const hash = (window.location.hash || '').split('?')[0] || '#/account';
    window.history.replaceState({}, '', window.location.pathname + hash);

    const outcome = decodeURIComponent(match[1]);
    const messages = {
        connected: { text: 'Stripe connected. Your sales will start appearing here.', type: 'success' },
        cancelled: { text: 'No problem, nothing was connected.', type: 'info' },
        expired: { text: 'That took a little too long, so the link expired. Please try connecting again.', type: 'error' },
        failed: { text: "We couldn't finish connecting to Stripe. Please try again, or contact support if it keeps happening.", type: 'error' }
    };
    return messages[outcome] || null;
}
