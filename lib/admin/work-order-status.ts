/** Estados permitidos en API admin / voz (work_orders.status TEXT). */
export const WORK_ORDER_STATUS_WHITELIST = new Set([
  'pending_approval',
  'approved',
  'in_production',
  'in_progress',
  'production',
  'pickup_ready',
  'ready_for_pickup',
  'completed',
  'delivered',
  'cancelled',
  'received',
  'draft',
])

export function isAllowedWorkOrderStatus(s: string): boolean {
  return WORK_ORDER_STATUS_WHITELIST.has(s.trim().toLowerCase())
}
