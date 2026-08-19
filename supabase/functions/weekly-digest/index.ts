// weekly-digest
//
// Fires one Loops event per eligible account, on a Monday. Two kinds:
//
//   weekly_digest -- they have a plan to show, here is their week
//   plan_nudge    -- their snapshot says no plan, and they signed up recently
//
// The two queues cannot overlap: get_nudge_recipients() excludes everyone
// get_digest_recipients() returns, so that is guaranteed in SQL rather than by
// matching conditions in two languages. Nobody receives both on one Monday.
// A Loops workflow ("CEO Planner Weekly Digest") turns each event into an email.
//
// ⚠️ This is NOT a Loops transactional send. Loops' own composer forbids using
// transactional for recurring summaries and says improper use can get the
// account suspended — and the same account carries the welcome sequence. It is
// an event-triggered workflow, which also means Loops handles the unsubscribe
// link for us. Do not "simplify" this to /transactional.
//
// ⚠️ **This function does no business maths, and it must stay that way.**
// Every figure and every sentence arrives pre-formatted in `digestSnapshot`,
// which the app writes using its own getRevenueInsights(), getActivePlan() and
// formatAmount(). Recomputing anything here would create a second source for
// numbers the app already shows, and the two would eventually disagree with no
// way to tell which was real. The single exception is `snapshotAge`, which is
// about the email rather than the business: only send time knows how old the
// snapshot is by the time it lands.
//
// Auth is a shared secret, not a JWT, because pg_cron has no user session.
// Deploy with --no-verify-jwt.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-digest-secret',
}

const LOOPS_EVENTS_URL = 'https://app.loops.so/api/v1/events/send'

// Every property the workflow's email reads, with the name it reads it by.
// `firstName` is deliberately absent: it is already a Loops *contact* property,
// synced by signup-sync, so the email uses the contact merge tag instead.
const REQUIRED_PROPS = [
  'planIntro',
  'winCondition',
  'action1',
  'action2',
  'action3',
  'revenueAction',
  'visibilityAction',
  'followUpAction',
  'priorityNudge',
  'revenueSoFar',
  'quarterGoal',
  'quarterProgress',
  'momentumLine',
  'freshnessNote',
  'appUrl',
]

// Loops has no conditional rendering, so an empty property renders as a blank
// line or a bare numbered bullet and the email looks broken. The app is supposed
// to substitute its own fallback; this is the backstop for when it has not.
const FALLBACK = 'Not set yet. Open the planner and fill this one in.'

// How old the snapshot is, in words, to sit inside "Where the numbers stood ___".
// Reads as a phrase rather than a number because it is prose in a sentence.
function describeAge(takenAt: string | null): string {
  if (!takenAt) return 'when you were last in'
  const then = new Date(takenAt).getTime()
  if (!Number.isFinite(then)) return 'when you were last in'

  const days = Math.floor((Date.now() - then) / 86400000)
  if (days <= 0) return 'this morning'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  return 'the last time you were in'
}

// One POST to Loops. Both events go the same way; only the name and the payload
// differ, so there is one place where a Loops call can be got wrong.
async function sendEvent(
  apiKey: string,
  email: string,
  eventName: string,
  eventProperties: Record<string, string>
): Promise<boolean> {
  const response = await fetch(LOOPS_EVENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: email.toLowerCase().trim(), eventName, eventProperties }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error(`Loops ${eventName} failed: ${response.status} ${detail}`)
    return false
  }
  return true
}

function buildProperties(snapshot: Record<string, unknown>): Record<string, string> {
  const props: Record<string, string> = {}

  for (const key of REQUIRED_PROPS) {
    const value = snapshot[key]
    const text = typeof value === 'string' ? value.trim() : ''
    props[key] = text === '' ? FALLBACK : text
  }

  // The one thing that cannot be known until send time.
  props.snapshotAge = describeAge((snapshot.takenAt as string) ?? null)

  return props
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // --- Auth ---------------------------------------------------------------
    const expected = Deno.env.get('DIGEST_CRON_SECRET')
    if (!expected) {
      console.error('DIGEST_CRON_SECRET is not set. Refusing to run.')
      return json({ error: 'Not configured.' }, 500)
    }
    if (req.headers.get('x-digest-secret') !== expected) {
      return json({ error: 'Not authorised.' }, 401)
    }

    const apiKey = Deno.env.get('LOOPS_API_KEY')
    if (!apiKey) {
      console.error('LOOPS_API_KEY is not set.')
      return json({ error: 'Not configured.' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    // `onlyEmail` is how the first run is made safe: send to one address and
    // nobody else, whatever the query returns. `dryRun` sends to nobody at all
    // and just reports who would have received one.
    const onlyEmail: string | null = typeof body.onlyEmail === 'string'
      ? body.onlyEmail.toLowerCase().trim()
      : null
    const dryRun: boolean = body.dryRun === true

    // --- Who gets one -------------------------------------------------------
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: recipients, error } = await supabaseAdmin.rpc('get_digest_recipients')
    if (error) {
      console.error('Could not read digest recipients:', error.message)
      return json({ error: 'Could not read recipients.' }, 500)
    }

    let queue = (recipients ?? []) as Array<{
      user_id: string
      email: string
      snapshot: Record<string, unknown> | null
    }>

    if (onlyEmail) {
      queue = queue.filter((r) => (r.email ?? '').toLowerCase().trim() === onlyEmail)
    }

    const result = {
      eligible: (recipients ?? []).length,
      attempted: queue.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      nudgeEligible: 0,
      nudgeAttempted: 0,
      nudgeSent: 0,
      nudgeFailed: 0,
      dryRun,
      onlyEmail,
    }

    // The nudge: accounts whose snapshot exists and reports no plan to show.
    // Never overlaps the digest queue -- that is guaranteed in SQL, not here.
    const { data: nudgeRows, error: nudgeError } = await supabaseAdmin.rpc('get_nudge_recipients')
    if (nudgeError) {
      // Not fatal. The digest is the feature; the nudge is the consolation.
      console.error('Could not read nudge recipients:', nudgeError.message)
    }

    let nudgeQueue = (nudgeRows ?? []) as Array<{ user_id: string; email: string }>
    if (onlyEmail) {
      nudgeQueue = nudgeQueue.filter((r) => (r.email ?? '').toLowerCase().trim() === onlyEmail)
    }

    result.nudgeEligible = (nudgeRows ?? []).length
    result.nudgeAttempted = nudgeQueue.length

    if (dryRun) {
      console.log(
        `Dry run: ${queue.length} digests and ${nudgeQueue.length} nudges would be sent.`
      )
      return json(result)
    }

    // --- Send ---------------------------------------------------------------
    //
    // One at a time and sequentially. This runs once a week against a small
    // list, so there is nothing to gain from concurrency and something to lose:
    // a burst of parallel requests is how you get rate limited by Loops on the
    // one morning of the week that matters.
    for (const row of queue) {
      if (!row.snapshot || !row.email) {
        result.skipped++
        continue
      }

      try {
        // Never log the snapshot itself: it carries the user's own plan.
        const ok = await sendEvent(apiKey, row.email, 'weekly_digest', buildProperties(row.snapshot))
        if (ok) result.sent++
        else result.failed++
      } catch (err) {
        result.failed++
        console.error(`Digest threw for ${row.user_id}: ${err.message}`)
      }
    }

    // --- Then the nudge -----------------------------------------------------
    //
    // Carries one property. The greeting uses the Loops *contact* First Name,
    // already synced by signup-sync, so there is no name to pass.
    for (const row of nudgeQueue) {
      if (!row.email) continue
      try {
        const ok = await sendEvent(apiKey, row.email, 'plan_nudge', {
          appUrl: 'https://app.thewomensentrepreneurialnetwork.com/#/wizard',
        })
        if (ok) result.nudgeSent++
        else result.nudgeFailed++
      } catch (err) {
        result.nudgeFailed++
        console.error(`Nudge threw for ${row.user_id}: ${err.message}`)
      }
    }

    console.log(
      `Weekly digest: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped, ` +
      `of ${result.eligible} eligible. ` +
      `Nudges: ${result.nudgeSent} sent, ${result.nudgeFailed} failed, of ${result.nudgeEligible}.`
    )
    return json(result)
  } catch (error) {
    console.error('weekly-digest error:', error.message)
    return json({ error: 'Digest run failed.' }, 500)
  }
})
