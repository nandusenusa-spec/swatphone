import { createServiceRoleClient } from '@/lib/supabase/service-role'

const ACTIVE_STATUSES = new Set(['trialing', 'active', 'past_due'])

export type SubscriptionRow = {
  plan: string
  status: string
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  setup_fee_paid: boolean
}

export async function getOrganizationSubscription(
  organizationId: string,
): Promise<SubscriptionRow | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, trial_ends_at, current_period_end, cancel_at_period_end, setup_fee_paid')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === 'PGRST205') return null
    console.warn('[billing] subscription lookup failed', error.message)
    return null
  }
  return data as SubscriptionRow | null
}

/** Sin Stripe configurado o sin fila: permitir acceso (rollout gradual). */
export async function organizationHasDashboardAccess(organizationId: string): Promise<boolean> {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return true
  if (process.env.STRIPE_ENFORCE_BILLING !== 'true') return true
  const sub = await getOrganizationSubscription(organizationId)
  if (!sub) return false
  return ACTIVE_STATUSES.has(sub.status)
}
