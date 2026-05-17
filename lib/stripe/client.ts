import Stripe from 'stripe'

let stripeSingleton: Stripe | null = null

export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) return null
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {
      apiVersion: '2024-11-20.acacia',
      typescript: true,
    })
  }
  return stripeSingleton
}

export function stripePriceIdForPlan(plan: 'starter' | 'pro' | 'enterprise'): string | null {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER?.trim(),
    pro: process.env.STRIPE_PRICE_PRO?.trim(),
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE?.trim(),
  }
  const id = map[plan]
  return id || null
}
