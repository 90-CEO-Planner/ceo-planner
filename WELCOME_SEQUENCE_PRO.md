# CEO Planner Welcome Sequence — Pro rewrite

**APPLIED to the live Loops workflow, 19 Aug 2026**, in two passes. Workflow
paused, edited, resumed and confirmed Active each time.

Second pass, same day, after Jen reviewed email 5 in Loops: pricing cut to
monthly only, a bold-inheritance bug fixed, and real buttons added. Section 5
records it.

Loops workflow: `CEO Planner Welcome Sequence`
(https://app.loops.so/workflows/cmpiamt1e1tvr0jwxtsaqkw5j)

This file records what changed and why. It is documentation, not a draft.

---

## 1. The timer, and the schedule it fixes

The trial is 14 days from signup and the workflow triggers at signup, so day 0 is
signup day. Email 5 was going out with **72 hours** left while its subject said 48,
and email 6 said "ends today" a **full day early**.

**One change:** the Timer between emails 4 and 5, `Wait 2 days` → `Wait 3 days`.
Everything below it shifted by a day on its own.

| # | Subject | Was | Now |
|---|---------|-----|-----|
| 1 | Welcome to CEO Planner, your first step 👇 | Day 0 | Day 0 |
| 2 | Have you met your Daily 3 yet? | Day 2 | Day 2 |
| 3 | Halfway there, here's what's working | Day 6 | Day 6 |
| 4 | The feature most users discover too late | Day 9 | Day 9 |
| 5 | Your free trial ends in 48 hours ⏳ | Day 11 ❌ | **Day 12** ✅ exactly 48h |
| 6 | Your trial ends today | Day 13 ❌ | **Day 14** ✅ the actual last day |
| 7 | Your 90-day plan is still sitting there | Day 16 | Day 17 |

### What did NOT need changing

The Audience filter is `User group equals "Trial"`, scoped to **all following
nodes**, so it is re-evaluated at every step. `stripe-webhook` sets `userGroup` to
`Paid` on checkout, via `checkout.session.completed` — the one event that has
always been subscribed. **A buyer already drops out of the sequence immediately.**
Checked, not assumed.

---

## 2. What changed in each email

Five emails were edited, not the four originally planned. Emails 4 and 7 turned
out to have problems of their own once they could finally be read.

Every edit was surgical: paragraphs inserted or replaced, **no button or link was
touched**. All four buttons (`Set My 90-Day Vision Now →`, `Do My Friday Review
Now →`, and both `Choose My Plan`) were verified intact afterwards.

### Email 1, day 0 — "Welcome to CEO Planner, your first step 👇"

One paragraph **added** after the opening, before "CEO Planner is designed to do
one thing". Everything else untouched.

> One thing worth knowing on day one — your trial runs on CEO Planner Pro, the
> complete product. Not a stripped-back version, not a demo. Your sales can log
> themselves, you get a real lead pipeline with named contacts, and the coach
> remembers your conversations instead of starting fresh every time. Use all of
> it. In two weeks you'll pick a plan, and the only way to choose well is to have
> actually used the thing you're choosing between.

### Email 4, day 9 — "The feature most users discover too late"

**Not replaced.** This email is about the Friday Review and the copy is strong, so
it stayed. Two things were wrong with it:

1. **It said "Four days left" twice.** It fires on day 9 of 14, so it is five.
   Both corrected. This was wrong before today and is unrelated to Pro.
2. It named only a Base feature, on the last substantial email before the
   decision. One paragraph added after the button's parenthetical:

> One more while you still have everything. Your trial runs on Pro, which is where
> the automatic sales import lives — connect Stripe or PayPal in Account and a
> fortnight of real sales lands on its own, with the amounts and dates already
> right. Two minutes, and every number on your dashboard becomes something you can
> actually trust rather than something you remembered to type in.

### Email 5, day 12 — "Your free trial ends in 48 hours ⏳"

The two price lines under "Here's what it costs:" were replaced like-for-like,
which preserved their bold styling, and one paragraph was added after them.

Was:

> **$17/month** — that's $0.56 a day. Less than a coffee.
> **Or $147/year** — just $12.25/month, and you save 28%.

Now:

> Pro — $37/month, or $327/year. That saves you $117, a little over three months free.
>
> CEO Planner — $17/month, or $147/year. That saves you $57, again a little over three months free.
>
> Your trial has been running on Pro, so that is the one you already know. Choosing
> CEO Planner at $17 means the automatic sales import, the lead pipeline, the
> quarter-by-quarter history and the coach's memory switch off. Nothing is deleted
> and everything you have logged stays exactly where it is, but those parts stop
> being available. I would rather tell you that now than let you find out on
> Thursday.

### Email 6, day 14 — "Your trial ends today"

Carried **the same Base-only pricing as email 5**. Same fix, with a shorter
closing paragraph since the full argument was made two days earlier.

> Pro — $37/month, or $327/year. That saves you $117, a little over three months free.
>
> CEO Planner — $17/month, or $147/year. That saves you $57, again a little over three months free.
>
> Your trial has been running on Pro, so that is the one you already know. Choosing
> CEO Planner at $17 pauses the automatic sales import, the lead pipeline, the
> quarter-by-quarter history and the coach's memory. Nothing is deleted either way,
> and everything you have logged stays exactly where it is.

### Email 7, day 17 — "Your 90-day plan is still sitting there"

Not on the original list, but its win-back line quoted Base pricing as though it
were the only option.

Was: "…the door is still open, and it is $17 a month or $147 for the year."

Now: "…the door is still open, and it is **$17 a month for CEO Planner, or $37 for
Pro, which is the plan your trial actually ran on. Both are cheaper by the year.**"

---

## 3. Judgement calls worth knowing about

- **The Netflix line stayed.** Emails 5 and 6 both say "CEO Planner costs less than
  your Netflix subscription". At $17 that is still defensible against Netflix
  Standard, and the sentence names CEO Planner, which is now specifically the $17
  plan. It reads oddly next to $37 Pro though, so it is worth a second look.
- **No bold on the new paragraphs.** Applying bold reliably through the editor
  risked mangling the surrounding formatting, so the added text is plain. The
  replaced price lines kept the bold they already had.
- **Em dashes used throughout**, per Jen's call on 19 Aug 2026: this product is an
  exception to the no-em-dashes rule. Sign-off is "Speak soon, Jen", unchanged.

## 4. Still outstanding

Loops never receives `plan_tier`. `signup-sync` sends `userGroup` and
`subscriptionStatus`; `stripe-webhook` sends `userGroup` of Trial, Paid or Churned.
Nothing sends the tier.

It did not block this sequence — everyone in it is a trialist on Pro, so there was
nothing to branch on. It **does** block what comes next: a different onboarding for
a Pro customer than a Base one, or a Base-to-Pro nudge. Roughly ten lines in
`syncToLoops`, worth doing alongside the upgrade flow (item 2 in UPGRADE_PLAN.md).

---

## 5. Second pass, 19 Aug 2026 — emails 5 and 6

Jen hit a Loops error mid-edit and reported the pricing had vanished. **It had
not** — email 5 was intact when checked; the error fired before the save and
Loops rolled back cleanly. Nothing was lost.

Her two notes, and one thing they led to:

### Too many numbers

Both emails carried monthly, annual, the saving and the months-free for two
plans — eight figures in a block a customer reads in about four seconds. Cut to
monthly only:

> **Pro — $37 a month.**
> **CEO Planner — $17 a month.**

The annual prices are not lost, they are one click away: the button goes to the
app's billing screen, which shows both plans with the yearly prices and the
savings worked out. The email makes the choice, the screen carries the detail.

### It read as one chunk of text

Two causes, one of them mine.

1. **A bold-inheritance bug.** When the "what pauses on Base" paragraph was typed
   directly after the bold price lines in the first pass, it inherited the bold
   and rendered as a solid block of heavy text in both emails. Un-bolded.
2. **The CTA was a plain underlined text link**, not a button — unlike email 4,
   which has a proper teal button. Weak for the two emails that carry the money.

### Buttons

Each of emails 5 and 6 now has two, in the brand teal, matching email 4:

| Button | Position | Links to |
|--------|----------|----------|
| `See both plans →` | Straight after the pricing | `app.thewomensentrepreneurialnetwork.com/#/billing` |
| `Choose My Plan →` | The closing CTA, replacing the text link | same |

**Both point at the app, not at Stripe.** Deliberate: the app's billing screen
prefills the customer's email at checkout, which is what lets `stripe-webhook`
match the payment to the account. A raw `buy.stripe.com` link from an email would
lose the prefill and cause exactly the mismatch the P.S. warns about.

Paragraph breaks were also added where "Here's what it costs:" and the pricing
block had run together without spacing.
