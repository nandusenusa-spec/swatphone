import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getStripeClient } from '@/lib/stripe/client'

export const runtime = 'nodejs'

function planFromPriceId(priceId: string | null | undefined): string {
  if (!priceId) return 'starter'
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE?.trim()) return 'enterprise'
  if (priceId === process.env.STRIPE_PRICE_PRO?.trim()) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_STARTER?.trim()) return 'starter'
  return 'starter'
}

async function upsertFromSubscription(
  organizationId: string,
  sub: Stripe.Subscription,
  setupFeePaid?: boolean,
) {
  const supabase = createServiceRoleClient()
  const priceId = sub.items.data[0]?.price?.id ?? null
  const patch: Record<string, unknown> = {
    organization_id: organizationId,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    plan: planFromPriceId(priceId),
    status: sub.status,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }
  if (setupFeePaid !== undefined) patch.setup_fee_paid = setupFeePaid
  await supabase.from('subscriptions').upsert(patch, { onConflict: 'organization_id' })
}

export async function POST(request: NextRequest) {
  const stripe = getStripeClient()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 503 })
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('[billing/webhook] signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const organizationId = session.metadata?.organization_id
        if (!organizationId || typeof organizationId !== 'string') break
        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId)
          await upsertFromSubscription(organizationId, sub, session.metadata?.include_setup === 'true')
        } else {
          const supabase = createServiceRoleClient()
          await supabase.from('subscriptions').upsert(
            {
              organization_id: organizationId,
              stripe_customer_id:
                typeof session.customer === 'string' ? session.customer : session.customer?.id,
              setup_fee_paid: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'organization_id' },
          )
        }
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const organizationId = sub.metadata?.organization_id
        if (!organizationId || typeof organizationId !== 'string') break
        await upsertFromSubscription(organizationId, sub)
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id
        if (!subId) break
        const sub = await stripe.subscriptions.retrieve(subId)
        const organizationId = sub.metadata?.organization_id
        if (organizationId && typeof organizationId === 'string') {
          await upsertFromSubscription(organizationId, { ...sub, status: 'past_due' } as Stripe.Subscription)
        }
        break
      }
      default:
        break
    }
  } catch (err) {
    console.error('[billing/webhook] handler error', err)
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
