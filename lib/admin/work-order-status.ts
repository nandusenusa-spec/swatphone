/**
 * work_orders.status — fuente única para el bot y GET /api/work-orders/status.
 * El admin debe usar WORK_ORDER_VOICE_ADMIN_STATUSES; el API acepta también valores legacy en DB.
 */

/** Valores que el panel admin ofrece para alinear voz y CRM. */
export const WORK_ORDER_VOICE_ADMIN_STATUSES = [
  'pending',
  'in_production',
  'installation',
  'ready_for_pickup',
  'completed',
  'cancelled',
] as const

export type WorkOrderVoiceAdminStatus = (typeof WORK_ORDER_VOICE_ADMIN_STATUSES)[number]

const LEGACY_TO_VOICE: Record<string, WorkOrderVoiceAdminStatus> = {
  pending_approval: 'pending',
  draft: 'pending',
  received: 'pending',
  approved: 'in_production',
  in_progress: 'in_production',
  production: 'in_production',
  installing: 'installation',
  instalacion: 'installation',
  en_instalacion: 'installation',
  instalación: 'installation',
  pickup_ready: 'ready_for_pickup',
  delivered: 'completed',
}

/** Incluye legacy para no romper filas antiguas al guardar otros campos. */
export const WORK_ORDER_STATUS_WHITELIST = new Set<string>([
  ...WORK_ORDER_VOICE_ADMIN_STATUSES,
  ...Object.keys(LEGACY_TO_VOICE),
])

export function isAllowedWorkOrderStatus(s: string): boolean {
  return WORK_ORDER_STATUS_WHITELIST.has(s.trim().toLowerCase())
}

/** Mapea status de DB a estado del admin; null si no es reconocido. */
export function normalizeWorkOrderStatusForAdmin(
  raw: string | null | undefined,
): WorkOrderVoiceAdminStatus | null {
  const s = (raw || '').trim().toLowerCase()
  if (!s) return null
  if ((WORK_ORDER_VOICE_ADMIN_STATUSES as readonly string[]).includes(s)) {
    return s as WorkOrderVoiceAdminStatus
  }
  return LEGACY_TO_VOICE[s] ?? null
}

/** Para selects del admin: valor seguro del desplegable. */
export function workOrderStatusForAdminDropdown(raw: string | null | undefined): WorkOrderVoiceAdminStatus {
  return normalizeWorkOrderStatusForAdmin(raw) ?? 'pending'
}
