# CEO Planner — Upgrade Plan (Phase 1 hardening, pre-Pro)

Findings from a full codebase audit on 13 Aug 2026. Line numbers were accurate at
that date — if a file has since changed, search for the quoted code rather than
trusting the number.

**How to use this:** work one batch per session, starting a fresh session each time.
Batches are grouped by *file*, not by priority, because opening a large file costs
the same whether you fix one thing in it or six. Say "do batch 2" and nothing else —
the detail is all here, so no re-auditing is needed.

Rebuild the bundle once at the end of each session (see [CLAUDE.md](CLAUDE.md)).

---

## ⏭️ PENDING — the next thing we do, once the upgrade is finished

**Agreed with Jen, 17 Aug 2026.** After the remaining Pro items ship, the next
job is a **full end-to-end test project against real signed-in accounts** — the
same shape as Batch 7, covering everything built across the whole programme.

Do not start it early and do not fold it into a feature session. It is its own
piece of work, and its value comes from running against the finished thing.

### ✅ 1. TRIALS NEVER END — FIXED 19 Aug 2026

**Was:** every account was on a free trial that never expired, so nobody had ever
been asked to pay. `profiles.trial_ends_at` had no column default and nothing on
the signup path set it until the trigger was corrected on 13 Aug, so 11 of 13
rows were NULL — and every access check read NULL as "no end date, no expiry".
Derina, the one real customer, was 62 days into a 14-day trial. Zero accounts had
ever reached `trial_expired`.

`plan_tier` being `'base'` on every row was the other half: trials were the only
thing granting Pro, so expiring them without a comp mechanism would have taken
Pro off every account at once. Both landed together, as required.

#### What shipped

**Database** — `supabase/migrations/20260819_trial_expiry_and_comp_pro.sql`,
applied live as migrations `trial_expiry_and_comp_pro` and
`lock_down_access_gate_rpcs`. `supabase/setup.sql` updated to match for a fresh
install.

- `trial_ends_at` now defaults to `now() + 14 days`.
- New `profiles.comp_pro boolean not null default false`.
- Backfill: 14 days **from the fix date** for the 11 NULL trialing rows, so they
  all end 2 Sept 2026. `test_paywall@example.com` was skipped deliberately — it
  is `past_due`, and a trial date would have handed it access back.
- `derina@ntlworld.com` set `comp_pro = true`.
- `account_access()`: a NULL `trial_ends_at` on a `trialing` row now **denies**;
  `comp_pro` grants access and tier `'pro'` outright.
- `has_active_access()` was still carrying its own copy of the rule, NULL hole
  and all. It is now a one-line wrapper around `account_access()`.
- `handle_new_user()`: the Stripe-first branch used to insert a NULL clock on the
  reasoning that "Stripe owns their billing clock". Safe only while NULL meant
  unlimited — it now means denied, so that branch would have locked out a
  customer who paid before registering. It stamps 14 days unless the status is
  already `active`.
- `account_access()` and `is_pro_account()` were executable by `anon` and
  `authenticated`. Both take a user id and run SECURITY DEFINER, so anyone with
  the public anon key could ask about somebody else's account. Now service role
  only. Nothing in the browser calls either.

**Edge functions** — all three deployed via MCP.

- `stripe-sync` (v11) and `paypal-sync` (v3): the duplicate inline gate is gone,
  replaced by an `is_pro_account()` RPC. That inline copy was the only one that
  disagreed with the canonical rule — it read `trialing` as Pro without ever
  looking at `trial_ends_at`, so a lapsed trial could still import.
- `stripe-webhook` (v18): it nulled `trial_ends_at` for `trialing` **and**
  `active`. Under the new rule that would lock a Stripe-trial customer out on the
  spot. It now nulls only for `active`, copies Stripe's own `trial_end` across
  for a Stripe trial, and leaves the column untouched if Stripe reports a trial
  with no end date.

**Client** — `js/supabaseClient.js`, `js/components/proGate.js`,
`js/components/nav.js`, `js/screens/billing.js`; bundle rebuilt at **v83**
(`index.html`, `sw.js` `CACHE_NAME` and `?v=` all bumped), and every changed file
synced into `github_deployment/` and hash-verified.

- `refreshAccessState()` selects `comp_pro`, treats a missing trial clock as
  expired rather than infinite, and caches `ceo_comp_pro`.
- `isLockedOut()` returns false for a comped account. Deliberately **not** done
  by rewriting the status to `'active'`: a comped account whose clock has run out
  should still be able to open `#/billing` and subscribe, and `app.js` sends
  `active` accounts away from that screen.
- `isProTrial()` excludes a comped account, so Derina gets no "14 days left" pill
  and no trial wording on the plan card for something that is not going to end.
- `ceo_comp_pro` is cleared on both sign-out paths and by `reconcileAuthState()`.
  Left behind, it would comp whoever signed in on that browser next.

#### Verified

Against the live database, on real rows, before and after:

| Case | has_access | tier | is_pro |
|------|-----------|------|--------|
| Before the migration, all 13 accounts | 12 true | all pro | 12 |
| After the migration, all 13 accounts | 12 true | all pro | 12 |
| Trial set 1 minute in the past | **false** | — | **false** |
| NULL clock on a trialing row | **false** | — | **false** |
| comp_pro + `active` + `plan_tier='base'` | true | **pro** | **true** |

`consume_ai_quota` returns `no_access` for the expired trial and consumes nothing.
The last row is Derina's exact future state: paying Base, still Pro, and the
webhook cannot overwrite it. The test row (`test@example.com`) was restored.

The client half was exercised by running the real `refreshAccessState()` and
`isLockedOut()` out of `js/supabaseClient.js` under a stub in node — a live
trial, an expired one, a NULL clock, active base, active pro, past_due, and all
three of Derina's states. All nine behave as the table above.

Both sync functions and the webhook were smoke-tested over HTTP after deploying
and answer from their own bodies (401 / 400), so nothing failed to boot.

#### Who is comped

Two accounts, both set by hand, both agreed 19 Aug 2026:

| Account | Why |
|---------|-----|
| `derina@ntlworld.com` | The one real customer. Pro permanently while paying Base. |
| `hello@thewomensentrepreneurialnetwork.com` | Jen's own account. Migration `comp_pro_jen_owner_account`. |

Everything else was left on the 2 Sept clock deliberately — the owner of the
product losing access to the product is not a useful test of the paywall, and
the remaining accounts still serve that purpose.

#### ⚠️ One thing left: the paywall has still never fired

Every check above proves an account is correctly *refused*. None proves the
screen it lands on behaves. `test_paywall@example.com` is `past_due`, which is a
**different code path** from `trial_expired`. This needs a browser and a
signed-in account, which is why it could not be done here.

**It is now scheduled to happen by itself**, on accounts nobody minds:

| Account | Trial ends |
|---------|-----------|
| `hello+ceoplannertest@thewomensentrepreneurialnetwork.com` | 27 Aug 2026 |
| `hello+consultant@thewomensentrepreneurialnetwork.com` | 28 Aug 2026 |

Sign in on the first one on 27 Aug and watch what it does. To see it sooner,
set that profile's `trial_ends_at` two minutes out instead of waiting.

**The v83 bundle must be live before 2 Sept.** The backfill alone is enough to
make even the old v82 client expire a trial correctly — it reads `trial_ends_at`
itself, and every row now has one. What v82 does **not** know about is
`comp_pro`. So if the push has not happened by 2 Sept, the database will grant
Derina and Jen access while their browsers show them the paywall.

### 2. PayPal scope reduction — parked 19 Aug 2026

Not urgent and not blocking: the import works. The open question is whether a
PayPal REST app can be made genuinely read-only.

Two attempts to untick the extra Features on an existing app both failed to save
(`c8a0c3d0bffc5`, then `37e65bf6c6cca` with "Log in with PayPal" already off).
Next thing to try is a **brand new app with only Transaction Search ticked from
creation**. If that also grants payouts and refund scopes, PayPal does not permit
a read-only app — record it, leave `REFUSE_WRITE_SCOPES` false permanently, and
**change the Account card copy**, which currently tells the user to do exactly
the thing that does not work.

Full detail in the item 10 section further down.

### Coach memory (item 5) — the part no automated check could reach

Written down while it was fresh. Every one of these needs a **real signed-in
account**, which is exactly why the build session could not verify them: the
house rule is never to browser-test against a signed-in account, because
`saveStore()` upserts to the live `user_data` row on every save.

1. **Send a message, hard-refresh, reopen the chat.** The thread should still be
   there. This is the whole feature in one action.
2. **Confirm a reply actually uses the earlier context.** Ask something, come
   back later and say *"what was that second thing you suggested?"* This is the
   one that proves the 12-message window is reaching the model rather than the
   display merely restoring. A thread that renders but is answered blind would
   look identical on screen and would be the worst possible failure here.
3. **Sign in on a second device.** A thread started on the laptop should be
   waiting on the phone. This comes free from the store sync, and it is the part
   with the least evidence behind it.
4. **The Reset button.** It now deletes permanently and everywhere, and the
   confirm dialog says so. Check the wording matches what it does.
5. **A base account still sees the teaser** and still loses its thread on
   refresh.
6. **The 413 input ceiling** (`chat` function v15). Never exercised live, because
   the gateway's auth check runs before the function body, so reaching the guard
   needs a real token. Boundaries were checked in isolation only — see the
   deployment section.

### PayPal import (item 10) — needs a real payment, agreed with Jen 19 Aug 2026

The exclusion half is **already proven on live data** and does not need redoing.
On 19 Aug the first real connection scanned 24 transactions over 120 days and
imported none of them — correctly. Every code was checked against PayPal's own
T-code reference:

| Code | What it is | Count |
|------|------------|-------|
| `T0003` debit | Preapproved recurring bills — Jen *paying* subscriptions | 11 |
| `T0700` credit | "Purchase with a credit card" — funding her own balance | 9 |
| `T0300` credit | Bank deposit into the PayPal balance | 2 |
| `T0302` credit | ACH funding | 1 |
| `T1104` debit | Reversal of an ACH deposit | 1 |

Two things that finding proves, both worth keeping:

- The eleven `T0003` rows **passed** the `T00xx` prefix test and were caught only
  by the "must be a positive amount" check. That second layer is load-bearing,
  not decoration — without it eleven of Jen's own outgoing subscription payments
  would have been booked as income.
- The twelve credits are all balance top-ups. Filtering on "money in" rather than
  on event codes would have inflated revenue by every one of them.

**What has never been exercised is the positive path.** These are the checks that
need a real payment, and they are the reason `PAYPAL_IMPORT_LIVE` is still false:

1. **Send a small real payment** to the PayPal business account from outside it
   (PayPal.Me or an invoice, paid from a personal account or card — a payment
   from the same account is not recorded as a payment received). Wait: PayPal
   takes **up to three hours** to expose a transaction to the reporting API,
   which is what the six-hour overlap exists for. A sale that is not there yet
   is not a bug.
2. **Import it** from Account → Import sales now. Check the amount, the currency
   and the date against what PayPal itself shows.
3. **Check the product name resolved.** It should read as the item or invoice
   subject, not as a generic string. This is the `cart_info` path and it has
   never met a real basket.
4. **Check it is labelled PayPal, not Stripe**, on the Revenue feed — the exact
   bug the `importedSales.js` refactor was written to prevent.
5. **Refund it in PayPal, then import again.** The refunded sale should read as
   refunded rather than as revenue. This is the `T11xx` → `paypal_reference_id`
   match, the piece with the least evidence behind it.
6. **Import twice with no new activity.** The second run must import nothing.
   Idempotency is what stops a double-counted sync corrupting every figure.

If a payment does not appear, call the sync with `?debug=1` before changing any
code. It returns a tally of event codes, statuses and credit/debit — no amounts,
no names, no ids — which is what turned "0 imported" from a mystery into the
table above.

### Redo one week (item 6) — the same list, for the same reason

1. **Rewrite a week and read what comes back.** The build session stubbed the
   model call, so the prompt has never met the real thing. The failure to watch
   for is the old week reworded — rule 4 forbids it, and only a real run shows
   whether that holds.
2. **Check it reads like the rest of the quarter.** It is written from the same
   context block as the 90-day plan, so a week that sounds like a different app
   wrote it means the extraction has drifted.
3. **Use it, then open the Weekly Planner.** The rewritten week should hydrate
   the planner exactly as an original generated week does — same fields, same
   apply flow.
4. **Rewrite the same week twice.** The second answer should differ from the
   first; identical output means the note and the current-week context are not
   reaching the model.
5. **Confirm an applied week is still untouchable** on a real account with real
   history: no Redo button on the roadmap, and it does not appear in the picker.

⚠️ **Testing on Jen's own account leaves real conversations in it.** That is the
feature working, not test pollution, but it is a good reason to use a test
profile if the real coach thread should stay clean. See the warning in
[CLAUDE.md](CLAUDE.md) about what a verification run has already written into
her account once.

---

## Batch 7 — Live user testing and fixes ✅ done 14 Aug 2026

Three personas were run end to end against real Supabase accounts: a UK consultant
(£), an e-commerce brand ($, 44 pipeline events), and a beginner content creator (€,
zero revenue). Batches 1–6 all held up. Seventeen issues were found; the following
were fixed and verified in the browser. **Cache is now bundle v19 / CSS v13.**

**Fixed**

- **Next Best Action ran on the calendar alone** ([dashboard.js](js/screens/dashboard.js)).
  `if (day === 5 || (day === 6 && activePlan))` told every brand new user to "close
  out the week strong" and kept saying it after they had reviewed. Rewritten to check
  what has actually happened: new rules for *never planned a week* (outranks all
  calendar rules) and *it's your planning day* — both linking to `#/monday-plan`,
  which previously had no link anywhere in the app — plus a *week closed out* state.
  The Friday rule now requires an active plan and no review since `getWeekStart()`.
- **Quarter-complete rule** measured 90 days from `weeklyPlans[0].date`; now uses
  `quarterStartDate`, so regenerating a roadmap no longer moves the finish line.
- **Beginner's first dashboard read as failure.** The pace alert fired at "100%
  behind target" on day one, and its one hardcoded suggestion told a *Just starting
  out* user to contact "your 3 most loyal past clients". Suggestions are now
  stage-aware, and week one with nothing logged shows an encouraging "First Move"
  pulse instead of a red alert.
- **Signup and login adopted other people's data** ([auth.js](js/screens/auth.js)).
  Signup never cleared `ceoPlanner_store`; login only overwrote it when a cloud row
  existed and used `.single()`, which throws when it doesn't. Both now clear local
  storage first, and login uses `.maybeSingle()`.
- **Backdated sales inflated the projection ~4x.** `getRevenueInsights()` summed all
  entries but divided by weeks since the quarter start. Quarter figures now use
  `quarterEntries`; `entries` stays complete for the feed, chart and CSV, and the
  Revenue screen shows what was logged before the quarter as a separate line.
- **Currency could never be changed after onboarding.** Added a selector to Settings
  (`SETTINGS_CURRENCIES` must stay in sync with `CURRENCIES` in wizard.js).
- **Currency symbols and the Monday Plan "1. 2. 3." markers were invisible** in six
  places — `.form-input` has `backdrop-filter`, which paints over an absolutely
  positioned prefix. Fixed with `z-index: 1` on each prefix.
- **Nav overflowed between 769px and 1078px**, pushing Log Out off screen. The
  hamburger breakpoint moved from 768px to 1080px.
- **Hidden tooltips made every page scroll sideways.** `.tooltip-content` was
  `visibility: hidden` but still laid out at 280px. Now `display: none`/`block`,
  which costs the fade-in. `overflow-x: clip` on `html` or `body` does *not* fix
  this — it was tried and does not stop the scroll.
- **Toasts and confirms sat under the AI chat widget** (1000/1001 vs 9999), leaving
  confirm buttons unclickable. Now 10000/10001.
- **The planning streak could never increase.** Only `addWeeklyPlan()` recalculated
  it, but applying a generated week goes through `updateWeeklyPlan()`. Both now
  recalculate, counting only weeks the user applied or wrote themselves.
- **Executive Report ignored currency and was gratuitously harsh** — the prompt asked
  for "brutally honest" and returned "abysmal" to a week-one user. Tone now matches
  the 90-day plan prompt, and the currency and business stage are passed in.
- **Commitment field was pre-filled rather than placeholdered**, so typing appended to
  the default and the dashboard showed two sentences run together.
- **AI weekly priorities overflowed their inputs** at 155 characters; the plan prompt
  now caps them at 70 and forbids the "Task:/Execution:" format.
- Money now keeps its pence (`£1,500.50`, not `£1,500.5`) via `formatAmount()` in
  store.js, and Call Close Rate shows an em dash rather than a phantom 100% when no
  calls have been logged.

**Second pass, same day — the minor list**

- **Monday Plan step 4 suggestions were nonsense.** `breakdownTask()` matched
  keywords as bare substrings, so "de**live**rables" hit the webinar rule, "leads"
  (people) hit the lead-magnet rule, and "content" beat "landing page" purely by
  listing order. Rewritten with word boundaries, specific-before-general ordering,
  and no `Math.random()`. More importantly, `generateDaily3Suggestions()` now uses
  the `daily3` the AI already wrote for that week (stored by `applyGeneratedPlan`
  and previously ignored), falling back to the user's own words with the
  "Task:/Execution:" scaffolding stripped rather than inventing a task.
- **Revenue logging tab now survives a save** (`activeLogTab` module state).
- **Quarter Reset returns the wizard to step 1** via `resetWizardProgress()`.
- **Roadmap summary** now sits on a glass surface with full-strength text.
- **Commitment field** has an explainer, a worked example, and is explicitly optional
  (it was `required`, so the most abstract question in the wizard could block a
  beginner from finishing onboarding).
- **CSV export rebuilt.** Was three stacked sections with locale-formatted dates,
  which cannot be sorted or pivoted and which Excel misreads past the 12th of the
  month. Now one RFC 4180 table: `Type, Date (ISO), Amount, Currency, Source, Offer,
  Calls, Closes, Traffic, Social Audience, Counts Toward This Quarter, Notes`, with
  amounts as bare numbers so spreadsheets treat them as numeric, proper quote
  escaping, and a filename carrying the business name and date. No totals row on
  purpose — it would sit inside the data and break sorting and pivot tables.
  The `Counts Toward This Quarter` column exposes the quarter-scoping rule from the
  projection fix, so a user can see why a backdated sale is excluded.

⚠️ **Escaping trap, cost an hour:** writing JS regexes through a shell heredoc or
`python -c` mangled every `\b` into a literal backspace byte (0x08), silently
breaking all 25 word-boundary patterns while the file still *looked* correct in
`grep`. Check with `python -c "print(open(f,'rb').read().count(b'\x08'))"` after any
scripted edit that writes regexes, or use the editor tools instead.

**Production audit, 14 Aug 2026 — after the first push**

The first push put the app in a `ceo_planner_app/` subfolder while GitHub Pages
serves the repo **root**, so live users were still on the pre-batch-1 build (v11)
even though Pages had rebuilt. The deployment folder is now flat: its contents map
1:1 onto the repo root. **Always verify a deploy by checking which `?v=` the live
`index.html` requests** — Pages rebuilding is not the same as your code shipping.

Two production-only problems, invisible from the codebase:

- **`user_data` had no DELETE policy.** The live table was hand-created in the
  dashboard with select/insert/update only (its policy names differ from
  `setup.sql`, which is how it was spotted). With RLS on and no DELETE policy, the
  cloud delete in Settings → Erase All Data matched zero rows and returned **no
  error**, so the app reported success and the row survived — the guide's permanent
  deletion promise, and a UK GDPR erasure claim, unmet. Policy added via migration
  `add_user_data_delete_policy` and verified both ways: a stranger deletes 0 rows,
  the owner deletes 1.
- **The deployed `chat` function was a revision behind the repo.** It had the rate
  limiter but not the later fixes: it returned **200** on error (so the client read
  failures as successes and crashed on `data.choices[0]`), and lacked the
  `no_profile` → 403 branch and the "X of Y, resets at midnight UTC" message.
  Redeployed from the repo as version 8 and smoke-tested.

Confirmed healthy in production: `consume_ai_quota` wired and **counting** (8 calls
logged during the persona run), `user_data` present with correct RLS, all public
tables RLS-enabled. `ai_usage` and `allowed_signups` show as "RLS enabled, no
policies" in the linter — that is deliberate, they are service-role only.

**Not actionable — do not raise again.** `get_advisors` reports Leaked Password
Protection as a WARN, but it is **gated behind the Supabase Pro plan** and this
project is on Free. The advisor gives no hint of that, so it will keep appearing in
security output. Treat it as known and deliberately not actioned, not as a task.

**Done 14 Aug 2026:** the duplicate `/ceo_planner_app/` copy is retired. Its
`index.html` was deleted, so the path 404s and the copy is unreachable; the ~34
orphaned files behind it are inert and can be cleared with the `.` web editor
whenever convenient.

**Icons, 14 Aug 2026.** `favicon.ico` never existed despite being referenced by both
`index.html` and `manifest.json`. Built from Jen's 512px "CEO" mark. At 16px the
three letters are an illegible smudge, so the `.ico` carries **different artwork per
size**: the "C" (cropped from her own wordmark, nothing invented) at 16 and 32, the
full "CEO" at 48 and 64. Pillow cannot do this — its ICO writer derives every frame
from one image and will not upscale past the source — so the container is assembled
byte-wise in the build script. Also added `apple-touch-icon.png` (180),
`icon-192.png` and `icon-512.png`, and **removed the flaticon.com CDN dependency**
from `manifest.json` and from the three notification calls in `app.js` and
`settings.js`.

**Known and not yet fixed**

- The AI chat panel covers the Revenue form column when open at laptop widths. This
  is conventional overlay behaviour for a chat widget and it is dismissible, so it is
  listed as a known trade-off rather than a defect.
- `An invalid form control with name='' is not focusable` in the console. Traced to
  `required` fields inside hidden containers: the chat widget input (every screen),
  the quick-sale modal, and the hidden Revenue tab forms. In every case the invalid
  field is inside the *visible* form at submit time, so no user-facing failure could
  be reproduced. Left alone deliberately — disabling and re-enabling hidden fields
  would add a re-enable bug for no proven gain.
- Friday Reviews survive a quarter reset while revenue and leads are archived; the
  archive stores only `reviewsCount`, so old reviews aren't tied to their quarter.
- ~~**AI "Task Breakdown" and the Quiet Advisor are still keyword engines**~~ —
  they suggested slide decks and lead magnets to an HR consultant. ✅ **Fixed
  17 Aug 2026** by Pro item 4. They are still keyword engines on the base plan,
  which is now a stated free/Pro line rather than an unmarked limitation: the
  card next to each one says so.

---

## Batch 1 — Backend safety ✅ done 13 Aug 2026

**Files:** `supabase/functions/chat/index.ts`, `supabase/setup.sql`
**Why first:** uncapped AI spend is the only issue here that costs real money every
day it stays open. Both files are small, so this is a cheap session.

### 1.1 Wire up the AI rate limiter (highest priority in the whole plan)

`consume_ai_quota` is fully written at `supabase/setup.sql:92` — atomic, handles
trial vs paid limits (30/day trial, 120/day paid), safe against races. **Nothing
calls it.** The chat function only checks `has_active_access`
(`supabase/functions/chat/index.ts:48`), so there is currently no per-user ceiling on
OpenAI spend.

Replace the `has_active_access` RPC call with `consume_ai_quota`, which checks access
*and* consumes quota in one call so the two can't drift apart. It returns
`(allowed, reason, used, quota)`. Map the reasons to responses:

| reason | status | message |
|---|---|---|
| `no_profile` | 403 | Account not fully set up. Contact support. |
| `no_access` | 402 | Existing trial-ended copy (keep current wording) |
| `rate_limited` | 429 | "You've used your AI allowance for today (X of Y). It resets at midnight UTC." |

Note the RPC returns a table, so the result arrives as an array — read `data[0]`.

Also fix the catch block at `supabase/functions/chat/index.ts:103`: it returns
**status 200** on error, which defeats the client's error handling.

### 1.2 Add the missing `user_data` table

The entire cloud sync depends on a `user_data` table (`js/store.js:122`,
`js/screens/auth.js:223`) that **does not exist in `setup.sql`**. It was presumably
created by hand in the Supabase dashboard. Rebuild the project from this repo and
sync silently degrades to a `console.warn`.

Add to `setup.sql`: table (`user_id` uuid PK referencing `auth.users` on delete
cascade, `data` jsonb, `updated_at` timestamptz), RLS enabled, and policies for
select / insert / update restricted to `auth.uid() = user_id`.

---

## Batch 2 — Data integrity ✅ done 13 Aug 2026

**File:** `js/store.js` only (661 lines, one file open, four fixes)
**Why:** two of these destroy user data, and the third makes the app's central
analytical claim wrong. All three block Pro features that depend on history.

### 2.1 Quarter Reset destroys revenue history

`js/store.js:575` empties `revenue.entries` on reset. Combined with
`js/screens/quarterReset.js:85` — which explicitly throws away the four reflection
answers it just collected ("In a full app, we'd save `pastQuarter`") — a user loses
90 days of financial data and four thoughtful paragraphs in one click.

Fix: `resetQuarter()` should accept the reflection object and archive **entries,
leads, metrics and reflection** into `pastQuarters` before clearing the active set.
`js/screens/quarterReset.js` should pass its `reflection` object in (it already
builds one at line 68 and then discards it) and import `getStore` properly.

This unblocks the Pro "year view / quarter-over-quarter" feature — every quarter
shipped without it is data that can never be shown to anyone.

### 2.2 Plan regeneration wipes all weekly plan history

`js/store.js:468` does `store.weeklyPlans = []` before writing the 12 new weeks.
The dashboard button behind it (`js/screens/dashboard.js:820`) is guarded only by a
browser `confirm()`. Someone eight weeks in who wants to course-correct loses every
completed plan.

Fix: preserve plans where `applied === true` (or `!generated`), and replace only the
unapplied generated weeks from the current week forward.

### 2.3 Projection maths doesn't measure time

`js/store.js:313`: `avgPerWeek = totalRevenue / entriesCount`, then
`projectedRevenue = avgPerWeek * 12`. `entriesCount` is the number of *sales logged*,
not weeks elapsed. Log five sales in week one and the app projects as though five
weeks had passed, and reports "Behind". `weeklyTargetLength` has the same flaw
(`remainingWeeks = 12 - entriesCount`, line 318).

This drives: the Momentum badge, the dashboard Pace Alert pulse, the Revenue page
Pace Warning, and the figures sent to the AI Executive Report. It is the app's core
analytical claim.

Fix: add a `quarterStartDate` to the store (set on wizard completion and on quarter
reset; backfill from the earliest weekly plan or revenue entry for existing users).
Derive `weeksElapsed = clamp(1..12, ceil((now - quarterStart) / 7 days))` and compute
`avgPerWeek = totalRevenue / weeksElapsed`, `remainingWeeks = 12 - weeksElapsed`.

### 2.4 Inconsistent week boundaries

`js/store.js:242` starts the week on **Monday**; the revenue chart at
`js/screens/revenue.js:806` starts it on **Sunday**. Same screen, two different weeks.
Export a single `getWeekStart(date)` helper from `store.js` (Monday) and use it in
both places. Revenue page change can be deferred to batch 5 if preferred.

---

## Batch 3 — Security, auth and notifications ✅ done 13 Aug 2026

**Files:** `js/screens/auth.js`, `js/components/nav.js`, `js/screens/settings.js`,
`js/app.js` (all small — cheap session, high value)

### 3.1 Plaintext password in localStorage

`js/screens/auth.js:247` stores the raw password under `ceo_remembered_password` when
"Remember password" is ticked, and reads it back at line 119. Readable by any script,
extension, or person with the device.

Fix: remember the **email only**. Supabase already persists the session, so the
password never needs storing. Delete both the write and the read, relabel the
checkbox "Remember me", and clear any existing `ceo_remembered_password` key on next
load so it doesn't linger in users' browsers.

### 3.2 Logout doesn't sign out

`js/components/nav.js:30` is an inline `onclick` that clears localStorage but never
calls `window.db.auth.signOut()` — the Supabase `sb-*-auth-token` survives. Replace
with a proper handler mirroring the (correct) sign-out in
`js/screens/billing.js:135`.

### 3.3 "Erase All Local Data" doesn't erase the cloud copy

`js/screens/settings.js:459` removes the localStorage key only. The `user_data` row
stays in Supabase. Meanwhile `USER_GUIDE.md:118` promises it "will permanently delete
your plans, revenue logs, and profile" — a UK GDPR erasure claim that isn't currently
honoured.

Fix: delete the `user_data` row for the user first, then clear local storage. If the
delete fails, tell the user rather than failing silently.

### 3.4 Notifications never fire — two separate bugs

- **String mismatch:** `js/app.js:190` checks `reminderTimes.includes('Weekly Prompt')`
  / `'Daily Priority Check'` / `'Friday Review Prompt'`. Settings saves
  `weekly_plan` / `daily_priority` / `friday_review` (`js/screens/settings.js:207`).
  The values never match.
- **Permission never requested:** `js/screens/settings.js:401` binds the
  permission-request handler to element IDs `remind-weekly` / `remind-daily` /
  `remind-friday` that **do not exist** in the rendered form (the checkboxes have
  `name="reminder"` and no IDs). So `Notification.permission` stays `'default'`,
  and `js/app.js:165` returns early on every call — which also kills the entire
  14-day trial notification sequence.

Fix both: use one shared set of constants for the reminder values, and bind the
permission request to `input[name="reminder"]`.

**Decided:** wording softened rather than dropping the feature. Settings now carries
an amber note saying reminders only appear while the app is open in a tab. The
feature is honest now, but still weak — the weekly email digest (Pro item 7) remains
the real answer, and Loops is already wired up via the `signup-sync` function.
Revisit dropping browser notifications entirely once that ships.

### 3.5 Remove the dead admin AI key feature

`js/screens/settings.js:31` gates on a hardcoded email in client-side code, revealing
a field that writes an OpenAI key to `localStorage.ceo_openai_key` — which **nothing
ever reads**. All AI goes through the edge function. Delete the `isAdmin` check and
the whole Card 5 block, plus the write at line 385.

### 3.6 Stop showing stack traces to users

`index.html:33` injects raw error stacks in red into the page on any uncaught error.
Fine in development, alarming for a paying customer. Log to console; show a small
friendly recovery message instead.

**Note for future work:** there were *two* of these. `build_bundle.ps1` prepended an
identical handler to the top of every bundle it generated, so fixing `index.html`
alone left the red stack trace in place. The build script no longer injects any
handler — `index.html` owns the single global one. Don't reintroduce it.

---

## Batch 4 — Onboarding ✅ done 13 Aug 2026

**File:** `js/screens/wizard.js` (plus small default changes in `js/store.js`)

The wizard doesn't ask for the fields that drive its own output:

- **`strategyMode`** shapes the 90-day AI plan prompt (`js/aiService.js:212`), the
  weekly helper text and suggested focus (`js/screens/weeklyPlanner.js:42`) — but is
  only settable in Settings, where most users never look, and defaults to "CEO Reset"
  (`js/screens/settings.js:144`), the least relevant mode for a beginner.
- **`stage`** is hardcoded to `'growth'` at `js/screens/wizard.js:394`, yet the AI
  prompt is told to calibrate weekly intensity to it.
- **`averageOfferPrice`** is silently set to `1000` and **`leadGoal`** to `100`
  (`js/screens/wizard.js:373`). The user then sees a "0 / 100 leads" progress bar and
  a "sales required" figure she never chose and can't explain.
- **Currency** is never selectable anywhere. `store.settings.currency` exists and is
  respected throughout the UI, but the wizard hardcodes `$`
  (`js/screens/wizard.js:168`). The audience is UK-heavy — this is a five-minute fix
  with a disproportionate effect on whether the app feels like it's *for* them.

Fix: add these to the wizard (strategy mode and stage as a single combined step,
currency alongside the revenue target on step 5, offer price and lead goal as a short
step 6). Total steps go 7 → 8. Every downstream AI output improves.

**As built:** stage + strategy mode became new step 5; currency, revenue goal, offer
price and lead goal are all on step 6 ("Financial Targets"). Offer price and lead goal
were folded into the money step rather than getting their own, which is what keeps the
total at 8 — as separate steps it would have been 9. Step 6 also shows the derived
sales-required figure live ("That's 30 sales at £500 to reach £15,000") so the number
is watched being built rather than appearing unexplained on the dashboard later.

Currency still **defaults to `$`** to avoid silently changing behaviour for existing
users. Given the UK-heavy audience, switching the default to `£` is a one-line change
in the `CURRENCIES` array in `js/screens/wizard.js` — worth considering.

Wizard and Settings option lists must stay in sync: `weeklyPlanner.js` matches
strategy mode on substrings ('first sale', 'launch', 'audience', 'reset').

---

## Batch 5 — Polish ✅ done 14 Aug 2026

**Files:** `js/screens/dashboard.js` (63KB), `js/screens/revenue.js` (53KB), `css/`

These are the two largest files in the project, so do everything that touches them in
a single pass. Least urgent of the batches, but it's most of what makes the app feel
worth $17/month. Can be deferred and run as its own project.

**As built.** Every item below is done. Cache version is now **17** (CSS `?v=8`).

New shared component: [js/components/toast.js](js/components/toast.js) — `showToast`,
`showConfirm` (promise-based, replaces native `confirm`) and `rerenderScreen`. It is
registered in `build_bundle.ps1` after `tooltip.js`; styles live at the end of the
buttons block in [css/components.css](css/components.css) along with a new
`.btn-danger`. `rerenderScreen()` dispatches `hashchange`, reusing the router rather
than reloading the page, so screens keep scroll position and in-page state.

Three `window.location.reload()` calls were deliberately **kept**, because a clean
boot is the point of the action: sign-out ([js/components/nav.js](js/components/nav.js),
[js/screens/welcome.js](js/screens/welcome.js), [js/screens/billing.js](js/screens/billing.js)),
post-login/signup ([js/screens/auth.js](js/screens/auth.js)), and Erase All Data
([js/screens/settings.js](js/screens/settings.js)).

Other notes:
- `parseDateInput()` is now exported from [js/store.js](js/store.js) and is the only
  correct way to read an `<input type="date">`. Use it, never `new Date(value)`.
- Pipeline entries carry `type: 'sale' | 'lead'`, written on add and backfilled in
  `getStore()`. Nothing should infer the kind of an entry from its keys again.
- Past Friday Reviews are readable and editable on the Review screen, backed by new
  `updateReview` / `deleteReview` store functions. `updateReview` deliberately keeps
  the original `date`, so editing a review doesn't move the week it belongs to or
  disturb the streak.
- `escapeHtml()` in [js/screens/fridayReview.js](js/screens/fridayReview.js) is the
  first HTML escaping in the codebase. Most screens still interpolate user text raw.
  Worth generalising if a future batch touches those templates.

**Deployment folder rebuilt (14 Aug 2026).** `github_deployment/` is no longer stale.
It now holds `ceo_planner_app/` (the publish directory), `sales_page/`, `supabase/`
(`setup.sql`, `config.toml` and the three edge functions, without the local
`.temp/` state), a `README.md` covering deploy steps and the cache-bump rule, and a
`.gitignore`. Every app file was verified byte-identical to root, and the copy was
smoke-tested in the browser. The previous copy is kept at
`github_deployment_OLD_2026-08-13/` and can be deleted once the new one is pushed.

Two things found while rebuilding it:
- `_redirects` was saved as **UTF-16**, which Netlify cannot parse. Rewritten as ASCII
  in both root and the deployment copy. Only the SPA fallback was affected, and hash
  routing meant it was never load-bearing, but it was silently dead.
- `favicon.ico` is referenced by `index.html` **and** `manifest.json` but does not
  exist, so every load 404s and the PWA icon entry is broken. `logo.png` is a wide
  wordmark and won't crop to a square, so this needs a square brand mark from Jen
  rather than a code fix.

- **Replace `alert()` / `confirm()` / `window.location.reload()`.** Currently used
  after nearly every action: logging a sale, deleting an entry, saving settings,
  saving a weekly plan. Build one small toast helper and re-render the affected
  screen instead of reloading the page.
- **Remove the dev button.** `js/screens/dashboard.js:478` shows
  `[Dev] Load Mock Data` to every paying user.
- **Fix date parsing.** `new Date(dateInputValue)` parses `<input type="date">` values
  as UTC midnight (`js/screens/revenue.js:601`, `:640`, `:654`,
  `js/screens/dashboard.js:936`). Users west of GMT see sales land on the previous
  day. `getLocalDateString` exists for exactly this — it just isn't used on parse.
- **Add an explicit `type` field to pipeline entries.** Sale-vs-lead is currently
  detected by `Object.keys(e).includes('offer')` (`js/screens/revenue.js:367`), with a
  dead crude-check variable above it. Legacy and mock entries are misclassified as
  leads. Set `type: 'sale' | 'lead'` on write and migrate old rows on load.
- **Recent Pipeline Events is hard-capped at 15** with no filter or pagination
  (`js/screens/revenue.js:365`).
- **No way to view or edit past Friday Reviews** — only a summary in Progress.
- **Hardcoded `$` in two screens.** `js/screens/mondayPlan.js:151` and
  `js/screens/fridayReview.js:79` both print `$` instead of reading
  `store.settings.currency`. Spotted during batch 4 and more visible now that the
  wizard lets people actually choose £ — a UK user sets £15,000 and still sees a `$`
  weekly target on the Monday Plan screen. Small fix, disproportionate effect.
- **Mobile:** the four-across KPI grid collapses to four tall stacked cards
  (`css/styles.css:135`). 2×2 reads far better on a phone.
- ~~Apply the `getWeekStart` helper from 2.4 here if it was deferred.~~ Done in
  batch 2 — `getWeekStart` is exported from `js/store.js` and used by the revenue
  chart. Any new week bucketing must use it rather than rolling its own.

---

## Batch 6 — Documentation drift ✅ done 13 Aug 2026

**Files:** `USER_GUIDE.md`, `PRODUCT_SYNOPSIS.md`, `js/aiService.js`

`USER_GUIDE.md:94` and `PRODUCT_SYNOPSIS.md:53` both describe a Friday Review that
asks for a task-completion percentage and returns a "CEO Focus Score". The actual form
(`js/screens/fridayReview.js`) has neither — it drafts next Monday's plan instead.

This matters more than normal documentation drift because **the stale guide is pasted
into the AI coach's system prompt** as ground truth (`js/aiService.js:3`), so the coach
will confidently explain features that don't exist to paying users.

Fix: reconcile all three, and consider generating the `USER_GUIDE_TEXT` constant from
`USER_GUIDE.md` at build time so they can't drift again.

**As built.** One clarification the plan got slightly wrong: a "CEO Focus Score" does
exist — on the *dashboard*, calculated from Daily 3 completion
(`js/screens/dashboard.js:751`). What was false is that the *Friday Review* produces
it. All three sources now say the same thing: the Friday Review asks six questions
(wins, what worked, what felt heavy, energy level, optional metrics, one improvement),
supports Voice Reflection, and its output is a drafted Monday plan.

`build_bundle.ps1` now generates `CEO_USER_GUIDE` from `USER_GUIDE.md` and injects it
ahead of `aiService.js`, which uses it when present and falls back to a short built-in
summary otherwise. **Editing the guide is now the only way to change what the coach
believes** — do not reintroduce a second copy in `aiService.js`.

Side effect worth knowing: the system prompt grew from ~4.7KB to ~11.3KB because the
coach now gets the full guide rather than a condensed paraphrase. On gpt-4o-mini that
is a fraction of a penny per user per day even at the 120-call ceiling, but if the
model is ever upgraded, trimming the guide's table of contents and preamble before
injection is the obvious saving.

---

## Phase 2 — Batch 8: tier foundation ✅ done 14 Aug 2026

Everything below in Phase 2 needs an answer to "is this account allowed to do that?".
This batch builds it once. **Cache is now bundle v25 / CSS v14.**

**Decided: the 14-day trial runs on Pro, not base.** Nobody upgrades to a tier they
have never seen, and a locked feature only does its job as a *reminder* of something
the user has had. Three conditions came with that decision and all three are now in
the code or written down here:

1. The trial says "Pro" out loud — the nav pill reads `Pro trial, 9 days left`, not
   "trial". Removing something teaches nothing if she never knew she had it.
2. **Day 14 must offer base and Pro side by side, with base framed as a real choice.**
   Not yet built — [js/screens/billing.js](js/screens/billing.js) still shows one
   monthly and one annual button. The known risk with a Pro trial is that base's
   first *paid* week feels worse than the free one, which is a churn driver. It only
   stings if the downgrade happened *to* her rather than being picked off a
   two-column screen. **Do this in the same session as the Pro price going live**,
   and not before: a Pro column nobody can buy is worse than no Pro column.

   **Decided: keep annual.** Dropping it to make room for a second column would be
   solving a layout problem by deleting revenue — at this price point annual buyers
   pay upfront and churn far less. The layout answer is **two plan columns with one
   monthly/annual toggle above them**, which carries four prices in two columns. A
   secondary decision worth making at the same time: whether the toggle defaults to
   annual (higher take-up, slightly pushier) or monthly (lower friction at the exact
   moment someone is deciding whether to stay at all).
3. AI allowance stays tiered regardless of feature tier. `consume_ai_quota` keys off
   `subscription_status`, so a trial gets Pro *features* at the 30/day trial rate,
   never Pro spend. Pro item 4 fires model calls from the dashboard automatically
   rather than only from the chat, so this matters more than it looks: on a card-free
   signup it is otherwise unbounded acquisition cost. ~~Add a third `p_pro_limit`
   argument when item 4 ships.~~ ✅ **Done 17 Aug 2026** — 300/day on paid Pro,
   trial still 30/day, plus a client-side cap of 6/day on trial for the
   unasked-for calls specifically. See "Phase 2 — Item 4".

**Decided: locked features open an explanatory modal with no capture.** No waitlist,
no email collection, no checkout — there is one active user and Pro is not built, so
a checkout button would sell something undeliverable and a waitlist would be
infrastructure for an audience of one. When Pro ships this becomes a real upgrade
button.

**As built**

- New [js/components/proGate.js](js/components/proGate.js) — the only file that
  answers "is this account Pro?". Holds `PRO_FEATURES` (copy for all nine Phase 2
  items plus an `overview` key), `getPlanTier()`, `isProUser()`, `isProTrial()`,
  `trialDaysLeft()`, `proBadge()`, `proLock()`, `showProModal()` and `initProGate()`.
  Registered in `build_bundle.ps1` **before** `nav.js`.
- **Screens never wire up a handler.** `initProGate()` binds one delegated click
  listener (plus keydown, for the non-`<button>` rows in Settings) in
  [js/app.js](js/app.js). A screen renders `data-pro-feature="payment-import"` and
  that is the whole integration. A re-render cannot lose the binding.
- To add a lock to a screen: `${proLock('lead-pipeline', 'Add a named contact')}`.
  It returns an empty string for Pro users, so the Pro build of that screen simply
  doesn't render it.
- `profiles.plan_tier` (`'base' | 'pro'`, default `'base'`, checked) added to
  `setup.sql` **and** as
  [supabase/migrations/20260814_add_plan_tier.sql](supabase/migrations/20260814_add_plan_tier.sql).
  ⚠️ **Run the migration before deploying the bundle.** `refreshAccessState()` has a
  42703 fallback so an out-of-order deploy degrades rather than breaks, but while the
  column is missing every paying account resolves to base.
- Tier resolution lives in `refreshAccessState()`
  ([js/supabaseClient.js](js/supabaseClient.js)) and caches to
  `localStorage.ceo_plan_tier`: `trialing` → pro, `active` → the column, anything
  else → base (they see the paywall anyway). Cleared on sign-out in `nav.js` and
  `billing.js`.
- Settings has a **Your Plan** card: seven base features with ticks, nine Pro
  features below. Locks on base, ticks on Pro and on trial. Every row is clickable
  in all three states, so the list explains itself rather than just taunting.
- `window.CEO_CHECKOUT_PRO` is declared and `null`. Setting it to a Stripe payment
  link is the single change that turns the modal into a checkout.

**Verified in the browser** across all three states — trial (pill counts down, 16
ticks, no locks), paid base (pill reads "See what's in Pro", 9 locks + 7 ticks) and
paid Pro (no pill, 16 ticks). Modal opens from a row and from the pill, closes on
Escape, click-outside and the button, and returns focus. No console errors.

**Also done, same session: Account split out of Settings**

Settings was a 5,100px page mixing two unrelated jobs — *how my business is
configured* (which feeds the AI) and *my relationship with this company* (what I
pay, how I leave). Billing and cancellation sat at the very bottom, which are the
two things a person needs to find fast and usually when already annoyed.

- New [js/screens/account.js](js/screens/account.js) at `#/account`, holding Your
  Plan, Billing, Login details and the Danger Zone. Settings dropped 5,117px →
  3,804px; Account is ~1,850px.
- **New capability, not just a move:** "Change password" (emails a reset link
  rather than letting a signed-in browser set one directly, so a walk-away
  laptop can't lock the owner out), the signed-in email address, and sign-out.
  Email is shown read-only on purpose — it is both the login and the key the
  Stripe webhook matches payments on, so the two have to move together.
- The nav pill is now trial-only and points at `#/account`. The base-tier "See
  what's in Pro" pill was dropped: a permanent upgrade nag in a paying
  customer's nav is worse than a link she can find when she wants it.
- ⚠️ **The nav breakpoint moved again, 1080px → 1120px.** The Account link took
  the required width from 1036px to 1100px, which silently reintroduced the
  batch-7 bug where "Log Out" is pushed off screen. Verified at 1100 (hamburger),
  1200 and 1400. **Re-measure if you add or rename a nav link** — the failure is
  invisible until someone can't log out.
- The trial pill costs ~158px, more than the gap between "links fit" (1100px)
  and "links plus pill fit" (1258px), so it is hidden between 1121px and 1280px
  rather than pushing every laptop into a hamburger for a countdown. Below
  1120px the nav is a vertical dropdown and it comes back.
- `USER_GUIDE.md` gained a section 9 covering Settings vs Account, and the
  Danger Zone instruction now says Account. This matters more than normal doc
  drift: the guide is injected into the AI coach's system prompt at build time,
  so leaving it would have had the coach confidently sending paying users to the
  wrong page to cancel.

**Copy: two layers, settled differently. Don't conflate them.**

- **Teaser headings and hints at the call sites** were tightened and Jen approved
  them: benefit in the heading, one idea in the hint, roughly a dozen words. These
  are the current wording — leave them alone.
- **The `title`/`blurb` pairs in `PRO_FEATURES`** were rewritten once against the
  `wen-audience` skill (emotional recognition first, Claire's own words) and Jen
  **preferred the original and asked for it back**. They are now reverted to the
  first draft and that is the settled version. Don't "improve" them again without
  being asked — the plainer, more factual register is the one she wants here, and
  the audience-skill rewrite has already been tried and rejected.

Note `title` does double duty: it is both the modal heading and the row label in the
Account plan list, so any future change has to read well as a list row too.

**Also decided: `shipped: false` on every Pro feature.** Running the trial on Pro
created an honesty problem — the plan list would have shown a trial user nine
ticks for features that do not exist. Each entry in `PRO_FEATURES` now carries a
`shipped` flag. While false the row reads *in build* with a clock for Pro and
trial accounts and a lock for base, the modal says "still being built" rather
than anything sales-shaped, and `anyProFeatureLive()` keeps the nav pill saying
"Free trial" rather than "Pro trial". **Flip the flag in the same session the
feature ships** and all three correct themselves.

**Also done: all nine per-screen teasers.** Cache is now **bundle v27 / CSS v16**.

New `proTeaser(key, heading, hint)` in proGate.js, for "this whole job could be
easier" moments, alongside `proLock(key, label)` for a control sitting in a row
of other controls. Both return an empty string once the account has the feature
*and* it has shipped, so they delete themselves rather than needing to be found
and removed later. A `.pro-teaser-compact` variant exists for narrow places.

| Feature | Where it sits | Form |
|---|---|---|
| payment-import | Revenue, above the manual logging tabs | teaser |
| lead-pipeline | Revenue, under Recent Pipeline Events | teaser |
| unlimited-offers | Revenue, after quick-offer slots 1–3 | teaser |
| pdf-export | Revenue, beside Export CSV | lock button |
| week-regen | Dashboard, beside Regenerate Plan | lock button |
| live-ai | Dashboard, under the Daily 3 | teaser |
| history | Progress, above the insight engine | teaser |
| email-digest | Settings, under the browser-reminders warning | teaser |
| coach-memory | Chat widget, above the input | compact teaser |

Each one is placed next to the manual way of doing the same job, so it reads as
an explanation of the current limitation rather than an advert. The chat-widget
one appears on every screen because the widget is global — that is intended.

Verified on base and on trial, at 1400px and 375px: nine teasers render, no
horizontal overflow on any screen, teasers open the modal through the same
delegated handler, Escape closes. Tags read **IN BUILD** in both states, because
nothing has shipped yet — they flip to **PRO** via the `shipped` flag.

⚠️ **Bug found by Jen, fixed:** `proLock()` originally hid on `isProUser()` alone
while `proTeaser()` hid on tier **and** `shipped`. Since the trial resolves to
Pro, every trial user lost both lock buttons (PDF export, Redo one week) while
keeping all seven teasers — the two most valuable placements were invisible to
exactly the people most likely to convert. Both helpers now use the identical
rule: **hide only when the account has the tier AND the feature exists.** The
miss came from verifying the placements on a base account only; **any future
gate must be checked on base, trial and paid Pro**, because the trial is the
state that behaves unlike the other two.

**Also fixed: the app could show trial copy to someone who had just paid.**
`revalidateAccess()` ran on load and hourly only, so paying in a second tab and
switching back left the locks on and "you're on the free trial" showing for up to
an hour. It now also runs on `visibilitychange`, throttled to once per 30s, and
re-renders on a **tier** change as well as a status change — base → Pro keeps the
status at `active`, so without that an upgrade wouldn't have lifted the locks
until the next page load.

That still left a race with the Stripe **webhook**, which is the worst case
because it lands exactly when someone comes straight back from paying. Two things
now close it, both in [js/screens/billing.js](js/screens/billing.js):

- **A "Confirming your payment" screen.** Stripe returns to a URL carrying a
  `checkout=success` marker (accepted in the query string *or* inside the hash,
  because a payment link can be set up either way). While that marker is present
  the billing route polls `refreshAccessState()` every 2s for up to 30s instead of
  rendering the paywall, so nobody who has just paid is told their trial is over.
  On success it clears the marker, routes to the dashboard and reloads. On timeout
  it gives up **gracefully** — a toast explaining the delay, then the normal
  billing screen. Never a spinner that spins forever.
- **"Already paid? Refresh my account"** on every billing screen. Fifteen lines,
  no infrastructure, and it covers what polling can't: a webhook that never fires,
  a checkout finished on another device, or a checkout done with a different email
  address. Its three outcomes each say something useful — access granted (go
  through), server unreachable, or no payment found (which names the mismatched
  email case, the actual most likely cause).

**Stripe is configured — done 14 Aug 2026, live mode.** Both payment links now
redirect to `https://app.thewomensentrepreneurialnetwork.com/?checkout=success#/billing`
(previously `#/login` on both):

- `plink_1U3z3iAnrDOsqkV3lfWSSPUp` — monthly, `buy.stripe.com/7sY28q2DXgrp6H67VM18c08`
- `plink_1U3z3pAnrDOsqkV3DuNst7pM` — annual, `buy.stripe.com/28E8wO92l6QP1mM3Fw18c09`

The marker is in the **query string**, not the fragment, on purpose: the router
rewrites the hash when it bounces an unauthenticated visitor to `#/login`, which
would throw a hash-borne marker away, and `location.search` survives that. It also
survives Stripe appending anything of its own. `hasCheckoutMarker()` still accepts
both forms.

⚠️ **These links are live and take real money. If the app's domain ever changes,
these two redirects must change with it** — nothing in the repo points at them.

Verified: the confirming card renders and polls; a simulated webhook landing mid-poll
clears the marker and lands on the dashboard; the timeout falls back to the plan
picker; and the refresh link returns the right message for reachable-but-unpaid and
for server-unreachable.

**Not done, and deliberate**

- The `overview` entry in `PRO_FEATURES` is no longer reachable from the UI — the
  nav pill that used it became a plain link to `#/account`, and the Account page
  lists all nine features itself. It is **not** dead code: `showProModal()` falls
  back to it for an unrecognised key. Leave it as the safety net it now is.
- `js/screens/welcome.js:11` has an inline "Log Out to Reset Session" handler that
  clears `ceo_auth` and the store but not `ceo_sub_status` or `ceo_plan_tier`. It was
  already inconsistent before this batch; left alone rather than expanding scope.
- ~~`github_deployment/` has **not** been re-synced.~~ ✅ Re-synced and verified
  file-by-file on 17 Aug 2026 — see "Deployment, 17 Aug 2026". It had been
  pushed un-resynced at least once, which shipped nothing.

---

## Phase 2 — Item 1: Stripe sales import 🚧 backend done 14 Aug 2026

**Not finished.** The backend, the connection flow and the gating are built and
deployed; the piece that makes it *visible* — merging imported sales into the
revenue figures — is not. `payment-import` is still `shipped: false`, so nothing
appears in the UI. **Do not flip that flag until the merge is done.**

**Key architectural decision.** Imported sales do **not** go into the planner
store. `user_data` is one JSON document written wholesale by the browser on every
save, so a sync job writing into it would have to read-modify-write the whole
thing and would silently destroy anything the user typed in between. Imported
sales live in their own table and are merged **at read time** for display. Any
future server-written data should follow the same rule.

**Database** (migration `stripe_import`, applied to production):
- `stripe_connections` — one row per user. Stores the **account id, never a
  token**; calls use the platform secret key plus a `Stripe-Account` header, so a
  leak of this table exposes no credentials. Select-only from the browser.
- `imported_sales` — the pulled charges. `unique (user_id, source, external_id)`
  is what makes syncing idempotent; without it a second sync would double every
  revenue figure in the app with no way to tell. Select-only from the browser.
- `stripe_oauth_states` — short-lived CSRF tokens. RLS on, **no policies**,
  service-role only (same deliberate pattern as `ai_usage`).

**Edge functions** (both deployed — `stripe-connect` v4, `stripe-sync` v2):
- `stripe-connect` — `?action=start|callback|disconnect`. **`verify_jwt: false`
  by necessity**, because Stripe's redirect arrives with no auth header; it does
  its own auth per action instead (JWT for start/disconnect, the single-use state
  token for callback). The registered `redirect_uri` points at the *function*,
  not the app, so the authorization code is exchanged server side and never
  appears in a browser URL. Scope is `read_only` — the integration can never move
  money or change anything in the user's Stripe account. Disconnect deliberately
  **keeps** imported sales; deleting months of revenue history because someone
  unlinked an integration would be indefensible.
- `stripe-sync` — `verify_jwt: true`. Enforces Pro server side (the client gate is
  presentation only). First sync reaches back 120 days, then uses a watermark with
  a 60-minute overlap so late-settling charges aren't missed. Counts only
  `succeeded && paid`, uses `amount_captured`, handles zero-decimal currencies,
  and upserts so a later refund updates the row instead of being dropped.

**Client**: [js/stripeImport.js](js/stripeImport.js) (registered in
`build_bundle.ps1` after `store.js`) plus a "Connected accounts" card on Account,
gated on `isFeatureLive('payment-import') && isProUser()`.

🔄 **SUPERSEDED 14 Aug 2026 — Connect OAuth was abandoned.** See "Restricted key
switch" below. The OAuth notes that follow are kept only as a record of what was
tried; `stripe-connect` no longer does an OAuth handshake at all.

---

## Paste-a-key connection UI ✅ done 16 Aug 2026

Step 1 of the old START HERE list. **Cache is now bundle v32.** The client half no
longer speaks OAuth anywhere.

- [js/stripeImport.js](js/stripeImport.js): `startStripeConnect()` (redirect) is
  replaced by `connectStripeKey(apiKey)`, which POSTs to
  `stripe-connect?action=connect`. `readStripeOutcome()` is **deleted** — there is
  no redirect to come back from, and a comment at its old site says so. The key is
  passed straight through and never touches localStorage, the store or a data
  attribute; the input is cleared the moment it is accepted.
- The `sk_`/`rk_` checks are duplicated **client side on purpose**, so a full
  secret key gets an instant answer and never leaves the browser at all.
- [js/screens/account.js](js/screens/account.js): the card is now five numbered
  steps, a password-type field and one button. Enter submits. `fetchImportedSales`
  now also selects `product_name` / `product_id`.
- The connected panel handles `stripe_account_id === 'unknown'` (omits the account
  line) and warns in amber when `livemode` is false, because a test-mode key that
  imports nothing is otherwise indistinguishable from a broken integration.

**Permissions cannot be pre-selected.** Checked in Stripe's docs 16 Aug 2026:
there are no URL parameters for pre-ticking a restricted key's resources. The five
steps on the card carry that weight instead. Don't go hunting for a
`?permissions[]=` — it isn't there.

The five resources the card asks for are exactly what `stripe-sync` reads:
**Charges and Refunds** (the money) plus **PaymentIntents, Invoices, Products and
Checkout Sessions**, which exist only to resolve what a sale was *for*. Change
that list if and only if the endpoints in `stripe-sync` change.

**Corrections from watching Jen do it for real, 16 Aug 2026.** All of these are
the kind of detail that turns a five-minute job into an abandoned one, and none
was findable from the docs:

- ⚠️ **The card's step order is Stripe's actual order, not a guess.** Name the key
  → choose the permissions → *then* Stripe interrupts with its identity check
  ("Verification required" — security key, or email plus one more) as you go to
  create it. A first draft put the verification first; Jen caught it. A step
  described before it happens is worse than one left out, because the reader
  assumes they have missed something. **Don't reorder without walking it through
  again** — there is a comment saying so above `connectFormHtml()`.
- **The resource is labelled "Charges and Refunds", not "Charges"**, and the
  permissions table has **two** columns — the second is *Connect permissions*, for
  platforms acting on other people's accounts, which is not what this needs. The
  card now says to use the **Filter resources** box and the first column only.
  Telling people to filter beats telling them to scroll sixty rows, and it
  survives Stripe renaming things. The `stripe-connect` "cannot read your
  payments" error was updated to say "Charges and Refunds" too — the error and
  Stripe's own UI have to use the same words or it sends someone hunting for a row
  that does not exist.

⚠️ Only "Charges and Refunds" is confirmed against the live dashboard (from a
screenshot). The other four names are unverified — **check them against the real
UI on the next pass** and correct the card if any differ.

**The screenshot popup, and how it turns itself on.** Step 3 carries a "See what
this looks like" link that opens Stripe's permissions table in a dialog
(`showImageModal()` in [js/screens/account.js](js/screens/account.js), mirroring
`showConfirm()` for Escape, click-outside and focus return).

The link is **hidden until the image actually loads**. `revealPermissionsHelp()`
probes `./stripe-key-permissions.png` with an `Image()` and only unhides on
`onload`. That is deliberate: a broken image icon on the one screen whose job is
to look trustworthy enough to be handed a credential would undo the whole card.

**To turn it on: save the screenshot as `stripe-key-permissions.png` at the site
root** (beside `logo.png` and the icons, where every other image already lives),
copy it into `github_deployment/`, and push. Nothing else to change — no code, no
cache bump beyond the normal one. Until then the card renders exactly as it does
now, at the cost of one 404 in the console per visit, which disappears with the
file. Crop it to the permissions table with a couple of rows visible; the dialog
is 720px wide and scales the image to fit.

**`stripe-connect` was changed too — deployed as v8** the same day. Two changes,
both aimed at the same failure: validation now checks
**charges first**, because that is the permission the import cannot work without,
and reading `/v1/account` is now **best effort** — a key scoped to exactly the five
resources above may not be able to read the account object, and refusing a key that
can read every sale correctly would be a dead end for someone who followed the
instructions to the letter. When it fails, `stripe_account_id` is stored as
`'unknown'`. It also distinguishes "wrong key" from "missing permission" in the
error text.

**How to see the card before the feature ships.** `payment-import` is still
`shipped: false`, so the card is invisible — including to the one person who has
to connect a real account to test it. **Open this link in each browser:**

```
https://app.thewomensentrepreneurialnetwork.com/?stripe_preview=1
```

(`?stripe_preview=0` turns it off again. The console equivalent still works:
`localStorage.setItem('ceo_stripe_preview', '1')`.)

⚠️ **The flag is localStorage, so it is per browser AND per profile, and clearing
site data wipes it.** This cost an hour on 16 Aug 2026 and misdiagnosed itself
twice as "the deploy hasn't landed" — Chrome and Safari both showed no Connect
link, which looks exactly like a stale build until you notice the *other* new copy
on the same screen is present. The tell: if the Revenue teaser says "(PayPal
coming soon)" the build is current and it is the flag that is missing.
`applyStripePreviewParam()` in [js/stripeImport.js](js/stripeImport.js) exists so
nobody has to open a console on a phone; delete it when the feature ships.

Pro or trial accounts only. `canConnectStripe()` in
[js/stripeImport.js](js/stripeImport.js) is the whole mechanism — *one* answer to
"can this account reach the connect form", asked by both the Account card and the
Revenue teaser that links to it. Two copies of that rule would eventually
disagree, and the failure mode is a link pointing at a card that isn't rendered.
Delete the flag half of the expression when the feature ships.

Note the bundle order hazard: `stripeImport.js` is concatenated *before*
`proGate.js`, so `canConnectStripe()` calls `isProUser()` from a file that loads
later. This works because both are hoisted function declarations and the call
happens at render time, not at load time — verified in the browser, no errors.
Don't turn either into a `const` arrow function without moving the file.

### The way in from Revenue — added 16 Aug 2026

Jen asked for an access point inside the existing "Never log a sale by hand
again" box on Revenue, rather than a separate control elsewhere on the page.

`proTeaser()` gained an optional fourth argument, `{ href, label }`, which renders
a real link inside the strip. It is for the case where part of a feature IS
reachable and the teaser should be a way in rather than only an explanation. The
link carries `data-pro-action`, and **both delegated handlers in `initProGate()`
now return early when the click or keypress came from inside one** — without that,
the `preventDefault()` meant for the modal would swallow the navigation, and the
one working part of the feature would be unreachable from the place that describes
it. New `.pro-teaser-action` style in [css/components.css](css/components.css).

Revenue passes the action only when `canConnectStripe()` is true, so everyone else
sees exactly the strip they saw before. **Cache is now bundle v33 / CSS v17.**

Verified at 1280px and 375px: the link renders and navigates to `#/account` with
the connect form present and no modal; clicking the rest of the strip still opens
the modal; on trial-without-flag and on base the link is absent, all four Revenue
teasers still render, and the modal still opens; no horizontal overflow on mobile;
no console errors.

**Verified** on a local server at trial/Pro: all three client-side rejections
(empty, not `rk_`, `sk_`) toast without a network call and re-enable the button; a
plausible `rk_` reaches the deployed function and surfaces its error; Enter
submits; both connected states render; the card is absent without the preview flag
and absent on base. Screenshots were not possible — the browser pane does not
composite in this session — so the *visual* layout of the card is unverified.

---

## START HERE next session (rewritten 18 Aug 2026, after Pro item 8)

**The backend is fully deployed.** Items 5, 6 and 8 needed no migration and no
new edge function; item 6 calls `chat` with a smaller payload than the 90-day
plan already sends, and item 8 makes no network call at all. Only the app is
outstanding.

1. **Push. `github_deployment/` is synced and waiting.** Root and the deployment
   copy were compared file-by-file on 18 Aug 2026 and are identical: **bundle v76 /
   components.css v28 / variables.css v17**, carrying item 8 (branded report), the
   PRO chip on the PDF Report button, the report customisation pass below, and
   item 9 (unlimited quick offers). Nothing else is outstanding on either side.
   The CSS versions are unchanged on purpose — item 9 added no CSS.

   ✅ **v75 has landed.** Checked live on 18 Aug 2026: the site serves
   `bundle.js?v=76`'s predecessor, v75, and the live bundle really does contain
   `Every transaction` and `'pdf-export'` with `shipped: true`. So item 8 is out
   there working — the "still Jen's to do" note below has been done. What is
   waiting now is **v76 only**, which is item 9.

   `README.md` differs between the two trees **on purpose** — the deployment one is
   the real deployment readme, the root one is a stray Supabase CLI readme. Do not
   "fix" it by copying root over it.

   ⚠️ **This gap is why Jen saw "This one is still being built" on the Pro
   modal for a feature that was finished.** `isFeatureLive('pdf-export')` reads
   the `shipped` flag out of the *running* bundle, so an unshipped feature and an
   unbuilt one are indistinguishable from the browser. The modal was telling the
   truth about the live site. Check the trees before believing a screenshot.

2. **Verify the push properly.** Read the `?v=` the live `index.html` requests,
   *and* grep the live bundle for a symbol only the new code has. The push that
   looked fine and shipped nothing failed because this check was never run:

   ```bash
   curl -s https://app.thewomensentrepreneurialnetwork.com/ | grep -o 'bundle\.js?v=[0-9]*'
   ```

   Expect `bundle.js?v=76`. Anything lower means it has not landed. Then grep the
   live bundle for `Add another offer` — that string arrived in v76, so it is the
   one thing a stale-file push cannot fake. (`Every transaction` is the same test
   for v75, if you need to tell v75 from v74.) A second tell: live
   `css/variables.css` must define `--color-bg-light`, which only exists from v17.
   A third, cheaper one: the live `proGate` blocks for both `'pdf-export'` and
   `'unlimited-offers'` must read `shipped: true`.
3. **First real-session run of live AI.** Everything above the transport is
   verified; the transport itself was stubbed, because testing it needs a
   signed-in account. Open the dashboard, the Weekly Plan and the Notepad on a
   Pro account and confirm the model output actually parses and reads well.
   Watch `ai_usage` for the call count — it should tick up by two on a first
   dashboard load and stay flat on a second. **Rewrite one week while you are
   there** (item 6) and read what comes back: the test that matters is whether
   it is a genuinely different week or the old one reworded.
4. **Connect Jen's own Stripe** with a restricted key and run a sync. Nothing has
   ever been tested end to end — `imported_sales` is empty and no key has been
   connected. `stripe-connect` **v8 is deployed** (16 Aug 2026, `verify_jwt: true`,
   smoke-tested). Expect Derina's subscriptions to name "CEOPlanner" and the "Your
   store" charges to fall back to their description.
5. **Pro item 7 (weekly email digest) is the live one.** v76 is confirmed live,
   so items 8 and 9 are both shipped and nothing is waiting to be pushed. Item 7
   is designed, its two hard unknowns are settled, and the Loops side is started —
   read "Phase 2 — Item 7" above before touching anything, particularly the two
   ⚠️ blocks: it is **not** a transactional email, and the server-side Pro gate
   **would email nobody** if written the obvious way. The build list is at the end
   of that section. Item 10 (PayPal) is then the last thing in Phase 2.

**Check for a reply from Stripe support** (question sent 14 Aug 2026, see
"Connection UX"). It does not block any of the above.

---

## Connection UX — the open product question

**Connect OAuth is not available and never will be.** Stripe's own docs:
"You can no longer build new Connect extensions." The one-click "Connect with
Stripe" buttons on other products are legacy Connect extensions, grandfathered in
before the cutoff. `ca_HMR7TeB0RiaW2cVqG2WlXGyGmQ4RAHc0` on Jen's charges is one
of them - see [[stripe-your-store-app]]. **Reconfiguring or redoing the Connect
setup will not produce a `client_id`. Do not try.**

The Connect platform setup Jen completed on 14 Aug is therefore **inert** - nothing
in the app uses it.

**Stripe Apps is the modern one-click route**, and Jen wants it: ease of setup is a
retention issue, and a member who cannot connect their Stripe will churn. Blocking
question sent to Stripe support 14 Aug 2026:

- Can we publish a public Stripe App for read-only access to users' accounts?
- Does our account being a Connect platform prevent public app distribution?
  (A docs line says "Stripe Apps doesn't support public distribution on Connect
  platforms" - unverified, seen in a doc about something else, but it would mean
  the Connect setup actively blocks the app route and may need removing.)
- What is the review timeline?

**Decision until support replies: ship the restricted key path.** The remaining
work in item 1 is auth-agnostic - product matching, currency and the revenue merge
are identical either way. Only the Account card differs, and that was rewritten in
an afternoon. So the connection step is the LAST thing to build, not the first.

---

## Restricted key switch — 14 Aug 2026

**Stripe has retired the Standard/OAuth path for new platforms.** There is no
`client_id` to be had on a platform created today. Checked and confirmed empty:
`/settings/connect`, `/settings/applications`,
`/settings/connect/onboarding-options`, `.../onboarding-options/oauth`, and
`/account/applications/settings` (the URL Stripe's own docs give). All redirect to
a Connect settings page with no OAuth section. **Do not go looking again.**

The value sitting in `STRIPE_CONNECT_CLIENT_ID` was the literal placeholder text
from a walkthrough table, which is why `start` returned 401 rather than 503: the
box was non-empty, just meaningless.

**New design.** The user creates a restricted, read-only key in their own Stripe
dashboard and pastes it in. No platform status, no `client_id`, no redirect.

- `stripe-connect` v6 — `?action=connect` (body `{ apiKey }`) and
  `?action=disconnect`. **`verify_jwt: true` now**, since no request arrives from
  a Stripe redirect any more. Refuses `sk_` keys outright with an explanatory
  message, requires `rk_`, then validates against `/v1/account` *and*
  `/v1/charges?limit=1` so a key scoped to the wrong thing fails at paste time
  rather than as a mysteriously empty import. Never echoes the key back.
- `stripe-sync` v8 — reads the user's key from `stripe_credentials`. No
  `Stripe-Account` header and no platform key anywhere in it.
- Migration `20260814_stripe_credentials` — keys live in their own table with RLS
  on and **no policies**, service-role only. They are NOT on `stripe_connections`,
  which has a user SELECT policy and is therefore browser-readable.

`STRIPE_CONNECT_CLIENT_ID` is now unused and can be deleted from the secrets.

~~**Still to do:** [js/stripeImport.js](js/stripeImport.js) and the Account card
still speak OAuth.~~ Done 16 Aug 2026 — see "Paste-a-key connection UI" above.
Still true: nothing has been tested end to end, no key has been connected and
`imported_sales` is still empty.

**Separate live bug found the same day:** `STRIPE_SECRET_KEY` contained
`mk_1L…Dvcf`, which Stripe rejects as "No such API key". That key is used by
`stripe-webhook`, and every user in `profiles` was stuck at `trialing` including a
real paying customer. Jen replaced it; **re-verify it is now a valid `sk_live_`
and that subscription statuses start updating.**

---

### Superseded OAuth notes (kept as a record only)

✅ **Both manual setup steps are DONE — 14 Aug 2026.** Do not re-investigate:
1. Connect enabled, platform onboarding completed, redirect URI registered as
   `https://ekzpbpoadiktlflcrrwm.supabase.co/functions/v1/stripe-connect?action=callback`
2. `STRIPE_CONNECT_CLIENT_ID` and `APP_URL` set as Supabase secrets.

Verified live by two unauthenticated probes, which are the cheapest way to re-check
this without credentials if it is ever in doubt:

```
POST .../stripe-connect?action=start
  -> 401 "Please sign in first."   (503 would mean the client ID is missing)
GET  .../stripe-connect?action=callback&error=access_denied
  -> 302, Location: https://app.thewomensentrepreneurialnetwork.com/?stripe=cancelled#/account
```

Gotcha already hit and fixed: `APP_URL` was saved with a **trailing newline**, which
made the `Location` header invalid and 500'd every callback — including the fallback
inside the `catch`. `appUrl()` now calls `.trim()` (v4), so it cannot recur. Note the
ordering hazard it exposed: the connection is upserted *before* the redirect is built,
so a throw there leaves the user connected in the database but staring at an error.

**Still untested end to end:** no real OAuth round trip has been run, so Stripe's own
acceptance of the `ca_` and redirect URI is unproven. `stripe_connections` has 0 rows.

**Attribution capture — done 14 Aug 2026, `stripe-sync` v2.** Migration
`imported_sales_attribution` added `client_reference_id`, `metadata`,
`invoice_id` and `payment_intent_id`; the sync writes all four. Nothing populates
attribution yet — this is captured **from the first import on purpose**, because
starting later would leave a permanent blind spot over every sale imported before
the switch, and it cannot be backfilled from Stripe once the window has passed.

---

## Item 1, remaining — full spec for the next session

Decisions below are **settled with Jen**. Don't relitigate them; build them.

### 1. Real product names (change `stripe-sync` again) — ✅ DONE 14 Aug 2026, v5

Migration `20260814_imported_sales_product_name` adds `product_name` and
`product_id` to `imported_sales`. `stripe-sync` v5 resolves them in a **backfill
pass that runs after the import loop**, not inside it, so the money still lands if
Stripe is slow or rate limits the extra lookups. Rows inserted moments earlier are
picked up by the same pass, so a first sync still ends with names.

Three things to know before touching this again:

- **Never add `product_name` / `product_id` to the main upsert.** That upsert
  re-writes every column it names, and the 60-minute overlap deliberately re-reads
  existing charges, so including them would reset resolved names to null on every
  sync. There is a comment at the exact spot saying so.
- **`resolveProduct()` always returns a name** (falling back to `description`, then
  "Stripe sale"). A null would mean re-attempting the same unresolvable sale on
  every future run forever.
- Bounded at `NAME_LOOKUP_BUDGET` 150 per run at concurrency 6; leftovers resolve
  on the next sync. Response carries `named` and `namesPending`.

**Not yet exercised against real data** — no sale has ever been imported. The
invoice and checkout-session paths are written from the API shape, not observed.

**Evidence, not theory:** the live charges on Jen's own account carry
`description` values of `"Subscription update"` (every subscription payment) and
`"Payment to The Women's Entrepreneurial Network"`. **No charge names the
product.** Auto-mapping from `charge.description` would produce a revenue-by-offer
chart reading "Subscription update — 68%", which is worse than useless because it
looks like data. This option is dead — do not revive it.

The product name lives on the **invoice line items** (subscriptions) or the
**checkout session line items** (one-off payment links). `invoice_id` is already
being captured for exactly this. Resolve the name from there, fall back to
`description`, then to "Stripe sale".

### 2. One-time product → offer matching

On first import, Account shows "We found N products in your Stripe — match them to
your offers", pre-filled with the real Stripe names, one dropdown each mapping to
an existing quick offer or "keep as is". Automatic thereafter.

**Why the friction is acceptable here:** the user maps *products* — a handful,
once — not *sales*, which never stop arriving. The cost does not grow with use,
and Stripe product names are often internal in a way her offer names are not.

### 3. Currency: flag, never guess

Jen's own charges are **USD** while her app currency is **£**, so this is hit on
the first import, not hypothetically.

- **Always store the original** amount and currency. Never lossy, so a wrong rate
  is always recoverable.
- **User-set conversion rates**, in Settings (`1 USD = 0.79 GBP`). No FX API: no
  external dependency, no rates drifting underneath, and she stays in control.
  Show "converted from $17.00" on the entry so nothing is hidden.
- **No rate set means flagged and excluded from totals, not guessed.** A visible
  "3 sales in USD need a conversion rate" prompt beats a quarter total silently
  wrong by 20%. The promise of this feature is numbers you can trust; a
  confidently wrong total does more damage than an admitted gap.

### 4. The merge itself

Merge `imported_sales` into `getRevenueInsights()` so imported sales count toward
the quarter, the projection, the chart and the CSV. Touches `store.js` and
`revenue.js` — the two most delicate files, so give it a fresh session.

Remember the architectural rule: **imported sales are merged at read time and
never written into the store.** The store is one JSON document the browser writes
wholesale, so merging into it would let a sync overwrite whatever the user typed a
second earlier.

Also: show imported entries distinctly from hand-logged ones in Recent Pipeline
Events, and decide what a refunded row does to the totals.

### 5. Source attribution — deliberately NOT now

Deferred with Jen, and the mechanism is settled so nobody rebuilds it wrong:

- **Social APIs cannot do this.** TikTok and Instagram can report followers and
  post performance; they cannot tell you which follower bought. There is no shared
  key between a social account and a Stripe charge.
- **Google Analytics fights the setup.** Checkout happens on Stripe's domain, so
  GA loses the thread exactly where it matters, and fixing that needs the same
  plumbing as the simpler option below.
- **The mechanism that works: UTM → Stripe.** The landing page holds `utm_source`
  and passes it into checkout as `client_reference_id` or metadata. The charge
  then carries its own attribution and the import reads it directly. Stripe
  payment links already accept `?client_reference_id=` today.

Until then, imported sales are **unattributed** and must be excluded from the
Source Attribution pie rather than labelled "Stripe" — that pie answers "which
channel makes me money", and a fat "Stripe" wedge would destroy it.

### PayPal — promised in the UI, scheduled as item 10 (decided 16 Aug 2026)

> **Superseded 19 Aug 2026.** Item 10 is now built behind a flag and the
> credential question below is answered — PayPal *does* offer a genuinely
> read-only permission, but it cannot be checked from the credential string the
> way Stripe's can. Read **"Phase 2 — Item 10: PayPal sales import"** further
> down for what was actually found and what remains. The section below is kept
> because it records why the item was scheduled where it was.

Spotted by Jen: the Revenue teaser said "Connect Stripe **or PayPal** once" while
the link beside it said "Connect your Stripe account". Item 1's title had always
named both, but every line of work is Stripe-only and no session has ever designed
the PayPal half.

**Decided: keep the promise, date it honestly, and schedule it.** Three strings
now end in **"(PayPal coming soon)"** — the teaser hint in
[js/screens/revenue.js](js/screens/revenue.js), and the `payment-import` blurb
plus the `overview` bullet in [js/components/proGate.js](js/components/proGate.js).
Jen chose this over dropping PayPal entirely, so the intention is real; it is now
**item 10 in the Phase 2 build order** rather than a line of copy with nothing
behind it.

⚠️ **The app now says "coming soon" to every user who opens that box.** That is a
commitment with a clock on it. If item 10 slips indefinitely, change the copy —
don't leave "soon" standing for a year. Deleting the three brackets is also the
last step of item 10.

This is the one edit to `PRO_FEATURES` copy that batch 8's "don't improve it
again" rule does not cover: it was a factual correction, asked for, and the
register is untouched.

**When it is built, three things are already true and two are not.**

Already true:
- `imported_sales.source` exists and the uniqueness constraint is
  `(user_id, source, external_id)`, so a second processor needs **no migration**.
- Items 2, 3 and 4 (product matching, currency, the revenue merge) are
  source-agnostic and will not need doing twice.
- The Account card's shape — explain, link out, paste, validate — transfers.

Not true, and these are the reasons it is not next:
- **The credential is weaker than Stripe's.** The whole Stripe design rests on a
  restricted key that can only read, and `stripe-connect` refuses `sk_` outright.
  PayPal's equivalent is a REST app client ID and secret, which is not scoped that
  narrowly. **Verify whether PayPal offers a genuinely read-only permission before
  designing anything** — the transaction history is believed to come via a
  Transaction Search permission on the app, but that is unverified and nothing
  should be built on it until it is checked.
- It needs a whole second sync function, with its own pagination, currency
  handling and idempotency.

**Order of work.** Get Stripe working end to end and merged into the revenue
figures first — item 1 finished and proven on real data is what makes item 10 a
copy of a working thing rather than a second experiment. If members start asking
for PayPal before then, that is a reason to move it up the order, not to start it
in parallel.

### 6. Last step

Flip `shipped: true` on `payment-import`. That single flag reveals the Account
card, ticks the plan row and removes the Revenue teaser — verified by flipping it
in-browser. **Nothing else should need touching.**

---

## Phase 2 — Item 2: real lead pipeline ✅ done 16 Aug 2026

Named contacts with stages, follow-up dates and a gone-quiet view, on their own
screen at `#/pipeline`. `lead-pipeline` is now `shipped: true`.
**Cache is now bundle v54 / components.css v19.**

### The rule that matters most here

**Everything numerical reads from `getFunnelInsights()` in
[js/store.js](js/store.js).** Leads, calls, closes and every rate between them
have exactly one home, because three sessions were spent getting the Revenue
screen, the AI coach and the executive report to stop disagreeing in front of
the user. A pipeline screen with its own maths would have been a fourth opinion.

- `getPipelineInsights()` is new and supplies only the *board's* shape — which
  contact sits in which column, who is due, who has gone quiet, what the open
  deals are worth. It computes **no rates at all**, and there is a comment on it
  saying so.
- [js/screens/revenue.js](js/screens/revenue.js) used to re-sum
  `store.leads.entries` for its own lead total. It now destructures `totalLeads`
  off `funnel` like everything else. That line is why the lead count on Revenue
  would otherwise have ignored the pipeline entirely.
- The Pro chip on every pipeline card comes from `proCardHeading()`, never
  assembled by hand.

### The counting rule — decided with Jen

**Contacts are additive**, a third source alongside the bulk lead entries and the
monthly snapshots that `getFunnelInsights` already summed. Not a replacement:
dropping the bulk entries once a contact exists would silently delete history
someone typed by hand.

The split is returned as `bulkLeads` / `contactLeads` / `contactCalls` /
`contactCloses` and **shown wherever the total is** — the Quarter Lead Goal card
and the lead progress bar both read "50 logged in bulk, 5 named contacts" under
the 55. Two sources adding up is only confusing when it is invisible.

Three counting rules, and the reasoning behind each, because they look
interchangeable and are not:

| Figure | Read from | Why not the obvious alternative |
|---|---|---|
| Leads | one per contact | — |
| Calls | `reached['call-booked']` ever set | Reading the *current* stage would delete every call the moment a deal closed |
| Closes | current stage is `won` | Reading "ever reached won" would make a mis-click permanent |

`reached` records the first entry into each stage. Moving a contact **backwards**
down the forward ladder clears the marks above the new stage — that is the whole
correction path. Drag a mis-clicked Won back to Proposal and the close stops
counting while the call that genuinely happened does not. **`lost` deliberately
has no rank** (`stageRank` returns -1): losing a deal is not progress past
"proposal sent", and ranking it as one would wipe the call history on the way
out. Verified in the browser both ways.

`getChannelFunnel()` counts contacts on the identical rules. It has to: a
per-channel table that excluded the pipeline would quietly total less than the
funnel card above it.

### Quarter reset

Contacts are the **one thing not cleared wholesale**. Won and lost are settled,
so they archive into `pastQuarters` and leave. Anything still open carries into
the new quarter — a deal sitting at "proposal sent" on the last day of the
quarter is a live conversation with a real person, and deleting it because the
calendar turned over would be the app throwing away her actual work.

### ⚠️ The nav breakpoint moved again, and it caught a real bug

Adding a twelfth nav link took the bar's requirement from 1100px to **1289px**.
Raising the breakpoint to match would have put every 1280px laptop into a
hamburger for one extra word, so instead a **compact band at 1121–1320px**
tightens `.nav-links` gap to 0.4rem and `.nav-link` padding to 0.5rem/0.3rem.
That brings it back under 1120px and **the breakpoint stays at 1120**.

Then the trial case failed: pill + twelve links put "Log Out" at 1330px on a
1321px window — the same silent can't-log-out failure as batches 7 and 8. The
pill-hiding band's upper bound went **1280 → 1390** to fix it.

**A trial account is the widest nav the app has. Measure that one, not paid
Pro.** Verified at 1121 (widest hamburger-free), 1321, 1400 and 375: no nav
overflow, Log Out on screen, no horizontal body scroll anywhere.

### As built

- New [js/screens/pipeline.js](js/screens/pipeline.js), registered in
  `build_bundle.ps1` after `revenue.js`. Route `#/pipeline` in
  [js/app.js](js/app.js).
- **Board, not drag-and-drop.** Each card carries a stage `<select>`. Dragging
  needs a library, breaks on touch, and is unusable with a keyboard; a dropdown
  is one tap on a phone and one keystroke on a laptop.
- Five columns in a `flex` strip with `overflow-x: auto` **on the board itself**,
  so the page body never scrolls sideways — that is the batch-7 hidden-tooltip
  rule. Columns are `208px`: five plus four gaps come to 1104px, inside the
  1168px `.dashboard-layout` leaves at 1280px. Any wider a column and a full
  desktop scrolls a board, which defeats the point of one.
- The screen uses `main-content dashboard-layout` (1200px), not plain
  `main-content` (800px). Without it the board scrolls on a full desktop window.
- Inline edit swaps the card for a form in place. A pipeline you cannot correct
  is worse than none: the first typo in a name, or 47 entered as 470, has to be
  fixable without deleting the contact and losing its stage history.
- `canUseLeadPipeline()` in [js/components/proGate.js](js/components/proGate.js)
  is the **single** answer to "can this account open it", asked by the nav link,
  the screen's own guard and the Revenue card. Two copies of that rule is the
  exact shape of the `canConnectStripe` bug.
- **The nav link renders for Pro accounts only.** Base users keep the teaser on
  Revenue, which is the point of the job; a permanent nav entry leading to a wall
  is the same nag the base-tier "See what's in Pro" pill was dropped for. Typing
  `#/pipeline` on base gets an explanatory card and the modal, never a redirect.
- Revenue's teaser is replaced for Pro accounts by a live summary card with a way
  in — same shape as the Stripe panel, and for the same reason: `proTeaser`
  deletes itself once you have the feature and would otherwise leave a hole where
  the useful control should be.
- **CSV export gained three columns**: `Contact Name`, `Stage`, `Pipeline Value`,
  **appended, never inserted**, so an existing pivot table or formula keeps
  working. Pipeline Value has its own column rather than going in `Amount` on
  purpose — Amount holds money that arrived, and summing it has to stay a true
  answer to "what did I make". Calls/Closes carry the same 1-or-0 the funnel
  counts, so a spreadsheet total matches the app.

### Two traps hit this session

- ⚠️ **Multi-line `import` breaks the bundle.** `build_bundle.ps1` strips imports
  with a single-line regex, so a wrapped import survives into the bundle and
  fails at parse time — the same trap CLAUDE.md documents for multi-line exports.
  Keep every import on one line. Worth adding
  `node -e "new Function(require('fs').readFileSync('js/bundle.js','utf8'))"`
  after each build; it caught this in seconds.
- ⚠️ **The service worker served a stale bundle at the same `?v=`.** Rebuilding
  without bumping the version left the browser running the previous build, and it
  looked exactly like the edit not working. Clear it with
  `navigator.serviceWorker.getRegistrations()` + `caches.keys()` when testing
  repeated rebuilds locally.

### Verified in the browser

Trial, paid Pro and base, at 375 / 1121 / 1280 / 1321 / 1400. Stage moves both
directions with the funnel following correctly; add, inline edit and delete
(with its confirm) all round-trip; a contact named
`Priya "P" Raman & Co <Ltd>` survives edit intact and
`<script>alert(1)</script>` renders as text with zero injected script nodes;
CSV contains the contact rows; the Account plan row lost its IN BUILD marker.
No console errors on any screen.

### Second pass, same day — fields from Jen's own pipeline tracker

Jen shared the spreadsheet pipeline tracker she sells separately
(single tab, 10 fields, 3 dropdowns) and asked what was worth taking. Four
things were added; three were deliberately left. **Cache is now bundle v55 /
components.css v20.**

**Taken**

- **`closeDate` — expected close date.** A different question from the follow-up
  date: one drives the forecast, the other drives the nudge, and a deal often has
  one and not the other. New `getQuarterEnd(store)` in store.js defines the
  window as **quarter start + 90 days**, matching the product's own language.
  Note the pace maths in `getRevenueInsights` divides by 12 weeks (84 days), so
  the two differ by six days — deliberate, because dropping a deal expected on
  day 88 out of "expected this quarter" would be wrong in the direction that
  matters.
- **`probability` — Low / Medium / High**, weighted 0.25 / 0.5 / 0.8, feeding
  `weightedValue` and `expectedThisQuarter`. **Deliberately does NOT carry the
  spreadsheet's Won and Lost options.** An outcome is not a probability; a won
  deal belongs at the Won stage. The shared sheet shows the cost of mixing them —
  its first sample row reads stage *Lead Generation*, probability *Won*, status
  *Contacted*: three fields telling three different stories about one deal.
- **`nextSteps` — the short "what happens next"**, kept out of Notes on purpose.
  Notes is where everything ends up; this is the one line you act on. It shows on
  the card and in the Needs You list, which is the point of it.
- **A third "needs you" reason: a close date that has passed.** `needsYou` is now
  assembled inside `getPipelineInsights` — follow-up due, then close overdue,
  then gone quiet — de-duplicated and in priority order.

**Left, and why**

- **Sales Rep / Owner** — the audience is solo. A column of your own name.
- **The Status column** — it overlaps Pipeline Stage almost entirely in the
  source sheet (both carry Contract Sent, Closed Won, Closed Lost), so the same
  fact gets recorded twice and the two drift.
- **The nine stages** (Qualification, Verbal Commitment, Contract Sent) — that is
  enterprise B2B language. Claire sends a payment link, not a contract. Five
  stages stay. Worth revisiting only if buyers of the spreadsheet ask for the
  granularity.

**Dropdowns, and the drift they fix**

- **Source is now `CONTACT_SOURCES` in store.js, rendered by BOTH the pipeline
  and the Revenue sale form.** The list used to be hardcoded in `revenue.js`
  while the pipeline took free text, so the same channel could arrive under two
  spellings and split into two rows in "Which Channel Earns" — the alias-flagging
  code in `getChannelFunnel` exists to paper over exactly that. A shared list
  removes the cause. Verified identical at runtime.
- **Offer is built from the user's own quick offers**, plus an "Other…" option
  that reveals a text box. Necessary, not optional: quick offers are capped at
  three on base (Pro item 9 lifts it), so a dropdown alone would block anyone
  selling a fourth thing.
- The edit form **preserves a value that isn't in either list** — a source typed
  before the dropdown existed appears as its own selected option, and an unknown
  offer opens on "Other…" with the text prefilled. Opening the edit form can
  never silently rewrite a field it doesn't recognise. Verified with a contact
  carrying source `IG Story` and offer `Legacy Bundle`.
- The bulk lead-logging form on Revenue is **still free text**. Same drift risk,
  not in scope this pass; worth doing next time that form is open.

**Money rules, restated because there are now four figures**

`openValue`, `weightedValue`, `expectedThisQuarter` and `unweightedValue` are all
money that MIGHT arrive and none of them touches revenue, quarter progress or the
projection. `weightedValue` counts only deals with a confidence set, and
`unweightedCount` / `noCloseDateCount` are returned so the cards can admit the
gap — "2 open deals have no close date, so they are not in this" — rather than a
total that silently covers part of the pipeline while looking like it covers all
of it. `weightedValue` is `null` per contact when unrated, never 0, on the same
rule as `callCloseRate`.

⚠️ **A bug this pass, and it is the exact one the single-source rule exists for.**
`renderPipelineSummary` in revenue.js computed
`followUpsDue.length + goneQuiet.length`. The moment the third category landed it
undercounted silently — the Revenue card said "2 need you today" while the
pipeline screen said 3, from the same data. It now reads `pipeline.needsYou.length`.
**Adding a category to a list means finding everything that re-adds its parts.**

**Verified:** forecast maths hand-checked against six seeded contacts
(£3,547 open → £1,967.60 weighted from 4 rated → £1,247.60 expected in quarter
from 3 with in-quarter close dates); the three needs-you categories de-duplicate
correctly (a deal that is both overdue and quiet appears once, under overdue);
all six new CSV columns export with a blank Likelihood for unrated deals rather
than an invented word; the Other… toggle works in both forms; no console errors
and no horizontal overflow at 375 or 1280 across seven screens.

### Third pass, same day — field help and the add-contact form

**Cache is now bundle v61 / components.css v22.**

**Info circles on all nine fields.** `renderTooltip` from the existing tooltip
component, one per field, each with what-goes-here and a second line on what the
field feeds or how it differs from its neighbour (close date vs follow-up date is
the pair that most needs it). The card also gained a one-line subtitle saying
only the name is required.

**Two real defects behind the ragged layout, not just spacing:**

1. **The labels were bare `<label>` elements.** A bare `<label>` is inline, so it
   only wrapped above its input when the input happened to be wide enough to push
   it there. A narrow `<select>` sat *beside* its label instead, which is why the
   row had fields at different heights.
2. **`.form-control` is not defined anywhere in the CSS.** It is used across the
   whole codebase and has always been browser-default. Styling it globally would
   change every screen at once, so it is now styled **scoped to the pipeline
   form** — width, border, radius, focus ring, and a pinned `height` so selects,
   date inputs and text inputs cannot disagree. **Doing this properly across the
   app is a real, separate job** and worth its own pass.

New `field(id, label, tip, control)` helper in pipeline.js builds every field the
same way: a label row on its own line with the info circle, control underneath.
Labels were shortened to fit one line now the tooltips carry the explanation
("Where they came from" → "Source", "Expected to close" → "Close date").

**Fixed 3 columns, not `auto-fit`.** `repeat(auto-fit, minmax(180px, 1fr))`
decides the column count from the available width, so nine fields reflowed 5+4 at
one width and 4+4+1 at another and the last row never matched the ones above.
Three columns give 3/3/3 at every desktop width, 2 columns under 900px, 1 under
560px. `align-items: start` matters: the Offer field grows a second control when
"Other…" is chosen, and without it every other field in that row would stretch.

⚠️ **Tooltips at a card edge needed their own fix.** The shared tooltip centres
on its icon with `translateX(-50%)`, which is right mid-page and wrong at an
edge: in the left column the icon sits near the card edge and 21–51px of the
280px panel rendered off the left of the viewport, unreadable. Capping the width
does nothing, because the panel is centred rather than anchored. Inside
`.pipeline-field` the container is `position: static` and the field is
`relative`, so `left: 0` resolves to the **field's** left edge and the panel can
never exceed a field that itself never exceeds the card, in any column at any
breakpoint. The arrow is hidden there, since it no longer points at the icon.

**Verified:** exactly 3 distinct control tops at 1280px (3 rows of 3), 5 aligned
pairs at 820px, single column at 375px; all 9 tooltips fully on screen at all
three widths with no body overflow; the form still submits every field including
the Other… path; no console errors.

### Known and deliberate

- A downgraded ex-trial account still has its contacts counted in the lead total
  and sees the "5 named contacts" split, with no link to open the board. Their
  data is theirs and the numbers should not drop when they downgrade; the teaser
  and modal explain the state.
- `escapeField()` in pipeline.js duplicates fridayReview.js's `escapeHtml()` and
  is deliberately named differently. The bundle flattens every file into one
  scope, so two identical-looking globals where the last one silently wins is a
  trap for whoever edits one of them. Generalising both into one shared helper is
  still worth doing when something else touches those files.
- ~~`github_deployment/` has **not** been re-synced.~~ ✅ Re-synced and verified
  file-by-file on 17 Aug 2026 — see "Deployment, 17 Aug 2026". It had been
  pushed un-resynced at least once, which shipped nothing.

---

## Phase 2 — Item 3: history and comparison ✅ done 16 Aug 2026

Quarter-over-quarter and a year view, at `#/history`. `history` is now
`shipped: true`. **Cache is now bundle v64 / components.css v23.**

### The comparison that would have been wrong

A quarter six weeks old against one that ran the full ninety days is not a
comparison, and getting it wrong here is not neutral: the seeded test account
sat at £5,170 against a previous quarter's £11,700 and the naive version printed
**"▼ £6,466 (55%)"** at a user who was in fact £370 **ahead**. Discouraging
someone who is doing fine is the worst thing this screen can do.

So the quarter in progress is compared against **where the previous quarter
stood on the same day of its own life**. `revenueByDay()` in store.js sums the
archived quarter's entries up to day N; `samePoint` carries the result, the
previous quarter's *final* total ("that last figure is the one to beat") and how
many weeks in you are. The table's change column shows the same-point figure for
that row, labelled "at this point in Quarter 2", and falls back to a plain
**In progress** when the previous quarter has no start date to measure from.
Finished quarters are compared with each other normally.

### Where the numbers come from

- **The live quarter is read, never recalculated.** `getQuarterHistory()` takes
  its current-quarter row from `getRevenueInsights()` and `getFunnelInsights()`.
  A history screen doing its own sums would eventually disagree with Revenue
  about the ninety days the user is currently living in.
- **Archived quarters go through the same code.** `getFunnelInsights()` is now a
  three-line wrapper around a new exported `summariseFunnel(leads, metrics,
  contacts)`, and the archive is counted by calling that with the archived
  arrays. One implementation, two datasets — a second set of counting rules for
  history would have disagreed invisibly, and on this screen that reads as the
  business having changed rather than the code.
- `progressPercent` for the live row is worked out from `totalRevenue / goal`
  rather than read off `insights.progressPercent`, which is clamped to 100 for a
  progress bar's benefit. A quarter that beat its goal by 17% has to be able to
  say so next to one that didn't.

### Three traps in the archived data

1. ⚠️ **`reviewsCount` in the archive is cumulative, not per-quarter.** It is
   `store.reviews.length` at archive time, and reviews are deliberately *not*
   cleared on reset — so the raw value would have shown "20 Friday reviews" for a
   quarter with 11. Consecutive archives are differenced to get the quarter's
   own count. `plansCount` needs no such fix: `weeklyPlans` IS cleared each
   quarter, so the archived array is that quarter's.
2. **Only settled contacts are in the archive.** `resetQuarter` carries open
   deals into the new quarter on purpose, so each contact is counted in exactly
   one quarter and nothing is double-counted — but a quarter's lead figure
   excludes conversations that were still live when it ended. That is the honest
   split, not a rounding error.
3. **Entries dated before a quarter opened are excluded from that quarter**, the
   same rule `getRevenueInsights` applies to the live one. Back-entered history
   counted in full would make a quarter look like it beat one it never touched.
   The quarter's detail card says so when there is any.

**The year view deliberately does not follow rule 3.** It counts every sale by
the date on it, including anything outside a 90-day window, because "what did
this business earn in 2026" is a different question from "did this quarter hit
its goal" — so the year totals and the table do not always add up, and the
tooltip says which is which. Entries are **deduplicated by id**: an imported
Stripe sale dated inside an archived quarter appears in the live merged list too,
and counting it twice would inflate the one figure on the screen someone might
quote to an accountant.

### As built

- New [js/screens/history.js](js/screens/history.js), registered in
  `build_bundle.ps1` after `progress.js`. Route `#/history` in
  [js/app.js](js/app.js).
- **No nav link, on purpose.** The bar is already at 1289px with twelve links
  and the compact band at 1121–1320px is what keeps the breakpoint at 1120. A
  thirteenth link would need that whole measurement redone to buy discoverability
  the teaser's own screen already provides. It is reached from **Wins &
  Progress** — where the teaser for it always sat, so the promise "this is where
  you see them side by side" is now literally true — and from **Quarter Reset**,
  which is the moment the word "archived" stops being a promise. `nav-progress`
  stays lit while you are on it.
- `canUseHistory()` in [js/components/proGate.js](js/components/proGate.js) is
  the **single** answer to "can this account open it", asked by the screen guard,
  the Progress card and the Quarter Reset link.
- Progress's teaser is replaced for Pro accounts by a live summary card with a
  way in — same shape and same reason as the pipeline card on Revenue.
- **The four wrap-up answers are readable for the first time.** Batch 2 stopped
  `quarterReset.js` throwing them away; until this screen there was nowhere to
  read them back. They sit in a `<details>` per quarter — no JS toggle, so
  nothing to restore after a re-render — with the quarter's focus, plans,
  reviews, top channel and best offer underneath.
- Up is `#027A48`, the app's success green, **not** `--color-secondary-dark`.
  The gold used for the Won stage reads as a warning at this size on a white
  card, and these are the numbers most likely to be read at a glance.
- The table scrolls inside `.history-table-wrap`, never the page body.

### Verified in the browser

Base, trial and paid Pro, at 375 and 1155. Numbers hand-checked against a seeded
three-quarter store: leads 81 = 79 bulk + 2 contacts, calls 26 = 11 snapshot +
13 bulk + 2 contacts, closes 9, close rate 35%; per-quarter reviews 11 from
archives reading 20 and 9. `<script>` and `<img onerror>` in a reflection render
as text with zero injected nodes and no flags set; a quarter with `reflection:
null` reads "No wrap-up was written for this quarter"; an account with no
archived quarters gets the first-quarter card instead of an empty table. Base
gets the locked card at `#/history` and keeps the teaser on Progress; the modal
now correctly says Pro "isn't open for sign-ups just yet" rather than "still
being built". Account plan list: the history row lost its IN BUILD marker, the
other six kept theirs. No console errors, no body overflow at either width.

⚠️ **The verification browser is signed into Jen's own account.** Seeding a test
store into localStorage is safe **only** because nothing on these screens calls
`saveStore()` — one save would have upserted fake data over the real
`user_data` row. The cloud copy was stashed first and restored afterwards, and
`updated_at` never moved. Anyone testing a screen that WRITES must sign out
first.

### Known and deliberate

- A downgraded ex-trial account keeps its archives; they simply stop being
  readable. Nothing is deleted on downgrade.
- `USER_GUIDE.md` does not mention this screen, and the AI coach is fed that
  guide as ground truth. The pipeline screen has the same gap. Worth one pass
  adding both rather than one line now.
- ~~`github_deployment/` has **not** been re-synced.~~ ✅ Re-synced and verified
  file-by-file on 17 Aug 2026 — see "Deployment, 17 Aug 2026". It had been
  pushed un-resynced at least once, which shipped nothing.

---

## Phase 2 — Item 4: live AI everywhere ✅ done 17 Aug 2026

All four keyword engines now have a live half. **Cache is now bundle v65 /
components.css v24.** `live-ai` is `shipped: true`.

| Surface | File | Base tier | Pro |
|---|---|---|---|
| AI Planning Assistant | [weeklyPlanner.js](js/screens/weeklyPlanner.js) | `generatePlanSuggestions()` | six suggestions in the same shape |
| The Daily 3 breakdown | [dashboard.js](js/screens/dashboard.js) | `breakdownTask()` | three tasks from this week's own plan |
| Quiet Advisor pulses | [dashboard.js](js/screens/dashboard.js) | `getQuietAdvisorPulses()` | same diagnosis, rewritten words |
| CEO vs Busy Work | [coach.js](js/screens/coach.js) | `keywordVerdict()` | a verdict that has read the plan |

**The keyword engines are untouched and stay as the base tier.** They are also
the fallback: a refusal, an outage, a budget stop or a malformed answer all
resolve to exactly the screen that existed before this feature. Nothing here can
leave a user worse off than they were.

### The three rules the design turns on

1. **Render is synchronous.** Screens return HTML strings, so a model call
   cannot happen during render. Each screen reads the **cache** during render —
   so a return visit paints the live version with no flash — and only stashes a
   request on `window` for [liveAI.js](js/liveAI.js) to pick up in `attachEvents`
   when the cache misses. Same pattern the dashboard already used for
   `_tempGeneratedTodaysLog`.
2. **These calls are unasked for, so a failure is silent.** No toast, no error
   text. The console gets a warning; the user gets the suggestions they would
   have had anyway. The one exception is the idea filter, which the user presses
   a button for — that one says "Thinking…" and is allowed to take a moment.
3. **Automatic spend needs its own ceiling**, on top of the server quota.

### What is honest about the gating, and what is not

`consume_ai_quota` is the real ceiling and is now **per tier** — migration
[20260816_ai_quota_pro_tier.sql](supabase/migrations/20260816_ai_quota_pro_tier.sql),
which is the `p_pro_limit` argument batch 8 said to add when this shipped:

| | limit | note |
|---|---|---|
| trialing | 30/day | unchanged. Pro *features*, never Pro *spend* |
| active + base | 120/day | unchanged |
| active + pro | 300/day | new |

⚠️ **Adding a return column meant this could not be a `create or replace`** —
Postgres refuses to change a function's return type in place. The migration
drops the 3-arg signature and creates a 4-arg one in the same transaction, and
**re-grants**, because grants attach to the signature. Deploy order does not
matter: the currently deployed `chat` passes `p_user_id` by name and ignores the
extra column.

On top of that, a **client-side courtesy cap** on unasked-for calls: 12/day on
paid Pro, **6/day on trial**. Without it a quiet morning of page loads could eat
the 30 calls the chat coach needs later. It is keyed on the local date while the
server resets at midnight UTC — they drift by a few hours outside GMT, which is
harmless for a courtesy cap. A 429 or a Pro refusal sets a `stopped` flag and
**nothing is attempted again until tomorrow**: those answers will not change
before midnight, so retrying on every page load would burn requests to be told
the same thing. Verified — one call, then zero.

**The `feature: 'live-ai'` field is checked server side, and that is presentation
enforcement, not a spend ceiling.** A caller could simply omit the field and get
the ordinary chat treatment every account already has. What it stops is the
honest client path handing Pro output to a base account. Said plainly in a
comment in [chat/index.ts](supabase/functions/chat/index.ts) so nobody later
mistakes it for a cost control.

The tier comes back **from `consume_ai_quota`** rather than a second query, so
there is one place that decides what "pro" means — including the trial rule. The
price is that a refused Pro request has already spent one of the caller's own
calls. Deliberate: the app never makes that request, so the only thing it rate
limits is somebody poking at the endpoint.

### JSON mode — and it was retrofitted to the existing callers too

Jen asked for this to cover the Monday Plan drafting and the 90-day plan, not
just the new surfaces. Both now pass `json: true`:

- `generateMondayPlanDraft()` — the plan drafted from the Friday Review that
  pre-fills the Weekly Plan page
- `generate90DayActionPlan()` — the wizard and Regenerate Plan

`window.invokeChat(messages, options)` gained an optional second argument
(`feature`, `json`, `maxTokens`) passed straight through to the function body.
Omitting it behaves exactly as before.

Two things worth knowing about `response_format: json_object`:

- ⚠️ **OpenAI rejects the request outright if the word "json" appears nowhere in
  the messages.** The function checks for it rather than trusting the caller, and
  degrades to ordinary text if it is missing — a prompt edited later that drops
  the word loses the guarantee, not the whole request.
- The fence-stripping in `aiService.js` is **kept** as belt and braces, for
  exactly that degrade path.

The monthly review and the Executive Report return Markdown prose and were
deliberately left alone.

`chat/index.ts` also now **parses the body before consuming quota** — a malformed
request used to spend one of the day's calls — and clamps `max_tokens`.

### Two rules that keep the numbers honest

- **The Quiet Advisor's diagnosis and colour stay arithmetic.** The
  deterministic engine still decides *which* situation the founder is in — First
  Move, Pace Alert, Momentum, Conversion Drop — and keeps its colour and title.
  The model only rewrites the sentence. A red alert must mean the numbers said
  so, not that the model felt gloomy. What was wrong with these pulses was never
  the diagnosis, it was that the words were one hardcoded line telling every
  founder to contact three loyal past clients she may not have.
- **The Daily 3 is never rewritten once anything is ticked.** Checked twice:
  when the request is stashed at render, and again when the answer lands.
  Verified — with a task ticked, **no call is made at all**, so nothing is spent
  on an answer that would be discarded.

`getQuietAdvisorPulses()` was also being called **twice per render**, once inside
each pulse card. It is now worked out once.

### As built

- New [js/liveAI.js](js/liveAI.js), registered in `build_bundle.ps1` **after
  `proGate.js`** so `canUseLiveAI()` calls `isProUser()` from a file that loads
  first — not repeating the `stripeImport.js` hoisting accident.
- `canUseLiveAI()` is the single answer to "can this account use live AI",
  same shape as `canUseLeadPipeline()` / `canUseHistory()`.
- `businessBrief()` reads `getRevenueInsights()` and `getFunnelInsights()` and
  **recalculates nothing** — those already own the quarter-scoping and
  close-rate rules. It is deliberately *not* the coach's full system prompt,
  which is ~11KB now the whole user guide is injected: fine for a chat somebody
  started, wasteful several times a day for three short suggestions.
- `VOICE_RULES` is one shared block, so the four surfaces sound like the same
  app and the tone rules learned in batch 7 are stated once — calibrate to
  stage, a beginner has no past clients or list, an empty early quarter is
  normal rather than a failure.
- `liveAINote()` renders the quiet "written for your business" line. It returns
  something exactly when `proTeaser('live-ai', …)` returns nothing, so a card
  carries **one or the other, never both**. New `.live-ai-note` and
  `.live-ai-pending` in [css/components.css](css/components.css).
- Two **new teaser placements**, on the Weekly Plan and Notepad screens. The
  batch 8 table only covered the dashboard, which would have left three of the
  four surfaces silently worse for base users with no explanation.
- The cache lives in `localStorage`, **not the store** — the store is one JSON
  document synced wholesale to Supabase, so regenerable derived text does not
  belong in it. Same rule the Stripe import follows. Cleared on sign-out, on
  login, on signup and on quarter reset, so one business's suggestions never
  greet the next person on that browser.
- `escapeText()` in liveAI.js is named that way on purpose: `fridayReview.js`
  has a near-identical `escapeHtml()`, and the bundle flattens every file into
  one scope, so a second function of that name would silently replace it app-wide.
  **Merge them when something next touches both.**
- `keywordVerdict()` in coach.js is the old filter, extracted unchanged.

⚠️ **The build script strips imports with a per-line regex, so a multi-line
`import { … }` leaves its closing brace behind and the whole bundle stops
parsing.** Cost one build. Every import in the new and edited files is on one
line, and there is a comment at the top of liveAI.js saying why.

### Verified in the browser

On a **seeded local profile with every `sb-*` token deleted first**, so
`saveStore()` could not reach a real account (it only syncs when
`auth.getSession()` returns a session).

- **No session at all:** both automatic calls fire, fail, log a warning and fall
  back. No user-facing error. This is the real-world outage path.
- **Successful answers (stubbed transport):** Daily 3 swaps in the DOM *and*
  persists with `done: false`; pulse titles and colours unchanged while the
  messages are replaced; planner list rebuilt and its Apply buttons rebound and
  working, routing correctly by type.
- **Return visit: zero further calls**, live content straight from cache, no
  stale request left on `window`.
- **A ticked task blocks the swap** and prevents the call entirely.
- **429 and 403:** one call, `stopped` set, nothing on the second visit, no error
  on screen, dashboard intact.
- **Base tier:** one teaser per screen, no live note, **zero calls, no cache**,
  keyword pulses/suggestions/verdict all restored.
- No horizontal overflow at 1280px or 375px; no console errors on any screen.

The clearest single result: the base filter calls *"Start a TikTok channel to
drive sales"* **Strategic**, purely because the string contains "sales" — the bug
named in the plan. The live verdict returns **Busy work**, on the grounds that a
consumer channel does not reach HR leads at 20–80 person firms.

**Not verified:** that real model output is good and parses. Everything above the
transport is exercised; the transport itself was stubbed, because testing it
needs a signed-in account and this repo's rule is never to browser-test against
one. **First real-session run is the remaining check.**

### The AI allowance as a sellable difference — added 17 Aug 2026

Jen's point: if the plans differ on how much AI you get, the app should say so
rather than leaving it as an invisible server limit. **Cache is now bundle v66.**

⚠️ **This started as a bug, not a feature.** The base plan card said *"The AI
coach, 30 conversations a day"* — 30 is the **trial** rate. Every paying base
customer was being told they got a quarter of what they pay for. Nobody spotted
it because the one place that quoted a number was hardcoded.

- `BASE_FEATURES` in [account.js](js/screens/account.js) became `baseFeatures()`,
  so the AI line carries the number that applies to **the account reading it**:
  30 on trial, 120 on base, 300 on Pro. Verified in all three states.
- New `AI_DAILY_LIMITS` and `aiDailyAllowance()` in
  [proGate.js](js/components/proGate.js). ⚠️ **The numbers are duplicated from
  the `consume_ai_quota` defaults** — the server enforces, the client only says
  it out loud. Change one and you must change the other, or the app promises an
  allowance the database refuses. There is a loud comment on both sides.
- New `ai-allowance` Pro feature, `shipped: true` (the limits are real today —
  nothing to build). It sits **directly under `live-ai`** in
  `PRO_FEATURE_KEYS` on purpose: read alone it is a number, read after "planning
  written by the coach" it is the thing that keeps that working.
- "**Requests**", not "conversations". One request is one request whether it is a
  chat message, a 90-day plan or a refreshed suggestion — and on Pro the
  planning surfaces spend them too, so "conversations" would understate it.

**Copy note from Jen:** the first draft of the blurb explained the limit as being
so "nobody's bill can run away". She cut it — that is *our* reason for the cap,
not a benefit to the reader, and it invites a worry they did not have. Keep
customer copy on what they get. The kept version is in `PRO_FEATURES`.

### Warning before the wall — added 17 Aug 2026

Jen's question: wouldn't a heads-up as somebody nears the limit beat a static
number, and shouldn't it nudge base customers to upgrade? Yes to both.
**Cache is now bundle v68. `chat` is deployed as version 14.**

**A permanent counter was considered and deliberately rejected for the
dashboard.** A visible tally on a creative tool teaches people to ration it. A
base customer who uses eight requests a day would see a number every day quietly
asking whether they should use fewer — anxiety about a limit they will never
reach, in exchange for information that matters a few times a year. Counters
earn their place for things people actually run out of.

**The Account plan card is the exception**, and it is where the number lives:
`The AI coach, 120 requests a day — 37 used today`. The reader is already
thinking about plans there, so the same figure is context rather than pressure.
Nowhere else shows a running total.

**It needed no new infrastructure**, which is the part worth remembering. The
earlier note here proposed a `get_ai_quota_status` RPC. That was unnecessary:
`consume_ai_quota` already returns `used` and `quota` on **every** call and the
function was throwing them away except when refusing. It now attaches them to
the success response, so the client learns where it stands as a side effect of
work already being done. No endpoint, no polling, no extra query.

- ⚠️ **The field is `ceo_allowance`, not `usage`.** OpenAI's own response body
  has a `usage` object of token counts and we return that body wholesale, so
  `usage` would have collided. Verified that OpenAI's `usage` survives untouched.
- ⚠️ **"Requests", never "tokens".** The limit counts requests per day. Nothing
  in the app meters tokens, so calling them tokens would simply be wrong.
- `recordAiAllowance()`, `getAiAllowanceToday()`, `warnIfAllowanceLow()` and
  `clearAiAllowance()` live in [proGate.js](js/components/proGate.js) beside
  `AI_DAILY_LIMITS`. Stored under the **UTC** date, because that is what the
  server counter resets on — the local date would show a stale figure, or a
  fresh one that isn't, for anyone outside GMT.
- `getAiAllowanceToday()` returns **null**, not zero, when nothing has been
  recorded today. "Nothing asked yet" is not "0 used", and printing the latter
  would be inventing a fact. The Account line simply omits the suffix.

**The `background` flag is the important design detail.** `invokeChat` gained a
fourth option, kept client-side and stripped from the request body. The three
automatic live-AI surfaces pass `background: true`, so they record silently and
**can never raise the warning** — a toast appearing on page load saying "you've
used 80% of your AI" would alarm somebody who has just opened the dashboard and
done nothing. Everything the user presses a button for, including the idea
filter, warns normally.

Warning rules: once per UTC day, at 80% or above, and **not** at 100% — the
existing 429 message says it better at that point. The upgrade line appears only
for non-Pro accounts, and only because they are genuinely close and Pro
genuinely fixes it; the same line at 20% would be a nag.

Cleared on sign-out, login and signup — a usage count belongs to one person.
**Not** cleared on quarter reset: it is a daily counter and has nothing to do
with which 90 days you are in.

#### ⚠️ The Account page needed a read-only lookup after all — fixed same day

Jen pushed v67 and reported she could see nothing about usage on Account. The
deploy was verified good (v67 live, bundle byte-identical, every marker
present), so this was **a design gap, not a deployment failure**.

The cause: usage only appeared *after* an AI call completed in that browser
that day. Piggybacking on calls is right for the warning — you are always
mid-request when you approach a limit — and wrong for the Account page, which
is **the one screen you open without making a call**. So it showed the
allowance and no usage until something else happened to spend one.

The note above said a `get_ai_quota_status` RPC was unnecessary. It was not.
**Cache is now bundle v68.**

- Migration
  [20260817_ai_quota_status.sql](supabase/migrations/20260817_ai_quota_status.sql),
  applied and verified. Adds `get_ai_quota_status()` and extracts
  `ai_daily_limit()` so `consume_ai_quota` and the new reader cannot drift into
  disagreeing about the same account.
- ⚠️ **`get_ai_quota_status()` takes NO PARAMETER** and resolves `auth.uid()`
  itself. That is the only reason it can be granted to `authenticated`, unlike
  `consume_ai_quota`, which takes a user id and stays service-role only —
  with a parameter, anyone holding the public anon key could read somebody
  else's usage. **Do not add one.** Verified: `authenticated` has EXECUTE,
  `anon` does not, and the other two functions remain service-role.
- It consumes nothing, so opening Account costs no part of the day's quota.
- The Account row renders from what the browser knows, then is corrected by the
  server in `attachEvents`. The **quota shown comes from the server**, not
  `AI_DAILY_LIMITS`, so the number on screen is the one that will actually be
  enforced even if the two copies of the limits ever drift.
- Verified: "300 requests a day — 0 used today" on a fresh day, "— 32 used
  today" with real usage, and on an RPC failure the row falls back to the plain
  allowance line rather than breaking.

**The lesson worth keeping:** a number that arrives as a side effect of an
action is not available on the screen whose job is to *display* that number.
Ask what the page can know before it has done anything.

#### It needed to be its own card, not a line in the plan list

The first attempt appended "— 32 used today" to the AI row inside the plan
feature list. Jen rejected it, correctly: **a feature list says what the plan
includes; a meter says how much you have used.** Bolting the second onto the
first made the row do two jobs and read like an afterthought, and it put a
number somewhere nobody would think to look for one.

There is now an **AI usage card** at `#/account`, sitting between Your Plan and
Connected accounts and built in the same shape as Billing and Connected
accounts — heading with icon, the figure, then the explanation.

- `96 of 120` with **requests used today**, a progress bar, and "24 left today.
  Resets at midnight UTC."
- The bar uses **the same thresholds as the warning** — primary below 80%, amber
  at 80%, red at the limit — so the colour on this card and the toast can never
  disagree about whether somebody is running low.
- An explainer of what actually counts as a request, because "request" is
  otherwise a word people will guess at.
- Non-Pro accounts get one line — "Pro comes with 300 requests a day" — with a
  link carrying `data-pro-feature="ai-allowance"`, so it opens the existing
  modal through the delegated handler rather than needing its own.
- The plan row went back to being a plain feature: `The AI coach, 120 requests a day`.
- A failed lookup shows `— of 120` and says so. It must never show `0`, which
  would be indistinguishable from "you have used nothing today".
- ⚠️ At 375px the label was squeezing the figure onto two lines, splitting the
  number itself across the break. Fixed with `flex-wrap` on the row and
  `white-space: nowrap` on the figure, so the label drops below instead.

**Verified** across Pro/base/at-limit/nothing-used/lookup-failed, at 1280px and
375px: figures, bar widths and colours all correct, the Pro link opens the modal
without navigating, no horizontal overflow, no console errors from the card.

**Verified:** silent below 80%; warns at 80% with the Pro line on base and
without it on Pro; silent on a second call the same day; silent at the limit;
"1 AI request" singular; end-to-end through `invokeChat` with `window.db`
stubbed — background records without toasting and `background` does not leak
into the request body, a user call records and toasts, and OpenAI's `usage`
object survives. Account card correct with a reading, without one, and with a
stale reading from another day.

### Known and deliberate

- A Pro→base downgrade leaves today's already-written Daily 3 in place. It is
  saved in `dailyLogs` and she may be working from it; wiping it would be worse
  than letting it finish the day.
- The 32-bit cache fingerprint can in principle collide, showing one stale
  suggestion until the TTL expires. Not worth a real hash.

---

## Phase 2 — Item 5: a coach that remembers ✅ done 17 Aug 2026

The conversation lived in `window.ceoChatHistory` and died on every refresh. For
a product sold as a 24/7 board of directors, starting from nothing several times
a day was the single loudest thing undercutting the claim.

It now lives in the store as `coachChat`, so it survives a refresh and follows
the account to another device. `PRO_FEATURES['coach-memory'].shipped` is `true`,
which is what makes the chat-widget teaser delete itself and the Account plan row
stop reading *in build*. **Six of the nine Pro features are now live.**

### Where it is kept, and why not somewhere else

In the store — not its own localStorage key, not its own table.

`saveStore()` already upserts the whole store to `user_data` on every save, so
putting the thread there buys **cross-device sync for free**: a conversation
started on a phone is waiting on the laptop, with no migration, no RLS policy and
no second sync path to keep honest. A separate localStorage key would have been
device-only, which is half the feature. A dedicated table would have been a
migration, an RLS policy and a fetch path for something the store already does.

The price is that every save now carries the conversation. That is what the two
caps in [js/store.js](js/store.js) are for — `COACH_CHAT_MAX_MESSAGES` (40) and
`COACH_CHAT_MAX_CHARS` (20000), oldest dropped first, so the tail you are
actually still in survives. A thread at both ceilings adds roughly 20KB to a
payload that already carries a quarter of plans, sales and daily logs.

### Storage and context are two different numbers, deliberately

This is the part that would have been wrong if it had been one number.

| | Where | Value | Why |
|---|---|---|---|
| What is **kept** | `COACH_CHAT_MAX_MESSAGES` in store.js | 40 messages / 20000 chars | So you can scroll back |
| What is **sent** | `CHAT_CONTEXT_MESSAGES` in aiService.js | 12 messages / 8000 chars | So the reply stays cheap |

Storage is cheap; tokens are not. Once the thread survives refreshes it only ever
grows, and sending all of it would make every message cost more than the one
before it — **with nothing noticing, because the daily allowance counts requests,
not tokens**. This is the exact risk the sequencing note at the bottom of this
document flagged for item 5, and the two-number split is the answer to it.

`recentContext()` trims from the oldest end, which is what guarantees the newest
message — the question being asked right now — is always in what gets sent.

### The system prompt is deliberately never stored

`buildSystemPrompt()` is rebuilt from the live store on every single call and is
filtered out of anything that gets saved. A thread started last week is answered
against **this** week's numbers. Persisting it would have been the easy version
and would have had the coach quoting a revenue figure from a fortnight ago with
total confidence.

### As built

- **[js/store.js](js/store.js)** — `coachChat` in `defaultState` and the
  `getStore()` hydration, plus `getCoachChat()` / `saveCoachChat()` /
  `clearCoachChat()` / `trimCoachChat()`.
  - `saveCoachChat()` **returns what it wrote**, not what it was handed. The
    widget holds the same array in memory, and if that kept growing past the caps
    while the store trimmed, the two would drift until the next page load quietly
    shortened the conversation.
  - `resetQuarter()` **does not clear it**, and now says so in a comment. The
    thread is a conversation with a person about their business, not a record of
    one quarter's numbers; wiping it on the calendar turning over would
    reintroduce the exact problem this feature exists to fix.
- **[js/components/proGate.js](js/components/proGate.js)** — `canRememberChats()`,
  the same single-answer shape as `canUseLeadPipeline()` and `canUseHistory()`.
  Four places ask it: whether to read the thread back, whether to write it, what
  the Reset button warns about, and whether the teaser is still there.
- **[js/aiService.js](js/aiService.js)** — `recentContext()`. Also strips the
  `at` timestamp, which is ours for the date dividers and which **OpenAI rejects
  the request outright for**.
- **[js/components/chatWidget.js](js/components/chatWidget.js)** — reads the
  thread on open, writes it after each answer, renders date dividers.
  - Written **after the answer lands**, not after the question is sent. A stored
    user message with no reply comes back on the next load looking like a
    question the coach ignored. The existing `.pop()` in the catch block already
    handles the failure case, and nothing was saved.
  - The tier is read in `loadMemory()` rather than at init, because
    `revalidateAccess()` resolves asynchronously on load and opening the panel is
    the first moment the answer is actually needed.
- **[supabase/functions/chat/index.ts](supabase/functions/chat/index.ts)** —
  `MAX_INPUT_CHARS` (60000) and `MAX_INPUT_MESSAGES` (60), checked before
  `consume_ai_quota` so an oversized body costs the caller nothing and never
  reaches OpenAI. **Refused with 413 rather than truncated**: silently dropping
  the front of a prompt hands back a confident answer to a question nobody asked,
  and cutting a JSON instruction in half is worse than an error.

### The date dividers are the whole visible surface of this

`Saturday 15 August` / `Sunday 16 August` / `Today`, between the messages of one
day and the next. Without them a remembered conversation looks identical to one
you just had, and a reply referring to something "we said earlier" reads as the
coach hallucinating rather than as it doing its job.

Skipped entirely when everything on screen happened today — a single "Today" line
above a conversation you are in the middle of explains nothing and eats room in a
350px panel. Labels are built with `parseDateInput()`, not `new Date(str)`, or
everyone west of GMT gets yesterday's day name.

### What is NOT gated server side, and why that is right

Every other Pro feature has a server half. This one does not, and it should not.

The storage is the user's **own** `user_data` row. A base account faking the
client flag would gain the ability to store their own conversation in their own
row — no spend, no data belonging to anyone else, nothing to protect. Adding it
to `PRO_ONLY_FEATURES` would have been gating theatre.

The real cost risk was never the flag, it was the **input size**, which nothing
anywhere measured. That is what the 413 above is for, and it applies to every
caller rather than to a claimed feature name.

### Verified in the browser

Signed out first (`ceo_auth` and every `ceo_*`/`sb-*` key cleared) so `saveStore`
could not reach a real account, then seeded localStorage directly.

- **Pro:** a three-day thread restores on load with dividers reading
  `Saturday 15 August` / `Sunday 16 August` / `Today`; teaser absent; write →
  reload → restored; a same-day-only thread renders with **no** divider.
- **Base:** teaser present, greeting and all three quick-prompt chips shown,
  the stored thread neither read nor written. A Pro→base downgrade leaves the
  stored thread untouched and invisible, so re-upgrading gets it back.
- **Reset:** Pro wording says "for good, on this device and anywhere else you
  sign in"; store and memory both emptied; greeting and chips return.
- **Caps:** `recentContext` on 60 messages → 12, keys `role`/`content` only, the
  newest message always kept; four 5000-char messages → the newest alone.
  `trimCoachChat` on 100 → 40; on 30×2000 chars → 10 (exactly 20000); `system`
  rows, `null` and content-less rows all dropped; `at` backfilled; `undefined`
  safe on both.
- **375px:** widest bubble 316px inside a 348px column, no horizontal scroll on
  the panel or the body, no console errors.

⚠️ A false alarm worth not repeating: navigating from `http://host` to
`http://host/#/` is a **hash change, not a reload**, so the widget markup was
still the one built before the tier was seeded and the teaser looked like it was
leaking to a Pro user. It was not. Force an actual reload when testing anything
rendered once at init.

### Still to be tested against a real account

Everything above was verified signed **out**, with localStorage seeded by hand,
because `saveStore()` writes to the live `user_data` row on every save. That
leaves five things unproven — persistence across a real refresh, whether the
context window genuinely reaches the model, cross-device sync, the Reset button
end to end, and the base-tier behaviour. They are listed in full in
**"⏭️ PENDING — the next thing we do"** at the top of this document, and are part
of the end-to-end test project agreed for after the upgrade finishes.

### Known and deliberate

- The teaser markup is built once at init and never re-rendered, so a base→Pro
  change mid-session leaves it until reload. Pre-existing, and billing.js already
  reloads on a tier change.
- A Pro user with an existing thread never sees the three quick-prompt chips
  again — they only render for an empty conversation. The Reset button in the
  chat header brings them back, which is the right way round: you are mid
  conversation, not starting one.
- Trimming can leave the visible DOM showing more messages than memory holds,
  until the next load realigns them. Only reachable at 40 messages in one sitting.

---

## Phase 2 — Item 6: redo one week ✅ done 17 Aug 2026

Regenerate Plan is deliberately blunt: it replaces every week you have not
started yet. That is right when the quarter itself is wrong and wrong when a
single week stopped being realistic because a launch slipped or a client landed.
This is the second tool, and it is what the Pro copy meant by "keep the rest".

`PRO_FEATURES['week-regen'].shipped` is `true`. **Seven of the ten Pro features
are now live.**

### The rule that decides everything else

**Only unapplied generated weeks can be rewritten.** Not weeks the user wrote
themselves, and never a week they have applied and lived through. This is the
same rule `applyGeneratedPlan()` has followed since batch 2.2, and it lives in
exactly one place — `getRegenerableWeeks()` in [js/store.js](js/store.js). No
screen filters weeks itself, so there is one answer to "can this week change?"
and both entry points ask it.

`replaceGeneratedWeek()` re-checks it at write time rather than trusting the
caller, and matches on **plan id, not week number**. The store has held two rows
with the same `weekNumber` before (an applied one and a generated one); matching
on the number would have overwritten whichever came first, which could be the
applied week this feature promises never to touch.

### Nothing is written until the user has read the new week

The quarter regenerator commits as soon as the model answers, which is
defensible — the user has already declared that plan wrong. Here they are
choosing one week out of twelve and have every right to prefer the old one, so
the modal shows the rewrite first and only touches the store on **Use this
week**. "Keep the old one" costs them a request and changes nothing, which is
the correct trade.

### As built

- **[js/aiService.js](js/aiService.js)** — `buildPlanningContext()` extracted
  from `generate90DayActionPlan()` (identical string, both now share it) and
  `regenerateOneWeek(targetWeek, note)`.
  - The extraction is the point: a week rewritten against a thinner context than
    the quarter it belongs to reads as though a different app wrote it.
  - The prompt also carries what the quarter planner never sees — the week as it
    currently stands, the focus lines of the weeks either side, how far into the
    quarter they actually are, revenue against goal, and the user's own sentence
    about what changed. Rule 4 tells it that a reworded old week is a failure.
  - `weekNumber`/`monthIndex` are overwritten from the target after parsing. The
    model is told twice not to renumber; the store is what has to be right.
  - Shape-checked before returning, so a half-written week never reaches the
    preview. 1200 max tokens — a twelfth of the quarter planner's 8000.
- **[js/store.js](js/store.js)** — `getRegenerableWeeks()` and
  `replaceGeneratedWeek(planId, week)`, which returns `false` rather than
  half-writing, so the caller never toasts success over a no-op. Rewritten weeks
  carry `regeneratedAt`.
- **[js/components/weekRegen.js](js/components/weekRegen.js)** — new file, added
  to `build_bundle.ps1` after `toast.js`. Week picker, optional "what changed?"
  note (300 chars), preview, then Use / Keep the old one. Model output goes onto
  the page as `textContent`, never as HTML. Escape and backdrop-click are
  disabled while the request is in flight.
- **[js/screens/dashboard.js](js/screens/dashboard.js)** — the real button for
  accounts that pass `canRegenerateWeek()`, `proLock()` for everyone else.
- **[js/screens/roadmap.js](js/screens/roadmap.js)** — a **Redo this week**
  button on every unapplied week and a **REWRITTEN** chip on any week that has
  been. The roadmap opens the modal on the week that was clicked; the dashboard
  opens it with nothing chosen, because from there the user has not said which
  week they mean.
- **[js/components/proGate.js](js/components/proGate.js)** — `canRegenerateWeek()`,
  the `shipped` flip, and the missing tenth bullet in the `overview` list (it had
  nine bullets for ten features and this was the one absent).

### The PRO chip now sits on `proLock()` itself

Asked for by Jen on the dashboard button, done in the shared helper rather than
at that one call site, so the Revenue screen's PDF Export lock gained it too.
The padlock says "you can't press this"; the chip says why, without a click.
Inside a lock the chip fills solid brand yellow with dark text — a plain
`.pro-badge` would have been invisible there, its background being the same pale
yellow the button already sits on.

Note this is the opposite decision to the one in `showProModal()`, and both
still stand: the modal already carries a badge directly above its heading, so a
second on the title line reads as a mistake.

### Verified

Signed **out**, tier forced locally, `renderDashboard()` / `renderRoadmap()`
called directly and the model call stubbed — no account touched, no request
spent. Pro: button renders with the chip on one line at the same height as
Regenerate Plan, modal offers only the ten unapplied weeks, applied weeks 1–2
absent. Preview renders focus, Top 3 and triplet; **Use** replaced week 3 in
place and left the other eleven byte-identical; the roadmap then showed
REWRITTEN on 3 only. Base: lock with the chip, no Pro button, no roadmap
buttons. Empty state when every week is applied. Failure path (no session, real
`invokeChat`): modal stays open, button re-enables, error toast. Store guard
refuses an applied week and an unknown id directly. No horizontal overflow at
1280 or 375; the preview fits above the fold on mobile.

### Not done, and why

- **No server-side gate of its own.** It calls the same `chat` function as every
  other AI feature, so the quota is the real limit and Pro already has its own
  rate. A dedicated gate would be a second thing to keep in step with the tier
  for no cost the quota does not already bound.
- **The live model has never run this prompt.** Same limitation as everything
  else in items 4 and 5 — exercising it needs a signed-in account. It belongs in
  the end-to-end run at the top of this document: rewrite one week on a real Pro
  account and read what comes back, particularly whether rule 4 (a genuinely
  different week, not the old one reworded) actually holds.

---

## Phase 2 — Item 9: unlimited quick offers ✅ done 18 Aug 2026

The 1-Tap offers form was three fixed slots, hard-capped in the store since long
before there was a Pro tier to lift it for. Pro now grows the form a slot at a
time. Files: [js/components/proGate.js](js/components/proGate.js),
[js/store.js](js/store.js), [js/screens/revenue.js](js/screens/revenue.js).

### The rule that decides the shape of it

**The cap is on adding, not on holding.** A base account gets three slots. A Pro
account adds as many as it wants. An account that drops back to base **keeps
every offer it already had** and simply loses the Add button.

That is not generosity, it is the difference between a gate and a data loss bug.
The obvious implementation — `offers.slice(0, 3)` for anyone without Pro — would
have deleted a lapsed subscriber's fourth, fifth and sixth offers the next time
they touched an unrelated field on that form, with no warning and no undo. So
`updateQuickOffers` caps at `Math.max(quickOfferLimit(), existing)`.

The grandfathered allowance only ever **ratchets down**: clear a fourth offer's
name and the room it occupied goes with it, because `existing` is re-read from
the store on every save. There is no way to grow past three on base, only to
keep what you arrived with.

### Unlimited means unlimited

`quickOfferLimit()` returns `Infinity` for Pro, not a large integer. Both
`slice()` and `Math.max()` handle it correctly, and the plan list has promised
"Unlimited quick offers" since batch 8 — quietly enforcing 20 behind that word
would be the same kind of small dishonesty the teasers exist to avoid.

It costs nothing because **nothing is rendered per slot until the slot exists**.
The form draws `Math.max(3, saved.length)` slots and grows only when the button
is pressed, so an uncapped ceiling is a number in a comparison, never a hundred
empty boxes.

### The Add button does not re-render

Every other save on this screen calls `rerenderScreen()`. This one must not: the
render rebuilds the form from what is **saved**, so re-rendering to show a fourth
slot would wipe whatever was typed into the first three and not yet submitted.
The handler appends one slot to `#quick-offer-slots` with `insertAdjacentHTML`
and focuses its name field.

The render stays authoritative in the other direction — an empty slot somebody
added and never filled disappears on the next re-render, which is the
predictable behaviour and needs no cleanup code.

### As built

- **`proGate.js`** — `QUICK_OFFER_BASE_LIMIT` (3), `canUseUnlimitedOffers()` and
  `quickOfferLimit()`, following the same single-answer rule as
  `canUseLeadPipeline()` and the four gates after it. `shipped` flipped to
  `true` on `unlimited-offers` in the same session it shipped, per the honesty
  switch at the top of that file.
- **`store.js`** — `updateQuickOffers` asks `quickOfferLimit()` instead of
  hardcoding 3. It now imports from `proGate.js`, which is safe: proGate has no
  imports of its own so there is no cycle, and although it is concatenated
  *after* store.js in the bundle, `quickOfferLimit` is a hoisted function
  declaration only ever called at save time.
- **`revenue.js`** — `renderQuickOfferSlot(index, offer)` is the single piece of
  slot markup, used by both the render and the Add button so the two cannot
  drift. Fields are found by class (`.qo-name`, `.qo-price`, `.qo-source`) inside
  a `[data-offer-slot]` wrapper rather than by indexed id, because appending a
  slot must not depend on indexes lining up. The submit handler walks the slots
  that are actually on the page instead of counting to three.
- The `proTeaser` for base users is replaced by the **+ Add another offer**
  button for Pro — the same "the teaser deletes itself, so the control it was
  advertising takes its place" shape as the Stripe and pipeline cards above it.

### A real escaping bug, found on the way

The old markup interpolated saved values straight into `value="${o.name}"`. An
offer named `The 12" Bundle` broke out of the attribute and destroyed the rest of
the form. It now goes through `escapeText()` from `liveAI.js` — the one of the
codebase's three near-identical escapers that is actually exported. (That file's
note about merging them still stands and is still not done.)

### What is NOT gated server side, and why that is right

Same answer as item 5, for the same reason. Quick offers live in the user's own
`ceoPlanner_store`, mirrored to their own `user_data` row. A base account faking
the client flag would gain the ability to store four of their own strings in
their own row: no spend, no data belonging to anyone else, nothing to protect.
There is no edge function in this feature at all, so there is nothing to add a
`PRO_ONLY_FEATURES` entry to. Gating it server side would be theatre.

### Verified

Not browser-tested — the form writes to the store, and the house rule forbids
that against a signed-in account. Verified instead by **32 checks in Node**
driving the real `store.js`, `proGate.js`, `liveAI.js` and `revenue.js`,
concatenated exactly as `build_bundle.ps1` concatenates them, against a stubbed
`localStorage`:

- the gate for base, Pro, and a trial (which resolves to Pro without
  `ceo_plan_tier` being set), plus the `shipped: false` case, which must cap Pro
  at three;
- capping — base trims a 5-offer save to 3, Pro saves all nine, a short save is
  left alone;
- the downgrade path — six offers survive a re-save on base, the cap ratchets
  down to four when one is cleared, and does **not** ratchet back up;
- slot markup — labels numbered from the index, the `Instagram` default, the
  marker attribute and all three field classes present;
- escaping — `The 12" <b>Big</b> & Bold` survives with no raw angle bracket left;
- slot count — 3 for an empty account, 3 for two saved, 7 for seven saved;
- the read-back — a named, empty, named sequence saves as two dense entries;
- the plan list and overview bullet still name the feature, and `proTeaser`
  returns the strip for base and an empty string for Pro.

### Known and deliberate

- **No cap on the count.** A Pro user could press Add fifty times. The store
  already holds unbounded arrays (revenue entries, contacts, notes), and the
  1-Tap control is a `<select>`, which scales. If this ever bites, the answer is
  a warning, not a silent limit.
- **The Dashboard is untouched.** Both 1-Tap dropdowns already mapped over the
  whole array, so they grew on their own.
- **A base account with grandfathered offers sees more than three slots and no
  Add button.** That is the intended reading of the rule above, and the empty
  state for everybody else is still exactly three.

---

## Phase 2 — Item 7: weekly email digest 🚧 designed and Loops side started, 18 Aug 2026

**The plan's own assumption about this item was wrong, and Loops said so out loud.**

### ⚠️ It is NOT a transactional email

This document has said since batch 8 that item 7 goes out "via Loops — already
wired up in the `signup-sync` function". `signup-sync` uses the Loops **contacts**
API, which is a different thing from sending mail, and the natural reading of
"transactional plumbing" led straight to the transactional endpoint.

Opening the transactional composer puts this dialogue in front of you:

> Only use Transactional email for messages that require action or to be read in
> order for continued use of your platform. **Do not use for promotional
> purposes. Improper use can result in your account being suspended.**

A weekly summary nobody asked for on the day it arrives is not that. Building it
on transactional would have risked the Loops account that also carries the
welcome sequence (19 sends, 58% open rate) — for the sake of one feature.

### What it is instead: an event-triggered workflow

Verified against Jen's real account on 18 Aug 2026, not from documentation:

- Workflows have a trigger type **"Event received"**.
- That trigger has a **"Trigger frequency"** setting whose options are
  `One time` and **`Every time`** — "trigger the workflow every time the trigger
  occurs or only one time per contact". `Every time` is what makes a *weekly*
  anything possible, and it was the one fact that could have killed this design.
- Events carry `eventProperties`, which the email body reads as variables.

Two things fall out of this for free, and both were open problems:

1. **Unsubscribes are handled by Loops**, because this is now the marketing side
   rather than the transactional side. A recurring digest to UK subscribers needs
   a working opt-out under PECR; on transactional it would have had to be ours
   alone. We still add our own toggle in Settings, but it is no longer the only
   thing standing between us and a complaint.
2. **No template to keep in step.** The email lives in the workflow, and the data
   arrives as event properties.

### Already done in Loops

- Event **`weekly_digest`** created (Custom).
- Workflow **"CEO Planner Weekly Digest"** created in the *Retention* group:
  https://app.loops.so/workflows/cmsyx9hru01fp0i3d5d0dd02i
  Trigger = Event received `weekly_digest`, Trigger frequency = **Every time**.
- Left as a **Draft on purpose.** Pressing Start makes it live to real contacts,
  and that is Jen's call, not a build step.
- A blank transactional draft created before the warning was read has been
  deleted. The pre-existing "Your Payment Receipt" draft (May 23) is untouched.

### The rule that decides where the numbers come from

**The app computes, the cron delivers.** `getRevenueInsights()` is ~240 lines that
call `getStore()` and `getImportedSalesCache()` — it reads localStorage, in a
browser. A cron cannot call it.

Porting that maths into the edge function was considered and **rejected**: it is a
second implementation of every number the app already shows, which is exactly what
[[read-from-single-source]] forbids, and the history section above already
documents the failure mode — two places that "would eventually disagree, and the
user would have no way to tell which number was the real one".

So the app writes a small `digestSnapshot` into the store on load, holding
**display-ready strings** formatted by the app's own `formatAmount()` and
`store.settings.currency`. The edge function forwards those strings and contains
**no business maths at all**. That is the whole point of the design; if a later
change puts a calculation in the edge function, this item has regressed.

### What it costs, and why that is acceptable

The snapshot is as fresh as the last time the user opened the app. On 18 Aug 2026,
**10 of 11 `user_data` rows had not been saved in over a week** (newest: 14 Aug),
so this is not hypothetical — though those are mostly Jen's dormant test accounts.

The email therefore **must** carry a `snapshotAge` line ("as of 3 days ago"). An
email that states stale figures as current is worse than no email. Stated
honestly, "here is where you were when you last looked" is a re-engagement
message, which is the job.

**Live Stripe top-up was considered and deferred, not rejected.** `imported_sales`
is a real table with `occurred_at`, so "£450 came in while you were away" is a
clean SQL query and is probably the best line in the email. It is deferred because
only one account has a Stripe connection today, and because it needs a rule to
stay honest: **live numbers get their own line, never folded back into a restated
total.** A live revenue figure sitting beside a snapshot's own "against target"
line derived from a smaller total is an email that contradicts itself.

### ⚠️ The server-side Pro gate would email nobody

Every row in `profiles` has `plan_tier = 'base'`, **including the trial accounts**.
The client's `getPlanTier()` treats `subscription_status = 'trialing'` as Pro; the
database column does not. Gating the cron on `plan_tier = 'pro'` sends zero emails
and looks like a broken cron.

The rule already exists server side, written inline **twice** — in
`consume_ai_quota` and `get_ai_quota_status`, both as:

```sql
if v_status = 'trialing' then v_tier := 'pro'; end if;
```

Extract it into one `public.is_pro_account(uuid)` and have all three call it.
Access also requires `active`, or `trialing` with `trial_ends_at` in the future.

### The plan is the point, not the money — Jen, 18 Aug 2026

Asked what this email is for, Jen was unambiguous: **the week's actions are the
focus.** Revenue reporting matters, but it is context underneath the plan, not
the headline. The draft in [WEEKLY_DIGEST_EMAIL.md](WEEKLY_DIGEST_EMAIL.md)
follows that: win condition and the three actions above the fold, money in a
secondary block below a rule, `appUrl` deep-linking to `#/weekly` rather than the
dashboard, and three of the four subject lines leading on the week.

This also demotes the staleness problem. Numbers go stale in a week; **a plan
does not** — the actions someone set are still the actions they set. So the
snapshot's weakest property sits in the part of the email that matters least.

### The plan comes from the 90-day roadmap — Jen, 18 Aug 2026

Jen's question, and it changes the design for the better: take the week's actions
from **the generated 90-day roadmap** rather than the weekly planner, because the
roadmap is created during onboarding and the weekly planner is only filled in if
the user sits down and writes it.

The consequence that matters: **the roadmap never goes stale.** Week 7's actions
are week 7's actions whether the app was opened yesterday or a month ago. So
staleness now touches only the numbers block at the bottom, which is the least
important part of the email. Draft 1 had the problem sitting under the headline.

Which week is decided by `getWeeksElapsed(store)` at
[js/store.js:75](js/store.js), which already exists, already clamps to 1–12 and
already floors to whole days so it cannot flicker on a boundary. **Do not count
weeks a second way.**

Note this is deliberately **not** the existing "next unapplied generated week"
rule. Somebody who skipped applying weeks 2 to 6 gets handed week 2 by that rule
while actually living in week 7, and the email would post actions from a month
ago. Date-derived is the only honest answer for something that arrives on a
Monday.

Precedence: a plan the user **wrote or applied** for this week wins, because what
they committed to beats what was generated for them; otherwise the roadmap week;
otherwise **no email at all** — see below.

### No plan, no digest — Jen, 18 Aug 2026

An earlier draft had a "you have not set up yet" variant of the digest. Jen
rejected it, correctly: an email headed "here is your week" whose body is empty
is not a digest, it is an advert for a screen they never filled in. Several
accounts checked on 18 Aug 2026 had zero weekly plans, so this would have been a
visible share of sends.

**The `weekly_digest` event only fires for accounts with a plan to show.** That is
a condition in the edge function's query, not branching in the workflow.

Those accounts get a separate **`plan_nudge`** event and workflow instead — copy
drafted in [WEEKLY_DIGEST_EMAIL.md](WEEKLY_DIGEST_EMAIL.md). Two warnings on it:

- ⚠️ **Cap it.** A weekly "you still have not set up" arriving indefinitely to
  somebody who signed up and bounced is the shape of a spam complaint, on the same
  domain as the welcome sequence. Proposed rule, needing no new column: fire only
  while `profiles.created_at` is within 21 days, so at most three Mondays.
- ⚠️ **Check the welcome sequence for overlap before building it.** "CEO Planner
  Welcome Sequence" is Active, 19 sends, 58% opens, and targets exactly these
  people in exactly this window. The right answer may be one extra step inside
  that sequence rather than a second workflow. **Jen to read it first.**

### ⚠️ The active-plan rule is already copy-pasted three times

Which plan is "this week's" is decided by the same block in three places:
[js/screens/dashboard.js:65](js/screens/dashboard.js), again at
[dashboard.js:1010](js/screens/dashboard.js), and
[js/screens/weeklyPlanner.js:13](js/screens/weeklyPlanner.js). The rule is: the
newest plan that is either hand-written or an applied generated one, discarded if
it is more than 7 days old, and if there is none, the lowest-numbered unapplied
generated week.

**The digest must not become the fourth copy.** Extract it into one
`getActivePlan()` in `js/store.js` returning `{ plan, source }` where `source` is
`'active' | 'generated' | 'none'` — that third value is exactly what picks the
`planIntro` sentence, so the extraction pays for itself immediately.

### Built 18 Aug 2026 — the SQL and the edge function

**Migration `digest_recipients` is applied to production.** Two read-only
functions, both additive, nothing existing altered:

- `public.is_pro_account(uuid)` — the rule extracted from `consume_ai_quota`,
  where it was written inline. Verified against the live table: the helper and
  the inline expression both return **12 of 13** profiles, and the one `past_due`
  account is correctly excluded by both.
- `public.get_digest_recipients()` — Pro **and** not opted out **and** has a plan
  to show. Execute revoked from `anon` and `authenticated`; the function calls it
  with the service role key.

⚠️ **The two existing copies of the rule were deliberately NOT refactored onto
the helper.** `consume_ai_quota` gates live AI spend for everybody, and getting a
rewrite of it subtly wrong to save a duplicate is a bad trade to make in the same
session as a new feature. The helper is now the third copy, which is worse than
two, so **this is a real debt, not a decision to leave alone**. The behaviour is
proven identical by the count above, so the refactor is safe to do on its own,
with that same query as the check.

**Edge function** `supabase/functions/weekly-digest/index.ts` — written, **not
yet deployed**.

- Auth is a shared secret header (`x-digest-secret` against `DIGEST_CRON_SECRET`),
  not a JWT, because pg_cron has no user session. Deploy with `--no-verify-jwt`.
- `{ dryRun: true }` reports who would be sent and sends nothing.
  `{ onlyEmail: "..." }` filters the queue to one address whatever the query
  returns. **That is how the first real run stays safe.**
- Sends sequentially, not in parallel: it runs once a week against a small list,
  so concurrency buys nothing and a burst is how you get rate limited on the one
  morning that matters.
- Never logs the snapshot, which carries the user's own plan.
- Any missing or blank property falls back to "Not set yet…" rather than sending
  a blank line, because Loops has no conditional rendering and an empty property
  renders as a bare numbered bullet.

**It is safe to deploy today.** `get_digest_recipients()` returns **0** right
now, because no account has a `digestSnapshot` until the app writes one. The
function can be deployed and even run and it will email nobody.

Verified by **16 checks in Node** over the two pure functions lifted out of the
module: `describeAge` across today / yesterday / 3 days / 9 days / 40 days /
null / an unparseable string, and `buildProperties` for all-present, blank,
null and missing properties, that no value is ever blank, that `snapshotAge` is
added, that no extra keys leak, and that `firstName` is *not* sent (it is a Loops
contact property). Plus 6 SQL cases proving the recipient filter against
literals rather than by writing test data into a real user's row.

### Built 18 Aug 2026 — the app half, and the nudge

**Snapshot writer, in `js/store.js`:**

- `getActivePlan(store)` — the rule that was pasted in three places, now in one.
  All three sites refactored onto it (dashboard.js twice, weeklyPlanner.js once);
  the blocks were byte-identical, so this changed no behaviour.
- `buildDigestSnapshot(store)` — every value a finished display string. Roadmap
  week chosen by `getWeeksElapsed()`, own plan beating it when there is one.
- `refreshDigestSnapshot()` — writes at most once an hour, because `saveStore()`
  upserts the whole store on every call.
- Called from `js/app.js` beside `autoSyncStripeIfDue()`, for **every** plan, not
  just Pro: the server decides who is sent one, and an account that upgrades then
  already has a snapshot rather than missing its first Monday.

Verified by **30 checks in Node** against a stubbed localStorage: week derived by
date, roadmap week for TODAY rather than the lowest unapplied, own plan winning,
a plan over 7 days old being ignored, an unapplied generated week not counting as
active while an applied one does, gaps showing the prompt and no field ever
blank, currency and percentage formatting, the rotation covering twelve weeks
four ways with each landing exactly three times, the hourly rate limit, and the
snapshot surviving a save/load round trip.

**The nudge, both halves:**

- `get_nudge_recipients()` applied. Excludes everyone `get_digest_recipients()`
  returns, so **mutual exclusivity is guaranteed in SQL** rather than by matching
  conditions in two languages. Nobody can get both on one Monday. Verified:
  overlap is 0.
- Loops event `plan_nudge` and workflow **"CEO Planner Setup Nudge"** (Onboarding
  group), trigger frequency Every time, **Draft**.
- **Its email is fully written**, unlike the digest's. The only merge field is the
  contact First Name, which Loops already knows, and Loops offers a *fallback*
  for a missing one ("Hi there,"). The wizard link is hardcoded rather than passed
  as an event property, which is what made it composable today.

### ⚠️ The nudge would have emailed 8 people a falsehood

Checked against live data before switching anything on: the first version of
`get_nudge_recipients()` returned **8 accounts** while the digest returned 0,
because no account had a snapshot yet. Several of those 8 have twelve weekly
plans stored. Each would have been told their 90 days are not mapped out.

**Absence of evidence is not evidence of absence.** A nudge now requires a
snapshot that EXISTS and reports no plan — the app having looked and found
nothing, rather than the app never having looked. Both queries now return 0,
which is the honest state, and the nudge self-arms once the app ships.

### Bundle rebuilt: **v77**

`?v=` in index.html, `CACHE_NAME` and `?v=` in sw.js all bumped together and
checked for stragglers. Bundle parses; the 30 snapshot checks pass against it.
**Not pushed — that is Jen's.**

### Built 18 Aug 2026 — the opt-out and the cron

**Settings opt-out.** `canUseEmailDigest()` added to proGate beside the other
six gates. The existing `email-digest` teaser turns into a real switch once the
account has the feature, the same "teaser deletes itself, the control takes its
place" shape as the Stripe, pipeline and quick-offer cards. Saved on change
rather than on form submit, because it sits above the reminder checkboxes which
already save themselves.

**Absent means ON**, in the app and in `get_digest_recipients()`. An existing Pro
user should not have to find a switch to start receiving something their plan
includes. Both sides read the same default, so there is one rule.

⚠️ `shipped` on `email-digest` is still **false**, deliberately. The feature does
not work yet, so `canUseEmailDigest()` is false and Settings still shows the
teaser rather than a switch that does nothing. Flip it in the session it really
ships, per the honesty switch at the top of proGate.js.

**The cron.**

- `pg_cron` and `pg_net` enabled (both Free plan, neither was installed).
  `supabase_vault` was already there at 0.3.1.
- `weekly-digest` **deployed**, version 1, `verify_jwt: false` — pg_cron has no
  user session, so the function checks the shared secret itself.
- Job `weekly-digest`, `0 7 * * 1` (07:00 UTC Monday). Early on purpose: the
  email is about the week you are starting, so it should arrive before the day
  is decided. Jen's audience is UK-based, so that is 07:00 or 08:00 local.
- The secret is in **Vault** as `digest_cron_secret`, not in the job body, since
  `cron.job` is readable by anyone who can read the catalog.

⚠️ **The job is created with `active = false`, and one manual step is needed.**
A migration cannot set an edge function secret. Until the same value is added in
the dashboard as `DIGEST_CRON_SECRET`, the function returns 500 and an active
job would log a weekly failure. Jen pastes it (Edge Functions → weekly-digest →
Secrets), then:

```sql
select cron.alter_job((select jobid from cron.job where jobname = 'weekly-digest'), active := true);
```

The value is in Vault; read it back with
`select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret';`

### Built 18 Aug 2026 — the digest email body is written

**v77 confirmed live** on the fourth check: `?v=77`, `cache-v77`, and both
v77-only symbols (`refreshDigestSnapshot`, `email-digest-toggle`) present in the
served bundle.

⚠️ **The earlier push failed for a reason worth remembering: GitHub Pages serves
`github_deployment/`, NOT the repo root.** Root was at v77 while the deployment
copy sat at v76 without any new code, so a perfectly good push shipped nothing.
Both trees were then synced file-by-file and verified byte-identical. This
contradicts an older note claiming Pages serves the root; trust this one.

**How event properties reach the composer** — the mechanism, since it cost an
hour to find and is not documented anywhere obvious:

1. Open the **Event received** node → **Edit event properties** → add each name
   (type String) → **Update**. This is the step that matters.
2. They then appear in the email composer's `{}` picker under an **EVENT
   PROPERTIES** heading, *below* the ten contact fields. **You must scroll the
   picker** to see it, which is why it looked like they were missing.
3. Firing an event does **not** do this. That theory was wrong.

All 16 declared. Each insertion also offers **fallback text**, which is how the
greeting reads "Hi there," rather than "Hi ," for a contact with no first name.

**Body composed**, subject *"Your three for this week"*, all 16 fields in place.

Two traps hit while typing it, both fixed, both worth knowing before editing:

- **The editor auto-converts "1. " into a numbered list.** Typing "2. " and
  "3. " on the following lines then produced "2. action2" and "3. action3",
  numbered twice. Type the first item only and let the list continue itself.
- **A block converted from list to paragraph stays selected**, and `ctrl+End`
  did not clear it, so the next typing silently replaced `priorityNudge`. It was
  spotted only because the field counter read 15 instead of 16. **Check that
  counter after editing**: it is the quickest proof nothing was clobbered.

Still plain paragraphs rather than styled headings. Content and structure are
right; the visual pass is Jen's, and is exactly the kind of thing the visual
editor is for.

### 🟢 LIVE — 18 Aug 2026

Jen gave the go-ahead and all three switches were thrown:

- **"CEO Planner Weekly Digest"** workflow → **Active**
- **"CEO Planner Setup Nudge"** workflow → **Active**
- **cron `weekly-digest`** → `active = true`, `0 7 * * 1`, secret present in Vault

**Checked before pressing anything, and this is why it was safe:** the recipient
queries returned **1 digest and 0 nudges**, and that one recipient is **Jen's own
address**, on her own hand-written plan ("Here is the week you set for yourself",
snapshot taken 20:06 that evening). The first real run, Monday 24 Aug 07:00 UTC,
sends exactly one email, to Jen. Nobody else is in range until they open the app
and a snapshot is written for them.

That also proved the whole pipeline end to end for the first time: v77 live →
app opened → `refreshDigestSnapshot()` wrote a snapshot → `get_digest_recipients()`
picked it up.

### ⚠️ Going live forced the `shipped` flag, and it would have been a real bug

`email-digest` was still `shipped: false`, which meant `canUseEmailDigest()` was
false, which meant **Settings showed the teaser rather than the opt-out switch**.
Anyone starting to receive a Monday email would have had no way to stop it inside
the app — only the Loops unsubscribe, which is account-wide and would also have
taken them off Jen's ordinary broadcasts. Somebody wanting to mute one email would
have silently left the whole list.

Flipped to `true` in the same session the feature shipped, exactly as the honesty
switch at the top of proGate.js requires. **Bundle rebuilt to v78**, `?v=` and
`CACHE_NAME` bumped, and *both* trees synced — including `github_deployment/`,
which is the one Pages actually serves.

⚠️ **v78 is not pushed.** Until it is, the opt-out is invisible. There is a week
before the first send, so there is time, but this is the one outstanding item
that matters.

### Debt paid 18 Aug 2026 — the Pro rule now has one definition

`consume_ai_quota` and `get_ai_quota_status` each carried their own inline copy
of the tier rule, and `is_pro_account()` made three. All now call one function.

⚠️ **The obvious fix was wrong and would have cost money.** Calling the boolean
`is_pro_account()` from `consume_ai_quota` looks right and is not:
`consume_ai_quota` needs to tell **"no access at all"** (a lapsed subscriber, which
it answers with `no_access`) apart from **"has access, base tier"**. A boolean
collapses the two, and the failure is silent and *generous* -- a lapsed account
handed the base allowance instead of being refused.

So the extraction returns **both** values:

```sql
public.account_access(uuid) returns table (has_access boolean, tier text)
```

`is_pro_account()` is now a thin wrapper over it. Each caller takes what it needs.

**Verified behaviour-preserving before and after:**

- `account_access` vs the old inline expression, row by row: **0 of 13 disagree**
- tier distribution unchanged against the pre-refactor baseline: **pro 12, no
  access 1**
- `is_pro_account` still **12 of 13**; digest recipients 1, nudge 0
- `consume_ai_quota`: unknown user → `no_profile`, lapsed `past_due` →
  `no_access`. Both paths return *before* the `ai_usage` insert, so the test
  consumed no quota from anyone.

Everything is `create or replace`, so reverting is one statement.

### The nudge email got its button too

Jen paused the workflow, the text link became a **Map out your 90 days** button
pointing at `#/wizard`, and it was resumed to **Active**. URL hardcoded rather
than a variable: the nudge trigger has no declared event properties, and the
wizard link is a constant.

### Still to build

1. ~~`getActivePlan()` extracted~~ ✅ done 18 Aug 2026.
2. ~~`digestSnapshot` writer in the app~~ ✅ done 18 Aug 2026. Was: — display-ready strings only, from
   `getActivePlan()`, `getWeeksElapsed()`, `getRevenueInsights()` and
   `getFunnelInsights()`. Nothing recalculated. Actions must never be sent empty;
   substitute the fallback line in WEEKLY_DIGEST_EMAIL.md or Loops renders a bare
   bullet. `priorityNudge` rotates on `weekNumber % 4` — **not `Math.random()`**, or
   nobody can work out afterwards what was sent to a given person. Four variants
   against a twelve week quarter means each lands exactly three times.
   `freshnessNote` is deliberately **not** rotated: it is a factual caveat, and
   varying a caveat's wording makes it read as copy rather than fact.
3. ~~`public.is_pro_account(uuid)`~~ ✅ applied. **Still owed:** refactor
   `consume_ai_quota` and `get_ai_quota_status` onto it, on their own, checked
   with the 12-of-13 count query above.
4. An opt-out in Settings (`settings.emailDigest`), defaulting **on** for Pro,
   carried into the snapshot so the function can read it.
5. ~~Enable `pg_cron` and `pg_net`~~ ✅ done. Was: — both are available on this project and both
   are free-tier (checked 18 Aug 2026; neither is installed yet).
6. ~~Edge function `weekly-digest`~~ ✅ written 18 Aug 2026. **To do:** set
   `DIGEST_CRON_SECRET`, deploy with `--no-verify-jwt`, then a `dryRun` call
   before anything else.
7. ~~A Monday cron calling it.~~ ✅ created, **inactive** pending the
   DIGEST_CRON_SECRET paste above.
8. Build the email in the workflow from
   [WEEKLY_DIGEST_EMAIL.md](WEEKLY_DIGEST_EMAIL.md) — drafted 18 Aug 2026,
   awaiting Jen's review. Signs off **"Speak soon, Jen"**, not "Jen x". See
   [[ceo-planner-email-signoff]].
9. Test to Jen's own address only, then Start the workflow. **Do not press Start
   without asking** — it is live mail to real contacts.
10. Flip `shipped: true` on `email-digest` in `proGate.js` in the same session it
   ships, and add `canUseEmailDigest()` beside the other five gates.

### Not started, and deliberately

Emailing the branded PDF report still belongs with this item, for the reason it
always did — but it needs the workflow proven first. It is now *easier* than the
old plan assumed: an event property carrying a link, rather than an attachment.

---

## Deployment, 17 Aug 2026 — and the trap that caught us again

**Backend is live. The app is not, until the next push.**

| Piece | State |
|---|---|
| Migration `ai_quota_pro_tier` | ✅ applied to production, verified |
| Migration `ai_quota_status` | ✅ applied to production, verified |
| `chat` edge function | ✅ deployed as **version 14**, smoke-tested |
| App bundle v67 | ✅ pushed and verified live 17 Aug 2026 |
| App bundle v68 | ✅ pushed 17 Aug 2026 (per Jen) |
| `chat` function **version 15** — the 413 input ceiling | ✅ deployed 17 Aug 2026, smoke-tested |
| App bundle v69 — item 5 | ✅ pushed and **verified live** 17 Aug 2026 |
| App bundle v70 — item 6 | ⏳ built at root, **`github_deployment/` not re-synced, not pushed** |

**v70 is app-only.** Item 6 adds no migration and no edge function change — it
calls the existing `chat` function with a smaller payload than the 90-day plan
does, so there is nothing to deploy on the backend and no ordering question.
`components.css` went to `?v=25` with it.

**Version 15 deployed and verified.** `verify_jwt` still true, `import_map` still
true, `deno.json` included. Smoke tests: CORS preflight 200, no auth header 401,
bad JWT 401 — all identical to version 14.

The **413 path could not be exercised live**, and that is by design rather than
an omission: the gateway's auth check runs before the function body, so reaching
the guard needs a real signed-in token, and testing that would mean driving a
real account. The guard's arithmetic was checked at its boundaries instead — 60
messages passes and 61 refuses, 60000 characters passes and 60001 refuses, the
largest real request (the 90-day plan, ~6KB) and a full 12-message coach window
both pass comfortably, and a `null` entry in the array does not throw.

⚠️ Ordering note for next time: the v69 client was safe **ahead of** the function
either way, because it only ever sends *smaller* payloads than before. The 413 is
a hole being closed, not a dependency of item 5.

ℹ️ Version 14's deployed source differed from the repo in **one comment only** —
the ```` ```json ```` in the JSON-mode note had been stripped and two lines
rewrapped, presumably by hand at deploy time. Functionally identical, and version
15 is now the repo's copy verbatim. Worth knowing that the deployed source has
been hand-edited before: read it back rather than assuming it matches.

### Sync done 17 Aug 2026 — v69

`robocopy /MIR` on `css/`, `js/` and `supabase/`, plus the thirteen top-level
files. **Verified by hash, 71 files, zero mismatches**, and in both directions —
no file missing from the copy, no orphan left in it. The checks that actually
catch a bad push both pass: `github_deployment/index.html` requests `?v=69`,
`sw.js` carries `ceo-planner-cache-v69` and `?v=69`, and the five symbols only
this session's code has (`canRememberChats`, `renderConversation`,
`trimCoachChat`, `recentContext`, `saveCoachChat`) are all present in the
deployed bundle.

`README.md` and `.gitignore` deliberately untouched and confirmed still the
deployment-specific ones. `sales_page/` is not in the sync list above; checked
this time and it has not drifted, so it was left alone.

**Pushed by Jen and verified live the same day.** The live site requests `?v=69`,
`sw.js` carries `ceo-planner-cache-v69`, and the live `js/bundle.js` is
**byte-identical** to the synced copy (781,745 bytes, `cmp` clean) — as are
`index.html`, `sw.js`, `USER_GUIDE.md`, `manifest.json` and all three CSS files.

The symbol check that this document keeps insisting on: `canRememberChats` (5),
`coachChat` (6), `saveCoachChat` (3), `clearCoachChat` (2), `trimCoachChat` (2),
`recentContext` (3), `CHAT_CONTEXT_MESSAGES` (3), `renderConversation` (2) — all
present in the *live* bundle, and `PRO_FEATURES['coach-memory'].shipped` reads
`true` there. The regenerated user guide baked into the bundle carries the new
"Does your coach remember the conversation?" section, so the live coach can
answer questions about its own memory without inventing the answer.

**Byte-comparing the live file against the synced copy is the strongest version
of this check** and costs one `curl` and one `cmp`. It subsumes both older tests:
a stale push fails on size, and a partial sync fails on content. Prefer it to
grepping for symbols when the local copy is still to hand.

(Version 13 was item 4; **version 14** added the `ceo_allowance` passthrough. The
deployed source was read back and matches the repo.)

Verified after the migration: signature is
`consume_ai_quota(uuid,integer,integer,integer)` returning five columns, with
`service_role` the only grantee and **no leftover 3-arg version**. The function
smoke-tests clean — CORS preflight 200, no auth header 401, bad JWT 401.

⚠️ **Deploying the function needs `deno.json` in the `files` array.** The stored
`import_map_path` points at it, so deploying `index.ts` alone fails with
"import map path does not exist". It is already in the repo at
`supabase/functions/chat/deno.json`; just include it.

**Backend-ahead-of-client is safe here** and was checked before deploying: a v63
browser sends `{messages}` only, so `feature`/`json`/`maxTokens` come through as
null/false and the function behaves exactly as version 12 did.

### ⚠️ The deployment folder was pushed without being re-synced

A push went out and **changed nothing**. The live site still requested `?v=63`,
byte-identical to the old `github_deployment/js/bundle.js` (677,713 bytes). The
folder had never been re-synced from root — a line this document has carried
under items 1, 2 and 3 without it being done.

The diff, once run properly, was unambiguous: **`js/screens/history.js` (item 3)
and `js/liveAI.js` (item 4) did not exist in the deployment folder at all**, so
those two features could not have shipped no matter how many times it was pushed.

**Check for a missing file, not just a changed one.** A stale copy of a file that
exists is obvious the moment you look; a file that was never copied is invisible
until you diff the trees. The reliable test is the one already written here:
**read the `?v=` the live `index.html` requests, then grep the live bundle for a
symbol only the new code has** (`canUseLiveAI`, `renderHistory`). Both were zero.

Now re-synced and verified file-by-file: every app file under `css/`, `js/` and
`supabase/`, plus `index.html`, `sw.js`, `manifest.json`, `_redirects`,
`USER_GUIDE.md`, `PRODUCT_SYNOPSIS.md`, `build_bundle.ps1` and the icons, hashes
identical to root. `robocopy /MIR` was used for the trees, so a file deleted at
root also disappears from the copy.

**Deliberately NOT overwritten:** `github_deployment/README.md` and `.gitignore`.
The README covers deploy steps and the cache-bump rule and is not the root one —
confirmed still intact after the sync. Don't add them to the copy list.

---

## Phase 2 — Pro tier, in build order

Do these **after** batches 1–4. Each is its own session. Ranked by how defensible the
value is, not by effort. Batch 8 above is the prerequisite for all of them: gate every
one with `proLock()` / `isProUser()` in the client **and** server side in the edge
function, and add its key to `PRO_FEATURE_KEYS` in `settings.js` if it isn't there.

1. **Payment integration — Stripe read-only import.** Manual revenue entry is
   the highest-friction thing in the app and the likeliest cause of quiet churn.
   Auto-imported sales make every metric trustworthy with zero user effort. This is
   the killer feature. PayPal is **item 10**, not part of this one.
2. ~~**Real lead pipeline.**~~ ✅ **Done 16 Aug 2026** — see "Phase 2 — Item 2"
   above. Named contacts with stages, follow-up dates and a gone-quiet view at
   `#/pipeline`, counted additively into `getFunnelInsights()`.
   Note `effectiveCloses = Math.max(salesCount, totalCloses)` in
   [js/screens/revenue.js](js/screens/revenue.js) is **still there** and still
   papering over the gap for anyone logging leads in bulk. It is now avoidable
   rather than gone: a user working entirely through named contacts gets real
   closes and the `Math.max` never bites. Removing it would break the people
   who only log bulk leads, so it stays until they have a reason to move.
3. ~~**History and comparison.**~~ ✅ **Done 16 Aug 2026** — see "Phase 2 — Item
   3" above. Quarter-over-quarter and a year view at `#/history`, with the live
   quarter compared against where the last one stood on the same day rather than
   against its finished total.
4. ~~**Live AI everywhere.**~~ ✅ **Done 17 Aug 2026** — see "Phase 2 — Item 4"
   above. All four keyword engines now have a live half and stay as the base
   tier and as the fallback. `consume_ai_quota` gained the `p_pro_limit`
   argument this list said to add when it shipped, and JSON mode was retrofitted
   to the 90-day plan and the Monday plan draft at the same time.
5. ~~**Persistent AI coach memory.**~~ ✅ **Done 17 Aug 2026** — see "Phase 2 —
   Item 5" above. The thread lives in the store as `coachChat`, capped at 40
   messages, and syncs across devices for free because the store already does.
   What is *kept* and what is *sent to the model* are deliberately two different
   numbers (40 vs 12); the token risk this list flagged below is answered by that
   split plus a 413 input ceiling in the `chat` function.
6. ~~**Per-week roadmap regeneration**~~ ✅ **Done 17 Aug 2026** — see "Phase 2 —
   Item 6" above. One unapplied week at a time, from the dashboard or from the
   week's own card on the roadmap, previewed before anything is written. The
   rule from 2.2 that made this possible is also the rule that bounds it: a week
   the user has applied is never rewritten by the app.
7. **Weekly email digest** via Loops. 🚧 **Designed 18 Aug 2026, Loops side
   started** — see "Phase 2 — Item 7" above. Works when the app is closed, unlike
   browser notifications. ⚠️ **This line used to say "already wired up in the
   `signup-sync` function", and that was misleading**: `signup-sync` uses the Loops
   *contacts* API, not a sending API, and reading it as "the plumbing is done" leads
   straight to the transactional endpoint, which Loops explicitly forbids for
   recurring summaries. It is an **event-triggered workflow**, not a transactional
   email.
8. ~~**Branded PDF export.**~~ ✅ **Built 18 Aug 2026** — `js/components/pdfReport.js`,
   behind the `📄 PDF Report` button on the Revenue screen, gated by
   `canExportPdf()`. Built exactly as decided below: a self-contained HTML
   document in an iframe, printed by the browser's own dialogue. Every figure
   comes from `getRevenueInsights()`, `getFunnelInsights()` and
   `getPipelineInsights()` — see [[read-from-single-source]]. The AI Executive
   Report rides along via `rememberAiReport()` when one was generated in the
   same browser session.

   ⚠️ **Built ≠ shipped.** It sat in root at v73 while the live site served v72
   *without the file at all*, so the Pro modal correctly said "still being
   built" for a finished feature. Trees synced 18 Aug 2026, pushed the same day:
   **v75 is confirmed live**, carrying the file and `shipped: true`. The lesson
   stands even though this instance is closed — check the trees and the live
   `?v=` before believing a screenshot.

   **Customisation pass, 18 Aug 2026 (v75).** The report was one fixed shape for
   everybody, and an audit against its own blurb found two real shortfalls. Both
   are fixed, plus the customisation Jen asked for:

   - **Section tickboxes** in the modal — revenue by week, funnel, sources, every
     transaction, open pipeline, coach's summary. Flipping one rebuilds the
     document and repaints the preview, and the choice is saved to
     `settings.reportOptions`. Everything the feature was *sold* on defaults to
     on, so an existing user's report is unchanged until they touch a switch.
   - **Every transaction** — date, offer, source, note, amount for every sale in
     the quarter, newest first, with a total. Uncapped on purpose (it is the audit
     trail, unlike the pipeline table which cuts off at 20) and its `thead`
     repeats across printed pages. **Defaults to OFF**: it is the one section that
     can run to pages and nobody asked for it in the report they already have.
   - **"Prepared for"** free-text line, saved to `settings.reportPreparedFor`,
     printed under the date in the masthead. Debounced 400ms before saving, since
     `saveStore()` upserts to Supabase on every write.
   - **Share bars** beside each revenue-source percentage. The blurb sells "your
     numbers and your **charts**" — plural — and the weekly chart was carrying
     that claim alone.
   - A hint under the options, shown only when business name or logo is unset,
     pointing at Settings. Both were always read by the report; there was just no
     way to tell that from inside it.

   **Two CSS tokens were never defined anywhere**, found while doing the above and
   fixed in `variables.css` v17. `--color-bg-light` is referenced **34 times across
   11 screens** (dashboard, revenue, coach, roadmap, settings, wizard, weekly
   planner, monthly review, quarter reset, account, components.css) — every one of
   those panels, progress tracks and spinner rings rendered transparent.
   `--color-error` is referenced on three error messages, including the "Executive
   AI Coach failed" warning, which rendered in ordinary body text. Values chosen to
   match what the app already uses (`#F1F5F9`, and `.btn-danger`'s `#B42318`).
   A full referenced-vs-defined sweep now comes back empty; it is worth re-running
   after any CSS work:

   ```bash
   grep -rho "var(--[a-zA-Z0-9-]*" css/ js/ | sed 's/var(//' | sort -u > /tmp/ref.txt
   grep -rho -- "--[a-zA-Z0-9-]*:" css/ | sed 's/:$//' | sort -u > /tmp/def.txt
   comm -23 /tmp/ref.txt /tmp/def.txt
   ```

   Verified by 34 checks driving `buildReportHtml()` in Node against a stubbed
   store: defaults, every switch removing its own section, transaction ordering
   and total, HTML escaping of user notes, options persistence including partial
   and non-boolean saves, and the coach section appearing only once a summary
   exists. Not browser-tested — the modal writes to the store, and the house rule
   forbids testing that against a signed-in account.

   Not done, deliberately: no email leg (that is item 7), and generated reports
   still do not persist across closing the modal — `lastAiReport` is
   session-scoped on purpose. Persisting them remains the cheap base-tier
   answer described below, ~30 lines, and is still unbuilt. **Note the tension
   with the tooltip**, which says the AI write-up is included: true in the session
   that generated it, silently not true afterwards.

   **Decided 14 Aug 2026:** build this as a styled, self-contained HTML report that
   prints to PDF via the browser's own print dialogue — brand colours, the KPI cards,
   the revenue chart as inline SVG, source breakdown and pipeline table. No library,
   no build step. Rejected generating real .xlsx: SheetJS is ~500KB from a CDN and
   its free build barely styles anything. CSV stays as the plain *data* export (done
   in batch 7); this is the *presentation* export, and the two should not be merged.

   **Also decided:** emailing the Executive Report belongs here rather than in the
   base tier, and should be built alongside item 7 — both need the same Loops
   transactional plumbing, so doing email on its own means standing that up for a
   single button. The cheaper base-tier answer to the same need is to persist
   generated reports in the app so they survive closing the modal, which is roughly
   30 lines and no new infrastructure.
9. ~~**Unlimited quick offers.**~~ ✅ **Done 18 Aug 2026** — see "Phase 2 — Item
   9" above. The cap moved out of `js/store.js` and into `quickOfferLimit()` in
   proGate, and the 1-Tap form grows a slot at a time on Pro. It was the clean
   gate this line promised, with one thing the line did not anticipate: the
   naive version silently deletes a lapsed subscriber's extra offers, so the cap
   is on *adding*, not on holding.
10. **PayPal sales import.** ✅ **Built and LIVE 19 Aug 2026** — see
    "Phase 2 — Item 10" below. The credential question is answered, the
    `paypal-connect` / `paypal-sync` pair exists, and the Account card connects
    it. `PAYPAL_IMPORT_LIVE` in [js/components/proGate.js](js/components/proGate.js)
    is now `true`, so the copy names both processors everywhere and the connect
    card is open to every Pro account. ⚠️ Jen chose to flip it **before** a real
    sale had ever been imported — the exclusion side is proven on live data, the
    positive path is not. See "what to watch" in the item 10 section below.

---

## Phase 2 — Item 10: PayPal sales import ✅ live 19 Aug 2026

The second processor for item 1, and the promise three lines of UI copy have been
making since 16 Aug. Built in one session because item 1 had already proven the
shape: `imported_sales` needed **no migration**, exactly as predicted.

### The credential question — answered

The plan refused to let this start until someone verified "whether PayPal offers a
genuinely read-only permission". It does, with a real difference from Stripe.

- **The scope is real and narrow.** `https://uri.paypal.com/services/reporting/search/read`,
  granted by ticking **Transaction Search** on a REST app, is the only permission
  the import needs. The transaction history does come from that permission, so the
  belief recorded on 16 Aug was right.
- **But the credential does not announce itself.** Stripe's whole design rests on
  `rk_` vs `sk_` being visible in the string, so `stripe-connect` can refuse a
  dangerous key before using it. A PayPal client ID and secret look identical
  whatever the app can do.
- **What replaces the prefix check:** the OAuth token response carries a `scope`
  field. So the credential is still inspected before it is stored, one round trip
  later, against PayPal rather than against a string. `paypal-connect` refuses
  anything without the search scope and records the full granted list in
  `paypal_connections.granted_scopes`.

⚠️ **One deliberate softness, and it is the thing to revisit first.**
`REFUSE_WRITE_SCOPES` in `paypal-connect` is **false**. A PayPal REST app has
"Accept payments" enabled out of the box and it is *not verified* that a live app
can be created without it. Refusing write scopes outright could therefore mean
nobody can ever connect, with an error blaming the user for something they cannot
change. So the first release **reports rather than refuses**, and the Account card
tells the user in plain words when their app can do more than read. Once a few
real connections exist, read `granted_scopes` out of the database: if read-only
apps are genuinely creatable, flip the constant and the check tightens with no
other change.

### Four things PayPal does differently, all handled

1. **31-day ceiling.** The transaction search refuses any range wider than 31
   days, so a 120-day first sync walks four windows instead of paging one range.
   Windows are contiguous to the millisecond (unit-tested).
2. **Three-hour settlement delay.** PayPal states a transaction can take up to
   three hours to appear. Stripe's 60-minute overlap would have stepped straight
   over sales that were merely not visible yet, and they would never have been
   picked up again. The overlap here is **six hours**.
3. **Refunds are separate transactions.** Stripe updates the charge; PayPal writes
   a negative row naming the original through `paypal_reference_id`. Those are
   collected across the whole run and used to flag the original, landing on the
   same `refunded` boolean everything downstream already reads. A refund is never
   written as a sale.
4. **No backfill pass needed.** `fields=all` returns the basket inline, so the
   product name arrives with the money. Stripe needs a whole second phase for this.

**The expensive mistake this file avoids:** only `T00xx` (customer payments) count
as income and only `T11xx` (reversals) flag refunds. Fees, currency conversions,
bank withdrawals, holds and reserves are all ignored. Counting a payout to the
user's own bank as income would have inflated every revenue figure in the app with
nothing downstream able to detect it.

### The refactor this forced (the "other places" that needed updating)

Two bugs were already latent in the Stripe code and would have shipped as wrong
*figures*, not as errors:

- `fetchImportedSales()` never filtered on `source`, so it was **already** going to
  return PayPal rows the moment the first one landed.
- `toEntryShape()` hardcoded `source: 'Stripe'`, so those rows would have been
  labelled Stripe on the Revenue screen **and in the Source Attribution
  breakdown**. Right total, wrong processor, and only Jen could have spotted it.

So the shared read moved out of `stripeImport.js` into a new
[js/importedSales.js](js/importedSales.js), which belongs to no processor and
derives the label from the row. Three further places were counting or naming one
processor where there are now two:

- The Account card's "N sales imported" counted the **whole cache**, so with both
  connected each panel would have claimed the other's sales. Now per-processor via
  `countImportedFrom()`.
- The Revenue sidebar panel said "Stripe connected" whoever was connected, and its
  button synced Stripe whether or not Stripe had anything waiting. Now names what
  is actually connected and syncs all of them in parallel.
- `AUTO_SYNC_KEY` collided between the two processor files. Harmless in ES modules,
  **fatal in the bundle**, which puts everything in one scope — caught by
  `node --check` on the built bundle, which is worth doing every time a new file
  joins `build_bundle.ps1`.

### What the first live connection proved about scopes (19 Aug 2026)

Jen connected a real PayPal REST app. It granted **28 scopes**, including
`payments/refund`, `payments/payouts`, `vault/credit-card`,
`billing-agreements` and `subscriptions` alongside the one we asked for.

**So `REFUSE_WRITE_SCOPES = false` was the right call.** Strict refusal would
have rejected the first real connection and killed the feature on day one, with
an error blaming the user for a default they did not choose. The Account card
says so plainly instead, and the scope list is stored verbatim.

⚠️ Be honest about what this means: the stored PayPal credential **can move
money**, which the Stripe restricted key cannot. It is service-role only and
never reaches the browser, but it is a more dangerous secret than Stripe's.
**Still open, and harder than expected.** Jen tried unticking the extra Features
on 19 Aug 2026 and PayPal refused to save: *"Something went wrong saving the
application"* (error id `c8a0c3d0bffc5`). At the time "Log in with PayPal" was
ticked and showed `Approval Status: New`, which is the prime suspect — a feature
pending approval plausibly blocks saving other changes to the same app.

A second attempt with "Log in with PayPal" unticked failed the same way (error
id `37e65bf6c6cca`), so the pending-approval theory was wrong. The better guess
is that PayPal will not save a **live** app with no payment capability at all:
the app had been reduced to Transaction Search alone, and their own notice says
available features are governed by *account eligibility*. Note this is only
about REMOVING features — Transaction Search itself saved fine originally, which
is why the import reads transactions correctly.

⚠️ If this turns out to be a hard PayPal limit, the Account card copy MUST
change: it currently tells the user to "create a new app with only Transaction
Search ticked and reconnect", which would be advising something impossible.

Last thing worth trying is a **brand new app with only Transaction Search ticked**,
rather than editing an existing one: features are chosen at creation, which
sidesteps this save path entirely and also avoids the nine-hour propagation
delay. If a fresh app STILL grants payouts and refund scopes, PayPal does not
permit a read-only REST app at all — record that as the final answer, leave
`REFUSE_WRITE_SCOPES` false permanently, and treat the Account card's warning as
a standing statement of fact rather than a temporary note.

### Flipped live before the positive path was tested (Jen's call, 19 Aug 2026)

`PAYPAL_IMPORT_LIVE` went true, and with it the copy on the Pro pop-up, the plan
list and the Revenue teaser, plus the connect card for every Pro account. The
preview escape hatch (`ceo_paypal_preview`, `applyPayPalPreviewParam`) was
deleted in the same change, because once the flag is true it could only read as
true and would have been a second switch that does nothing.

**What to watch on the first real PayPal sale**, in likely order of failure:

1. **It does not appear at all.** The most likely fault by far, because every
   filter errs toward excluding. Call `paypal-sync?debug=1` BEFORE changing any
   code — it returns an event-code tally carrying no amounts or names. If the
   sale shows a `T00xx` code that was skipped, the status or sign test is wrong;
   if it shows something outside `T00xx`, `SALE_PREFIX` needs widening.
2. **It appears with a useless name.** `cart_info.item_details` has never met a
   real basket. It falls back to `transaction_subject`, then `transaction_note`,
   then null — a row reading "PayPal payment" means all three were empty.
3. **The amount is wrong.** PayPal reports major units as decimal strings and
   there is deliberately no minor-unit conversion. A figure 100x out means that
   assumption is wrong for that currency.
4. **A refund does not clear it.** The `T11xx` → `paypal_reference_id` match is
   the least-evidenced part. Symptom: refunded money still counted as revenue.
5. **A sale is counted twice.** Should be impossible — the unique index on
   `(user_id, source, external_id)` is what makes re-syncs idempotent — but it
   is the one failure that corrupts figures rather than under-reporting them, so
   it is worth one look at the Revenue feed after a second sync.

Only (5) can inflate revenue. The 19 Aug evidence shows the filter correctly
rejecting eleven of Jen's own outgoing payments, so the bias is toward missing
income rather than inventing it.

### What is NOT done

`PAYPAL_LIVE` is `false`, so no user sees any of this yet. That is the same
discipline Stripe shipped under and for the same reason: **three things in
`paypal-sync` have never met the live API** — the 31-day windowing, the
T00xx/T11xx filter, and the refund matching. Each looks perfect in review and is
exactly the kind of thing only real data disproves.

**To finish item 10:**

1. Deploy `supabase/migrations/20260819_paypal_import.sql` and the two functions.
2. Connect a real PayPal account via `?paypal_preview=1` and import real sales.
3. Check the figures against PayPal's own dashboard — especially that no
   withdrawal or fee has been counted as a sale, and that a refunded sale reads as
   refunded.
4. Flip `PAYPAL_LIVE` to `true` and delete the three "(PayPal coming soon)"
   strings (two in `js/components/proGate.js`, one in `js/screens/revenue.js`).
   Delete `applyPayPalPreviewParam()` at the same time.

Until step 4, the "coming soon" copy stays honest, which is the whole point of the
warning under item 1.

**Sequencing note:** items 4 and 5 are the cost-heavy ones. Batch 1.1 must be done
first, with a higher daily limit for Pro — that turns the rate limiter from a safety
net into a product feature. ✅ Done for item 4: the Pro rate is 300/day and the
client caps its own unasked-for calls on top. ✅ Done for item 5: the client sends
a 12-message window rather than the whole thread, and the `chat` function now
measures input size and refuses anything over 60000 characters with a 413 —
so "longer conversations mean more tokens per call, which the current per-call
limits do not measure" is no longer true.

---

## Positioning risk — resolved 17 Aug 2026, but worth remembering why

Several features labelled "AI" in the UI were keyword maps with `Math.random()`
picks (listed in Pro item 4). They're decent heuristics and fine as a free tier.
But if Pro is sold on "more AI", a user who notices the same six suggestions
cycling will feel misled. Pro item 4 is what makes the label true.

**Item 4 shipped, so the label is now true on Pro.** The risk has not vanished
though, it has moved: a *base* user still sees four things the app calls "AI"
that are keyword maps. What makes that honest rather than misleading is the
teaser sitting beside each one, saying in plain words that these follow set
patterns today and what Pro does instead. **If those teasers are ever removed or
softened, this becomes a false claim again.** Do not treat them as adverts that
can be tidied away.
