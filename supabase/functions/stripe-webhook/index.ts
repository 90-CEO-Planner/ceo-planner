import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'

// Initialize Stripe with the Secret Key
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

const cryptoProvider = Stripe.createSubtleCryptoProvider()

// Must stay identical to canonicalEmail in js/screens/auth.js.
//
// The app folds Gmail dots and +tags at signup, so an account created by
// someone typing `sarah.jones@gmail.com` is stored as `sarahjones@gmail.com`.
// Stripe does no such thing and hands back whatever the customer typed at
// checkout. Without the same fold here, the profile lookup below misses, a
// paying customer is mistaken for a brand new one, her account is never flipped
// to active, and the trial clock keeps running until it locks her out of
// something she has already paid for.
function canonicalEmail(email: string): string {
  if (!email) return email

  const at = email.lastIndexOf('@')
  if (at === -1) return email

  let local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return email

  const plus = local.indexOf('+')
  if (plus !== -1) local = local.slice(0, plus)
  local = local.split('.').join('')

  if (!local) return email

  return local + '@gmail.com'
}

// Helper function to upsert contact and properties to Loops.so
async function syncToLoops(
  email: string,
  customProperties: Record<string, any>,
  userGroup?: string,
  firstName?: string,
  lastName?: string
) {
  const apiKey = Deno.env.get('LOOPS_API_KEY')
  if (!apiKey) {
    console.warn('LOOPS_API_KEY environment variable is not set. Skipping Loops synchronization.')
    return
  }

  try {
    const payload: Record<string, any> = {
      email,
      ...customProperties
    }
    if (userGroup) {
      payload.userGroup = userGroup
    }
    if (firstName) {
      payload.firstName = firstName
    }
    if (lastName) {
      payload.lastName = lastName
    }

    console.log(`Syncing contact ${email} to Loops with group: ${userGroup || 'none'}...`)
    const response = await fetch('https://app.loops.so/api/v1/contacts/update', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const responseData = await response.json().catch(() => ({}))
      console.error(`Failed to sync to Loops: ${response.status} - ${JSON.stringify(responseData)}`)
    } else {
      console.log(`Successfully synced contact ${email} to Loops.`)
    }
  } catch (err) {
    console.error(`Error connecting to Loops API: ${err.message}`)
  }
}

serve(async (req) => {
  try {
    const signature = req.headers.get('Stripe-Signature')
    if (!signature) {
      return new Response('No signature provided', { status: 400 })
    }
    
    const body = await req.text()
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') as string
    
    // Verify Webhook Signature
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    )

    // Initialize Supabase Admin Client to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`Processing Event: ${event.type}`)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const email = session.customer_details?.email
      const customerId = session.customer as string

      // If they used a Payment Link, we capture the email
      // We will create/update the profile when they actually register via Auth.
      // But we can store the customer ID if the user exists.
      
      if (email) {
        const normalizedEmail = canonicalEmail(email.toLowerCase().trim())
        console.log(`Checkout completed for ${normalizedEmail}`)

        const fullName = session.customer_details?.name || ''
        let firstName = ''
        let lastName = ''
        if (fullName) {
          const parts = fullName.trim().split(/\s+/)
          firstName = parts[0]
          if (parts.length > 1) {
            lastName = parts.slice(1).join(' ')
          }
        }

        // Find if user already exists in profiles
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', normalizedEmail)
          .maybeSingle()

        if (profileError) {
          console.error(`Error checking for existing user profile: ${profileError.message}`)
        }

        // Sync to Loops. Someone who already had an account is a trial user
        // converting, so they belong in Paid, not Trial. Getting this wrong would
        // send "your trial is ending" emails to a customer who has just paid.
        await syncToLoops(
          normalizedEmail,
          {
            stripeCustomerId: customerId,
            subscriptionStatus: profile ? 'active' : 'trialing'
          },
          profile ? 'Paid' : 'Trial',
          firstName,
          lastName
        )

        if (profile) {
          // They already had an account, almost always a card-free trial user
          // converting. Mark them active and stop the app-managed trial clock,
          // otherwise it would keep counting down and lock a paying customer out.
          await supabaseAdmin
            .from('profiles')
            .update({
              stripe_customer_id: customerId,
              subscription_status: 'active',
              trial_ends_at: null
            })
            .eq('id', profile.id)
          console.log(`Successfully converted ${normalizedEmail} to a paid subscription`)
        } else {
          // Paid before creating an account. Hold their details so that when they
          // register, handle_new_user picks them up as a paying customer rather
          // than starting a free trial clock. Upsert so a repeat checkout by the
          // same email doesn't error on the primary key.
          const { error: insertError } = await supabaseAdmin
            .from('allowed_signups')
            .upsert({
              email: normalizedEmail,
              stripe_customer_id: customerId,
              subscription_status: 'active'
            }, { onConflict: 'email' })
          if (insertError) {
            console.error(`Error inserting into allowed_signups for ${normalizedEmail}: ${insertError.message}`)
          } else {
            console.log(`Successfully logged allowed signup for ${normalizedEmail}`)
          }
        }
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const status = subscription.status // 'trialing', 'active', 'past_due', 'canceled'

      console.log(`Subscription for customer ${customerId} is now ${status}`)

      // Update Supabase profiles table. Once Stripe is governing this customer,
      // clear the app-managed trial clock so it can't expire under a payer.
      //
      // Only for 'active'. A NULL clock used to mean "unlimited"; since 19 Aug
      // 2026 it means the opposite, so writing NULL onto a row that is still
      // 'trialing' would lock the customer out on the spot. A Stripe trial gets
      // Stripe's own end date copied across instead, and if Stripe somehow
      // reports a trial with no end, the column is left untouched rather than
      // blanked — the existing app clock is a safer floor than nothing.
      const profileUpdate: Record<string, any> = { subscription_status: status }
      if (status === 'active') {
        profileUpdate.trial_ends_at = null
      } else if (status === 'trialing' && subscription.trial_end) {
        profileUpdate.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString()
      }

      await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('stripe_customer_id', customerId)

      // Fetch user's email to sync with Loops.so
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (profileData?.email) {
        let userGroup = 'Trial'
        if (status === 'active') {
          userGroup = 'Paid'
        } else if (status === 'canceled' || status === 'unpaid') {
          userGroup = 'Churned'
        }
        
        await syncToLoops(
          profileData.email.toLowerCase().trim(),
          {
            subscriptionStatus: status
          },
          userGroup
        )
      } else {
        console.warn(`Could not find profile for customer ID ${customerId} to sync with Loops.`)
      }
    }

    return new Response(JSON.stringify({ received: true }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
    
  } catch (err) {
    console.error(`Error processing webhook: ${err.message}`)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
