// importedSales.js
//
// The single source for sales imported from a payment processor, whichever one
// it was. Everything that displays or totals imported money reads from here.
//
// --- Why this file exists ----------------------------------------------------
//
// All of this used to live in stripeImport.js, back when Stripe was the only
// processor. That was fine until PayPal arrived (Pro item 10) and turned two of
// those functions into quiet bugs:
//
//   * `fetchImportedSales()` never filtered on `source`, so it was ALREADY
//     returning PayPal rows the moment the first one landed.
//   * `toEntryShape()` hardcoded `source: 'Stripe'`, so those rows would have
//     been labelled Stripe on the Revenue screen and in the Source Attribution
//     breakdown. Money in the right total, credited to the wrong processor.
//
// Neither would have thrown. The figures would simply have been wrong in a way
// only Jen could have spotted, which is the worst kind. So the read moved here,
// where it belongs to no processor in particular, and the label is derived from
// the row instead of assumed.
//
// Deliberately does NOT write imported sales into the planner store. The store
// is one JSON document written wholesale by the browser on every save, so
// merging server-owned rows into it would mean a sync could overwrite whatever
// the user typed a second earlier. Imported sales stay in their own table and
// are merged at read time for display.

// How a `source` value in the database is spelled on screen. The database holds
// lowercase identifiers ('stripe', 'paypal') because they are half of a unique
// constraint; a human reads "PayPal".
//
// Anything not listed falls back to a capitalised version of whatever the row
// says, so a third processor added server-side shows up under its own name
// rather than silently reading as the wrong one.
const SOURCE_LABELS = {
    stripe: 'Stripe',
    paypal: 'PayPal',
};

export function sourceLabel(source) {
    const key = String(source || '').toLowerCase();
    if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
    if (!key) return 'Imported';
    return key.charAt(0).toUpperCase() + key.slice(1);
}

// Sales imported for the signed-in user, newest first. Returns [] when nothing
// is connected, when the tables are missing, or when offline — this is
// decoration on top of the user's own data, so it must never break a screen by
// throwing.
export async function fetchImportedSales() {
    try {
        // Asked too early this returns nothing, and "no sales imported" is
        // indistinguishable from "not ready". See waitForSession().
        const session = await waitForSession();
        if (!session) return [];

        const { data, error } = await window.db
            .from('imported_sales')
            // `source` is not optional here. Without it every row shapes up as
            // Stripe — see the note at the top of this file.
            .select('source, external_id, amount, currency, occurred_at, description, product_name, product_id, customer_email, refunded')
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

// How many of the cached sales came from one processor. Used by the Account
// cards so each says how much IT brought in, rather than both quoting the same
// combined total and appearing to double-count.
export function countImportedFrom(source) {
    const key = String(source || '').toLowerCase();
    return importedSalesCache.filter(e => String(e.sourceKey || '').toLowerCase() === key).length;
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
    const key = String(row.source || 'stripe').toLowerCase();
    const label = sourceLabel(key);
    return {
        // Namespaced by processor. Two processors can and do issue ids in
        // different formats, but nothing guarantees they never collide, and the
        // database's own uniqueness is on (user_id, source, external_id) — so
        // the client key matches that or it is not really a key.
        id: `${key}:${row.external_id}`,
        date: String(row.occurred_at || '').slice(0, 10),
        amount: refunded ? 0 : gross,
        grossAmount: gross,
        refunded,
        // The ISO code the processor reported, carried through untranslated.
        //
        // This column was selected from the database from the beginning and then
        // dropped here, which is precisely how a $17 charge came to be added to a
        // sterling quarter as £17. Conversion happens at READ time in
        // mergeImportedSales(), not here: the rate lives in the store and the
        // user can change it, so baking a converted figure into the cache would
        // leave every screen quoting the old rate until the next sync.
        currency: String(row.currency || '').toUpperCase(),
        // The human label, which is what the Source Attribution breakdown groups
        // and displays.
        source: label,
        // The raw database value, kept alongside it so code that needs to filter
        // by processor does not have to reverse the label back into an id.
        sourceKey: key,
        offer: row.product_name || row.description || `${label} payment`,
        // What the processor called the thing that was bought. Both kept so the
        // product can be identified for offer matching — `product_id` was being
        // selected from the database and then dropped here, which is the same
        // shape of mistake that lost `currency`.
        //
        // ⚠️ `productId` is null far more often than you would expect. Six of the
        // eight rows on the first live account have none: they came through a
        // third-party checkout platform sitting on top of Stripe, which raises
        // charges with no Stripe product behind them. So the id can never be the
        // only key — see productKeyFor().
        productId: row.product_id || '',
        productName: row.product_name || row.description || '',
        type: 'sale',
        imported: true,
        customerEmail: row.customer_email || ''
    };
}

// --- Product to offer matching ----------------------------------------------
//
// A processor names things the way a processor does: "CEOPlanner", "Subscription
// update", "Payment to The Women's Entrepreneurial Network". Those names go
// straight into `offer`, which is what the revenue-by-offer breakdown, the top
// offer and the branded report all group by — so imported sales report under a
// different set of names from the ones the user logs by hand, and the two never
// add up together.
//
// The fix is to map PRODUCTS, not sales. A handful, once, and automatic
// afterwards: the cost does not grow with use, which is the whole reason this
// friction is acceptable when per-sale friction would not be.
//
// The mapping lives in `settings.productOffers` and is applied at READ time, in
// mergeImportedSales(). Never written into the imported rows — those belong to
// the processor, and rewriting them would mean a re-import silently undoing the
// user's choices.

// A stable identity for a processor product.
//
// Namespaced by processor, because two of them can and do issue ids in the same
// shape and nothing guarantees they never collide.
//
// Falls back to the NAME when there is no product id, which is not a rare path:
// on the first live account six of eight rows have no id at all. Lowercased,
// because a product that differs only in capitalisation is the same product, and
// two keys for it would split one offer's revenue across two rows.
//
// Returns null when there is nothing stable to key on, and a null key is never
// matched or offered — better to leave a sale under its raw name than to invent
// an identity for it that a later import might reuse for something else.
export function productKeyFor(entry) {
    if (!entry) return null;
    const source = String(entry.sourceKey || 'stripe').toLowerCase();

    const id = String(entry.productId || '').trim();
    if (id) return `${source}:id:${id}`;

    const name = String(entry.productName || '').trim();
    if (name) return `${source}:name:${name.toLowerCase()}`;

    return null;
}

// Rewrite one entry's `offer` to the user's own name for it, if they have set one.
//
// Returns a NEW entry, never mutates. `originalOffer` is kept so the Revenue feed
// can still show what the processor called it — somebody reconciling against a
// Stripe dashboard needs to find the row they are looking at.
export function applyProductOffer(entry, mapping) {
    if (!mapping) return entry;

    const key = productKeyFor(entry);
    if (!key) return entry;

    const mapped = mapping[key];
    // An empty string means "keep as is" and is stored deliberately rather than
    // deleted, so the Account card can tell a product the user has decided about
    // from one they have not seen yet.
    if (typeof mapped !== 'string' || mapped.trim() === '') return entry;
    if (mapped === entry.offer) return entry;

    return { ...entry, offer: mapped, originalOffer: entry.offer, mappedOffer: true };
}

// The distinct products present in the imported sales, for the Account card.
//
// Counts and totals come along so the card can be ordered by what actually
// matters — a product with 40 sales behind it is worth naming before one with a
// single refunded charge — and so the user can recognise a product they cannot
// remember by name.
//
// `amount` deliberately, not `grossAmount`: a product whose only sales are
// refunded or awaiting an exchange rate shows a total of 0, which is true and is
// the same figure the rest of the app is reporting for it.
export function importedProducts(entries) {
    const groups = new Map();

    (entries || []).forEach(e => {
        const key = productKeyFor(e);
        if (!key) return;

        const current = groups.get(key) || {
            key,
            // What the processor calls it. Read from the entry rather than
            // stored, so a product renamed in Stripe shows its new name here
            // without the mapping breaking — the key is the id, not the label.
            label: e.productName || e.offer || 'Untitled',
            sourceLabel: e.source || 'Imported',
            count: 0,
            total: 0
        };
        current.count += 1;
        current.total += parseFloat(e.amount) || 0;
        groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.count - a.count || b.total - a.total);
}

// Products the user has never been asked about.
//
// This is what makes the card appear on first import and then go away, and come
// back on its own when a new product shows up months later. A product mapped to
// "keep as is" holds an empty string, which counts as decided.
export function unmatchedProducts(entries, mapping) {
    const map = mapping || {};
    return importedProducts(entries).filter(p => typeof map[p.key] !== 'string');
}

// Pull the latest imported sales into the cache. Returns the cache.
export async function refreshImportedSales() {
    const rows = await fetchImportedSales();
    importedSalesCache = (rows || []).map(toEntryShape);
    importedSalesLoaded = true;
    return importedSalesCache;
}

// Wait for the signed-in session to be available.
//
// On a fresh page load the Supabase client restores the session from storage and
// may have to refresh an expired token over the network first. Anything asking
// "who is signed in?" during that window gets nothing back.
//
// The first version of this polled four times over 750ms, which was fine in
// Chrome and not nearly long enough in Safari: its tracking protection makes the
// token refresh a slower round trip, so the check gave up before the session
// arrived and the Stripe card reported "couldn't check your connection" on a
// perfectly good account. Same code, same data, different browser.
//
// So this no longer guesses a duration. It waits for Supabase to say the session
// is ready via onAuthStateChange, with polling only as a backstop and a generous
// ceiling. Waiting a few seconds in the rare slow case is invisible; telling
// someone their connection is broken is not.
//
// Lives here rather than in either processor's file because both need it, and
// two copies would eventually be tuned differently.
export async function waitForSession(timeoutMs = 8000) {
    const immediate = await getSessionSafely();
    if (immediate) return immediate;

    return new Promise(resolve => {
        let settled = false;
        let subscription = null;
        let poller = null;

        const finish = (session) => {
            if (settled) return;
            settled = true;
            if (poller) clearInterval(poller);
            if (timer) clearTimeout(timer);
            try { subscription?.unsubscribe(); } catch (err) { /* already gone */ }
            resolve(session);
        };

        const timer = setTimeout(() => finish(null), timeoutMs);

        try {
            const { data } = window.db.auth.onAuthStateChange((_event, session) => {
                if (session && session.user) finish(session);
            });
            subscription = data?.subscription;
        } catch (err) {
            // No listener available; the poller below still covers us.
        }

        // Backstop, in case the event fired before the listener attached.
        poller = setInterval(async () => {
            const s = await getSessionSafely();
            if (s) finish(s);
        }, 400);
    });
}

export async function getSessionSafely() {
    try {
        const { data: { session } } = await window.db.auth.getSession();
        return (session && session.user) ? session : null;
    } catch (err) {
        return null;
    }
}

// Read one processor's connection row.
//
// Returns { state, conn } rather than a bare row, because the three outcomes
// have to be told apart:
//
//   'connected' — here is the connection
//   'none'      — asked properly, there genuinely isn't one
//   'unknown'   — could not find out: no session yet, or the read failed
//
// This used to return null for all three, and every caller treated null as "not
// connected" and rendered the paste-your-key form. So a page opened a moment
// before the session was ready, or a dropped request, told the user her Stripe
// account had disconnected and asked her to set it up again — when nothing had
// been lost and the row was sitting in the database the whole time.
//
// 'unknown' must never render the connect form. Say you are checking, and retry.
//
// Shared by both processors so that hard-won behaviour is not re-derived, and
// re-broken, for each new one.
export async function fetchConnectionRow(table, columns) {
    const session = await waitForSession();
    if (!session) return { state: 'unknown', conn: null };

    try {
        const { data, error } = await window.db
            .from(table)
            .select(columns)
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (error) {
            console.warn(`Could not read ${table}:`, error.message);
            return { state: 'unknown', conn: null };
        }
        return data ? { state: 'connected', conn: data } : { state: 'none', conn: null };
    } catch (err) {
        console.warn(`Could not read ${table}:`, err.message);
        return { state: 'unknown', conn: null };
    }
}
