import { NextRequest, NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getStripeClient, stripePriceIdForPlan } from '@/lib/stripe/client'

type CheckoutBody = {
  plan?: 'starter' | 'pro' | 'enterprise'
  include_setup?: boolean
}

export async function POST(request: NextRequest) {
  const organizationId = await getDashboardOrganizationId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stripe = getStripeClient()
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  let body: CheckoutBody = {}
  try {
    body = (await request.json()) as CheckoutBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const plan = body.plan
  if (!plan || !['starter', 'pro', 'enterprise'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const priceId = stripePriceIdForPlan(plan)
  if (!priceId) {
    return NextResponse.json({ error: `Price not configured for ${plan}` }, { status: 503 })
  }

  const supabase = createServiceRoleClient()
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', organizationId)
    .maybeSingle()

  let customerId = existing?.stripe_customer_id as string | undefined
  if (!customerId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle()
    const customer = await stripe.customers.create({
      name: typeof org?.name === 'string' ? org.name : undefined,
      metadata: { organization_id: organizationId },
    })
    customerId = customer.id
    await supabase.from('subscriptions').upsert(
      {
        organization_id: organizationId,
        stripe_customer_id: customerId,
        plan: 'trial',
        status: 'trialing',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    )
  }

  const appBase = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')
  const lineItems: Array<{ price: string; quantity?: number }> = [{ price: priceId, quantity: 1 }]
  const setupPrice = process.env.STRIPE_PRICE_SETUP?.trim()
  if (body.include_setup && setupPrice) {
    lineItems.push({ price: setupPrice, quantity: 1 })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: lineItems,
    subscription_data: {
      trial_period_days: 14,
      metadata: { organization_id: organizationId, plan },
    },
    success_url: `${appBase}/dashboard/settings/billing?checkout=success`,
    cancel_url: `${appBase}/dashboard/settings/billing?checkout=canceled`,
    metadata: { organization_id: organizationId, plan },
  })

  return NextResponse.json({ url: session.url })
}
