/**
 * Mensajes de voz derivados solo de work_orders.status (fuente única).
 */

import {
  type WorkOrderVoiceAdminStatus,
  normalizeWorkOrderStatusForAdmin,
} from '@/lib/admin/work-order-status'

export type WorkOrderTrackingPhase =
  | 'pending'
  | 'production'
  | 'installation'
  | 'ready_for_pickup'
  | 'completed'
  | 'delivered'
  | 'cancelled'
  | 'other'

export type WorkOrderVoiceInfo = {
  status_code: string
  tracking_phase: WorkOrderTrackingPhase
  client_message_es: string
  pickup_ready: boolean
}

const VOICE_MESSAGE_BY_STATUS: Record<WorkOrderVoiceAdminStatus, WorkOrderVoiceInfo> = {
  pending: {
    status_code: 'pending',
    tracking_phase: 'pending',
    client_message_es: 'Su orden está pendiente.',
    pickup_ready: false,
  },
  in_production: {
    status_code: 'in_production',
    tracking_phase: 'production',
    client_message_es: 'Su orden está en producción.',
    pickup_ready: false,
  },
  installation: {
    status_code: 'installation',
    tracking_phase: 'installation',
    client_message_es: 'Su orden está en instalación.',
    pickup_ready: false,
  },
  ready_for_pickup: {
    status_code: 'ready_for_pickup',
    tracking_phase: 'ready_for_pickup',
    client_message_es: 'Su orden está lista para retirar.',
    pickup_ready: true,
  },
  completed: {
    status_code: 'completed',
    tracking_phase: 'completed',
    client_message_es: 'Su orden fue completada.',
    pickup_ready: false,
  },
  cancelled: {
    status_code: 'cancelled',
    tracking_phase: 'cancelled',
    client_message_es: 'Su orden fue cancelada.',
    pickup_ready: false,
  },
}

function normalizeStatus(raw: string): string {
  return raw.toLowerCase().trim()
}

export function workOrderStatusForVoice(row: Record<string, unknown>): WorkOrderVoiceInfo {
  const raw = String(row.status ?? '').trim()
  if (!raw) {
    return { ...VOICE_MESSAGE_BY_STATUS.pending, status_code: '' }
  }
  const canonical = normalizeWorkOrderStatusForAdmin(raw)
  if (canonical) {
    return { ...VOICE_MESSAGE_BY_STATUS[canonical] }
  }
  return {
    status_code: normalizeStatus(raw) || 'unknown',
    tracking_phase: 'other',
    client_message_es:
      'Tenemos un registro de su orden. Para el estado exacto, un miembro del equipo se lo confirma; no inventamos datos.',
    pickup_ready: false,
  }
}
