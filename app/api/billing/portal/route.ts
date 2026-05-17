import { NextRequest, NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getStripeClient } from '@/lib/stripe/client'

export async function POST(request: NextRequest) {
  const organizationId = await getDashboardOrganizationId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stripe = getStripeClient()
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const supabase = createServiceRoleClient()
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', organizationId)
    .maybeSingle()

  const customerId = sub?.stripe_customer_id as string | undefined
  if (!customerId) {
    return NextResponse.json({ error: 'No billing customer for this organization' }, { status: 400 })
  }

  const appBase = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appBase}/dashboard/settings/billing`,
  })

  return NextResponse.json({ url: portal.url })
}
