// currency.js
//
// One currency, two vocabularies. The app has always stored `settings.currency`
// as a *symbol* — '£', '$', 'A$' — because that is what gets printed in front of
// every figure. Stripe and PayPal report an ISO *code* — 'GBP', 'USD', 'AUD' —
// because that is what a payment processor deals in. Nothing translated between
// the two, which is why imported sales in a foreign currency were being added
// to the quarter total as though 1:1.
//
// That is the bug this file exists to close. It was dormant rather than
// harmless: the only imported data was 8 USD rows on an account whose currency
// was already '$', so nothing was visibly wrong. It would have gone wrong the
// first time anyone's app currency differed from the currency they were paid in
// — and gone wrong *silently*, in the total the whole product is sold on.
//
// The rule, decided in the plan and worth restating because it is the part that
// is easy to get wrong under pressure:
//
//   **No rate set means flagged and excluded, never guessed.**
//
// A visible "3 sales in USD need a conversion rate" beats a quarter total that
// is quietly 20% out. Someone who can see the gap can close it; someone looking
// at a confidently wrong number cannot.
//
// There is deliberately **no FX API**. No external dependency to go down, no
// rates drifting underneath the user, and no explaining why last month's report
// no longer reproduces. The user sets the rate and stays in control of it.

// The one definition. `js/screens/settings.js` renders its dropdown from this,
// so the list of currencies a user can pick and the list this file can translate
// cannot drift apart.
//
// `symbol` is what `settings.currency` holds and what gets printed; `code` is
// what a processor reports. '$' means USD here, which is what the settings
// dropdown has always said out loud — the Australian and Canadian dollars carry
// their own distinct symbols precisely so this mapping stays unambiguous.
export const CURRENCIES = [
    { symbol: '£', code: 'GBP', label: '£  British Pound (GBP)' },
    { symbol: '$', code: 'USD', label: '$  US Dollar (USD)' },
    { symbol: '€', code: 'EUR', label: '€  Euro (EUR)' },
    { symbol: 'A$', code: 'AUD', label: 'A$  Australian Dollar (AUD)' },
    { symbol: 'C$', code: 'CAD', label: 'C$  Canadian Dollar (CAD)' },
    { symbol: 'R', code: 'ZAR', label: 'R  South African Rand (ZAR)' }
];

// Symbol -> ISO code. Unknown symbols fall back to USD, matching the app's own
// default currency, so a store written by some future version with a symbol this
// one has never heard of still behaves rather than throwing.
export function currencyCodeFor(symbol) {
    const match = CURRENCIES.find(c => c.symbol === symbol);
    return match ? match.code : 'USD';
}

// ISO code -> symbol, for printing a foreign amount in its own money. Falls back
// to the code itself, which reads perfectly well ("converted from BRL 40.00")
// and is honest about not knowing the symbol.
export function currencySymbolFor(code) {
    const key = String(code || '').toUpperCase();
    const match = CURRENCIES.find(c => c.code === key);
    return match ? match.symbol : key;
}

// The code the user's own figures are in.
export function baseCurrencyCode(store) {
    return currencyCodeFor((store && store.settings && store.settings.currency) || '$');
}

// A stored rate, or null.
//
// Rates live in `settings.conversionRates` as
//
//     { USD: { rate: 0.79, base: 'GBP' } }
//
// and the `base` is not decoration. Without it, a user who sets "1 USD = 0.79"
// while working in pounds and later switches the app to euros would keep the
// 0.79 and get euro totals computed at a sterling rate — wrong, and invisible,
// which is the exact failure this whole file exists to prevent. A rate whose
// base no longer matches is treated as **not set**, so the sale is flagged and
// the user is asked again. Flag, never guess, applies to our own stale data as
// much as to a currency we were never given a rate for.
export function conversionRateFor(store, code, base) {
    const rates = (store && store.settings && store.settings.conversionRates) || {};
    const entry = rates[String(code || '').toUpperCase()];
    if (!entry || typeof entry !== 'object') return null;

    const rate = parseFloat(entry.rate);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    if (entry.base !== base) return null;

    return rate;
}

// Convert one imported entry into the user's own currency.
//
// Returns a NEW entry — never mutates. Three outcomes:
//
//   same currency  -> returned untouched, no flags, no conversion note
//   rate available -> `amount` and `grossAmount` converted, the originals kept
//                     on `originalAmount` / `originalCurrency` so the feed can
//                     say "converted from $17.00"
//   no rate        -> `amount` forced to 0 and `needsRate` set. The row still
//                     appears in the feed with its original figure, because a
//                     sale that vanishes looks like a bug — the same reasoning
//                     that keeps a refunded charge visible at zero.
//
// Rounded to 2dp. Carrying fifteen decimal places of a user-typed rate into a
// money total produces figures that do not add up on screen.
export function convertImportedEntry(entry, base, store) {
    const code = String(entry.currency || '').toUpperCase();

    // No currency recorded at all — an older row, or a processor that did not
    // report one. Treated as already in the user's currency, which is what the
    // app did for every row before this file existed. Changing that would
    // retroactively zero data that has been counted for weeks.
    if (!code || code === base) return entry;

    const rate = conversionRateFor(store, code, base);
    const gross = parseFloat(entry.grossAmount != null ? entry.grossAmount : entry.amount) || 0;

    if (rate === null) {
        return {
            ...entry,
            amount: 0,
            originalAmount: gross,
            originalCurrency: code,
            needsRate: true
        };
    }

    const round = (n) => Math.round(n * 100) / 100;

    return {
        ...entry,
        amount: round((parseFloat(entry.amount) || 0) * rate),
        grossAmount: round(gross * rate),
        originalAmount: gross,
        originalCurrency: code,
        converted: true
    };
}

// What to tell the user they need to do, grouped by currency.
//
// Refunded rows are deliberately left out of the count. They contribute zero to
// the total whether or not a rate exists, so listing them would ask someone to
// fix something that is not affecting any number they can see — and the prompt
// only keeps its force while every line in it is true.
//
// Returns [{ code, symbol, count, originalTotal }], commonest first.
export function unconvertedSummary(entries) {
    const groups = new Map();

    (entries || []).forEach(e => {
        if (!e || !e.needsRate || e.refunded) return;
        const code = String(e.originalCurrency || '').toUpperCase();
        if (!code) return;

        const current = groups.get(code) || { code, symbol: currencySymbolFor(code), count: 0, originalTotal: 0 };
        current.count += 1;
        current.originalTotal += parseFloat(e.originalAmount) || 0;
        groups.set(code, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

// Every foreign currency present in the imported sales, whether or not it has a
// rate yet. This is what the Settings screen builds its rate inputs from, so
// somebody sees six empty boxes for currencies they have never been paid in.
export function foreignCurrenciesPresent(entries, base) {
    const codes = new Set();
    (entries || []).forEach(e => {
        const code = String((e && e.currency) || '').toUpperCase();
        if (code && code !== base) codes.add(code);
    });
    return Array.from(codes).sort();
}
