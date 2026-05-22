/** Nombre a mostrar en /dashboard/calls: prioriza datos de ESA llamada, no el lead global del teléfono. */
export function resolveCallContactDisplay(input: {
  phone: string
  customerName?: string | null
  structuredExtraction?: Record<string, unknown> | null
  relatedLeadName?: string | null
}): { primary: string; hint: string | null } {
  const se = input.structuredExtraction || {}
  const fromRow = typeof input.customerName === 'string' ? input.customerName.trim() : ''
  let fromSaved = ''
  const ssl = se.latest_saved_lead
  if (ssl && typeof ssl === 'object' && !Array.isArray(ssl)) {
    const n = (ssl as Record<string, unknown>).customer_name
    if (typeof n === 'string') fromSaved = n.trim()
  }
  const fromSe = typeof se.customer_name === 'string' ? se.customer_name.trim() : ''

  const perCall = fromRow || fromSaved || fromSe
  if (perCall) {
    return { primary: perCall, hint: null }
  }

  const leadName = typeof input.relatedLeadName === 'string' ? input.relatedLeadName.trim() : ''
  if (leadName) {
    return {
      primary: leadName,
      hint: 'Mismo teléfono — sin nombre guardado en esta llamada',
    }
  }

  const phone = input.phone?.trim() || ''
  return { primary: phone || 'Desconocido', hint: null }
}
