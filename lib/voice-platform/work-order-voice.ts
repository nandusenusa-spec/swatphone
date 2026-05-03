/**
 * Mensajes para el bot según estado persistido en work_orders (TEXT + timestamps).
 * Convención mínima (sin migración obligatoria):
 * pending_approval, approved, in_production, pickup_ready, completed, delivered, cancelled
 * Legacy admitidos: received, in_progress, production, ready_for_pickup
 */

export type WorkOrderVoiceInfo = {
  status_code: string
  client_message_es: string
  pickup_ready: boolean
}

export function workOrderStatusForVoice(row: Record<string, unknown>): WorkOrderVoiceInfo {
  const raw = String(row.status ?? '').toLowerCase().trim()
  const pickupAt = row.pickup_ready_at ?? row.confirmed_delivery_at

  if (pickupAt) {
    return {
      status_code: raw || 'pickup_ready',
      client_message_es: 'Tu trabajo ya está listo y podés venir a retirarlo.',
      pickup_ready: true,
    }
  }

  if (raw === 'pickup_ready' || raw === 'ready_for_pickup') {
    return {
      status_code: raw,
      client_message_es: 'Tu trabajo ya está listo y podés venir a retirarlo.',
      pickup_ready: true,
    }
  }

  const map: Record<string, string> = {
    pending_approval:
      'Tu pedido está pendiente de aprobación del equipo. No confirmamos fechas de terminación hasta que esté aprobado.',
    draft: 'Tu pedido está en borrador pendiente de confirmación.',
    received: 'Registramos tu pedido; el equipo lo está revisando.',
    approved: 'Tu pedido fue aprobado y está pasando a producción.',
    in_production: 'Tu trabajo está en producción. Te avisamos cuando esté listo para retirar.',
    in_progress: 'Tu trabajo está en producción.',
    production: 'Tu trabajo está en producción.',
    completed:
      'Tu trabajo figura como finalizado. Si no retiraste aún, consultá en el local el detalle de entrega.',
    delivered: 'Tu trabajo figura como entregado.',
    cancelled: 'Este trabajo fue cancelado. Si necesitás ayuda, podemos pasarte con un asesor.',
  }

  if (map[raw]) {
    return { status_code: raw, client_message_es: map[raw], pickup_ready: false }
  }

  return {
    status_code: raw || 'unknown',
    client_message_es:
      'Tenemos un registro de tu trabajo. Para el estado exacto y plazos, un miembro del equipo te lo confirma; no inventamos fechas.',
    pickup_ready: false,
  }
}
