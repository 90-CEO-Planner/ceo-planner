// stripe-portal
//
// Opens the Stripe customer portal for the signed-in account, and — the reason
// this function exists at all — lets an existing Base subscriber move up to Pro
// without buying a second subscription.
//
// Before this, the only way to pay was a Stripe payment link. That is correct for
// somebody with no subscription at all, and actively harmful for somebody who
// already has one: buying Pro through a link on top of a live Base subscription
// leaves the customer paying for BOTH, every month, until a human notices. So
// the app deliberately offered no upgrade button, and a Base customer had no
// route to Pro. This is that route.
//
// The portal is used rather than a hand-rolled proration flow because Stripe
// already owns every hard part of it: working out the credit for the unused
// remainder, invoicing the difference, collecting a card, SCA, and — the one that
// matters most here — telling the customer the number BEFORE they agree to it.
// The webhook end was already finished: `customer.subscription.updated` resolves
// the tier from `price.metadata.tier` and writes `plan_tier`, so a switch made in
// the portal lands back in the app on its own.
//
//   POST { intent: 'upgrade' }  (user JWT) -> { url }   straight to the plan switch
//   POST { }                    (user JWT) -> { url }   the normal portal home
//
// Errors are returned as a `code` the client can act on rather than only a
// sentence to show:
//
//   no_customer     — never checked out; there is nothing for the portal to open.
//                     The client sends them to #/billing to actually subscribe.
//   no_subscription — a Stripe customer with no live CEO Planner subscription.
//                     Same destination, different reason.
//   config_failed   — our portal configuration could not be built, so there is no
//                     plan list to switch between. Billing management still works.
//
// Required environment variables: STRIPE_SECRET_KEY, plus the Supabase defaults.
// Nothing new — the same key stripe-webhook already uses.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ---------------------------------------------------------------- constants --

// The two CEO Planner products, and every price under them.
//
// Hardcoded on purpose. This list is what the portal will let somebody switch
// between, so it has to be exactly the CEO Planner prices and nothing else: the
// Stripe account is shared with WEN Business Club, the VIP days and the rest of
// Jen's catalogue, and a wildcard here would offer a planner customer the option
// to "switch plan" onto a coaching programme.
//
// ⚠️ Adding a price in Stripe is not enough to make it appear here. Add it below
// AND give it `metadata.tier`, or stripe-webhook will read the resulting
// subscription as Base — see the note in js/supabaseClient.js.
const PLANNER_PRODUCTS = {
  base: 'prod_UUEG0EkBHYzWhv',
  pro: 'prod_V6LjD07AtJG5o4',
} as const

const PLANNER_PRICES = {
  baseMonthly: 'price_1TVFnmAnrDOsqkV36mm2hjuU',   // $17
  baseAnnual: 'price_1TahiXAnrDOsqkV3cTJJH0Dj',    // $147
  proMonthly: 'price_1U691jAnrDOsqkV3F04IF3eU',    // $37
  proAnnual: 'price_1U691oAnrDOsqkV3INISfwNm',     // $327
} as const

const PLANNER_PRODUCT_IDS: string[] = [PLANNER_PRODUCTS.base, PLANNER_PRODUCTS.pro]

// Statuses that still represent a subscription worth updating. `canceled` and
// `incomplete_expired` are deliberately absent: there is nothing left to switch,
// and offering an upgrade on a dead subscription would fail at Stripe with a
// message the customer cannot act on. They get sent to checkout instead.
const LIVE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete']

// Marks our configuration so it can be found again on the next invocation. The
// portal configuration list has no metadata filter, so this is matched in code.
const CONFIG_TAG = 'ceo-planner'

// Bump this whenever portalFeatures() changes.
//
// The configuration is created once and then lives in Stripe, so without a
// version stamp a later edit to the shape below would never reach the live
// portal — the function would find the old configuration, decide its job was
// done, and hand out a session built to last year's rules. On a mismatch it
// updates in place instead, which also means the fix does not depend on anyone
// remembering to delete anything in the dashboard.
//
// rev 2: adjustable_quantity turned off. Stripe defaults it ON, and rev 1 left
// it that way — which let a customer set the quantity of a single-seat product
// to 5 in the portal and pay five times over for one account.
const CONFIG_REV = '2'

const APP_ORIGIN = 'https://app.thewomensentrepreneurialnetwork.com'

// Where Stripe sends them back to. An allowlist rather than "whatever Origin
// says", because return_url is a redirect we are asking Stripe to perform on a
// signed-in customer, and echoing an attacker-supplied origin back into it is an
// open redirect with Stripe's name on it.
const ALLOWED_ORIGINS = [
  APP_ORIGIN,
  'https://app.ceoplanner.com',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]

function returnUrlFor(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  const base = ALLOWED_ORIGINS.includes(origin) ? origin : APP_ORIGIN
  // The marker is what makes the app re-check the plan on the way back in.
  // Without it someone would upgrade, land on their account page, and still be
  // looking at a screen rendered for a Base user.
  return `${base}/#/account?billing=updated`
}

// ------------------------------------------------------------------- stripe --

// Stripe's API is form-encoded, including the nested and repeated parameters.
// Written out rather than pulled from the SDK because two of the fields used
// below (`schedule_at_period_end`, `flow_data`) are newer than the pinned SDK
// version the rest of this project uses, and a form body cannot go out of date.
function toForm(value: unknown, prefix = '', out: string[] = []): string[] {
  if (value === null || value === undefined) return out

  if (Array.isArray(value)) {
    value.forEach((item, i) => toForm(item, `${prefix}[${i}]`, out))
    return out
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      toForm(item, prefix ? `${prefix}[${key}]` : key, out)
    }
    return out
  }

  out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`)
  return out
}

async function stripeCall(path: string, method: 'GET' | 'POST', params: Record<string, unknown> = {}) {
  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
  const body = toForm(params).join('&')
  const url = method === 'GET' && body ? `https://api.stripe.com/v1/${path}?${body}` : `https://api.stripe.com/v1/${path}`

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(method === 'POST' ? { body } : {}),
  })

  const payload = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body: payload }
}

// Warm-invocation cache. Cheap, and it means the usual request is two Stripe
// calls (subscriptions, session) rather than three.
let cachedConfigurationId: string | null = null

// Find our portal configuration, or build it.
//
// Deliberately NOT the account's default configuration. That one is shared with
// every other thing Jen sells through this Stripe account, and switching its
// "products customers can change to" over to the two planner products would
// offer a WEN Business Club member the chance to move her membership onto CEO
// Planner Base. The default is left exactly as it is.
//
// To rebuild this after changing the shape below, delete the configuration in
// the Stripe dashboard (or set `active: false` on it) — the next call recreates
// it. It is matched on `metadata.app`, so an inactive one is skipped.
//
// Returns null rather than throwing if Stripe refuses to create it. Live mode
// has requirements a sandbox does not — a privacy policy and terms URL, either
// on the configuration or as account defaults — and the first person to press
// "Manage billing" must not be the one who finds that out with a 500. The caller
// falls back to the account's default configuration, which still updates a card
// and shows invoices. The exact Stripe message is logged either way, because
// that message names the field to fix.
async function ensureConfiguration(): Promise<string | null> {
  if (cachedConfigurationId) return cachedConfigurationId

  const existing = await stripeCall('billing_portal/configurations', 'GET', { limit: 100, active: true })
  if (existing.ok && Array.isArray(existing.body?.data)) {
    const mine = existing.body.data.find((c: any) => c?.metadata?.app === CONFIG_TAG)

    if (mine?.id) {
      // Up to date. The overwhelmingly common path.
      if (mine?.metadata?.rev === CONFIG_REV) {
        cachedConfigurationId = mine.id
        return mine.id
      }

      // Built by an older revision of this file. Bring it up to the current
      // shape in place rather than creating a second configuration — the
      // customer keeps one portal, and there is nothing to tidy up afterwards.
      const updated = await stripeCall(`billing_portal/configurations/${mine.id}`, 'POST', configurationBody())

      if (updated.ok && updated.body?.id) {
        console.log(`Updated the CEO Planner portal configuration ${mine.id} to rev ${CONFIG_REV}`)
        cachedConfigurationId = mine.id
        return mine.id
      }

      // Still usable, just out of date. Better a slightly stale portal than no
      // portal at all, so this is a warning and not a failure.
      console.error(
        `Could not update portal configuration ${mine.id} to rev ${CONFIG_REV}; ` +
        `serving the older one. Stripe said: ` +
        (updated.body?.error?.message ?? `status ${updated.status}`)
      )
      cachedConfigurationId = mine.id
      return mine.id
    }
  }

  const created = await stripeCall('billing_portal/configurations', 'POST', configurationBody())

  if (!created.ok || !created.body?.id) {
    console.error(
      'Could not create the CEO Planner portal configuration. Falling back to the account default, ' +
      'which means NO plan switching. Stripe said: ' +
      (created.body?.error?.message ?? `status ${created.status}`)
    )
    return null
  }

  console.log(`Created the CEO Planner portal configuration: ${created.body.id}`)
  cachedConfigurationId = created.body.id
  return created.body.id
}

// The configuration itself, shared by create and update so the two can never
// drift apart.
function configurationBody(): Record<string, unknown> {
  return {
    business_profile: {
      headline: 'CEO Planner — manage your subscription',
    },
    default_return_url: `${APP_ORIGIN}/#/account`,
    metadata: { app: CONFIG_TAG, rev: CONFIG_REV },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ['email', 'address', 'name', 'phone'],
      },
      subscription_cancel: {
        enabled: true,
        // Never mid-period. Somebody who cancels on day 3 of a month they have
        // paid for keeps the rest of it — cancelling immediately would mean
        // owing them a refund, and taking the product away the same afternoon.
        mode: 'at_period_end',
        proration_behavior: 'none',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
        },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        // Upgrades bill straight away, for the prorated difference only. Stripe
        // shows the exact figure on the confirmation step before anything is
        // charged, which is the whole reason this goes through the portal.
        proration_behavior: 'always_invoice',
        // ...and downgrades do NOT. Both conditions below describe somebody
        // paying us less: a cheaper plan, or a shorter interval. Applying those
        // immediately would hand back a credit for time already paid for and
        // drop them to Base the same day. Deferring to the renewal date means
        // they keep what they bought until it runs out, and nothing is refunded.
        schedule_at_period_end: {
          conditions: [
            { type: 'decreasing_item_amount' },
            { type: 'shortening_interval' },
          ],
        },
        // ⚠️ `adjustable_quantity` must stay off on BOTH, and Stripe's default
        // is ON. CEO Planner is one seat for one person; there is no such thing
        // as buying two. Left enabled, the portal shows a quantity stepper on
        // the plan-switch screen, and a customer who nudges it to 2 pays $74 a
        // month for the same single account — the webhook writes the tier and
        // never looks at quantity, so nothing about the app would change and
        // nothing would flag it. Found in the live rev 1 configuration on
        // 19 Aug 2026, before any customer had reached the portal.
        products: [
          {
            product: PLANNER_PRODUCTS.base,
            prices: [PLANNER_PRICES.baseMonthly, PLANNER_PRICES.baseAnnual],
            adjustable_quantity: { enabled: false },
          },
          {
            product: PLANNER_PRODUCTS.pro,
            prices: [PLANNER_PRICES.proMonthly, PLANNER_PRICES.proAnnual],
            adjustable_quantity: { enabled: false },
          },
        ],
      },
    },
  }
}

// The customer's live CEO Planner subscription, if they have one.
//
// Looked up rather than stored. `profiles` keeps `stripe_customer_id` but no
// subscription id, and adding a column that a webhook has to keep in step is a
// second thing to go wrong — Stripe already knows the answer, and it is one
// call. Filtering by product matters as much as filtering by status: a customer
// who is also in WEN Business Club has subscriptions here that must not be
// touched by a planner upgrade.
async function findPlannerSubscription(customerId: string): Promise<string | null> {
  const res = await stripeCall('subscriptions', 'GET', {
    customer: customerId,
    status: 'all',
    limit: 100,
    expand: ['data.items.data.price'],
  })

  if (!res.ok || !Array.isArray(res.body?.data)) return null

  const planner = res.body.data.filter((sub: any) =>
    LIVE_STATUSES.includes(sub?.status) &&
    (sub?.items?.data ?? []).some((item: any) => PLANNER_PRODUCT_IDS.includes(item?.price?.product))
  )

  if (!planner.length) return null

  // An account should only ever have one. If a payment link was used on top of
  // an existing subscription before this function existed, it will have two —
  // prefer the healthy one, so the upgrade flow opens on something that can
  // actually be changed.
  const active = planner.find((sub: any) => sub.status === 'active')
  return (active ?? planner[0]).id
}

// ---------------------------------------------------------------- handler --

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!Deno.env.get('STRIPE_SECRET_KEY')) {
    console.error('STRIPE_SECRET_KEY is not set')
    return json({ error: 'Billing is not configured. Please contact support.' }, 500)
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Please sign in first.' }, 401)

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    const user = userData?.user
    if (userError || !user) return json({ error: 'Please sign in first.' }, 401)

    const payload = await req.json().catch(() => ({}))
    const intent = String((payload as any)?.intent ?? '').trim()

    // The customer id comes from the profile, never from the request. It is the
    // only thing tying this session to the caller, so letting the browser name
    // it would be handing anyone else's billing page to anyone who asked.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error('Could not read profile:', profileError.message)
      return json({ error: 'We could not reach your account. Please try again.' }, 500)
    }

    const customerId = profile?.stripe_customer_id
    if (!customerId) {
      return json({
        code: 'no_customer',
        error: 'There is no billing record for this account yet.',
      }, 404)
    }

    const configuration = await ensureConfiguration()

    const params: Record<string, unknown> = {
      customer: customerId,
      return_url: returnUrlFor(req),
    }
    // Omitted entirely rather than sent as null, so a failed creation falls back
    // to the account default instead of erroring at Stripe.
    if (configuration) params.configuration = configuration

    if (intent === 'upgrade') {
      // Without our own configuration there is no plan list to switch between —
      // the account default offers none for the planner — so the flow would open
      // on an empty page. Say so plainly instead. The customer keeps the normal
      // "Manage billing" route, which still works.
      if (!configuration) {
        return json({
          code: 'config_failed',
          error: 'Plan changes are temporarily unavailable. Please try again shortly, or contact support.',
        }, 503)
      }

      const subscriptionId = await findPlannerSubscription(customerId)
      if (!subscriptionId) {
        return json({
          code: 'no_subscription',
          error: 'We could not find a live subscription on this account.',
        }, 404)
      }

      // Straight to the plan switch for that one subscription, rather than the
      // portal home. It also scopes the page: a customer who is in WEN Business
      // Club as well never sees that membership on this screen, so there is no
      // way to cancel the wrong thing from a button labelled "upgrade".
      params.flow_data = {
        type: 'subscription_update',
        subscription_update: { subscription: subscriptionId },
        after_completion: {
          type: 'redirect',
          redirect: { return_url: returnUrlFor(req) },
        },
      }
    }

    const session = await stripeCall('billing_portal/sessions', 'POST', params)

    if (!session.ok || !session.body?.url) {
      const message = session.body?.error?.message ?? `status ${session.status}`
      console.error(`Portal session failed for ${customerId}: ${message}`)

      // A customer id we hold that Stripe no longer recognises — deleted in the
      // dashboard, or left over from a test key. Treat it as "never checked
      // out" rather than as a server error, because the useful thing to do next
      // is identical: send them to buy a plan.
      if (session.status === 404 || /No such customer/i.test(message)) {
        return json({ code: 'no_customer', error: 'There is no billing record for this account yet.' }, 404)
      }

      return json({ error: 'We could not open your billing page. Please try again in a moment.' }, 502)
    }

    return json({ url: session.body.url })
  } catch (err) {
    console.error('stripe-portal failed:', err instanceof Error ? err.message : err)
    return json({ error: 'Something went wrong opening your billing page. Please try again.' }, 500)
  }
})
