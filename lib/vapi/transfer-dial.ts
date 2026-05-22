import { normalizePhone } from '@/lib/phone'
import { getAvailableCallRecipients, getNextCallRecipient } from '@/lib/team/call-routing'
import {
  isPlausibleE164,
  legacyPhone,
  usableDestinations,
  type RuntimeTransferSlice,
} from '@/lib/vapi/transfer-destinations'

/** Hay al menos un destino marcable (equipo, tabla de routing o legacy). */
export async function organizationHasTransferCapacity(
  organizationId: string,
  runtime: RuntimeTransferSlice,
): Promise<boolean> {
  const recipients = await getAvailableCallRecipients(organizationId)
  if (recipients.length > 0) return true
  if (usableDestinations(runtime.transferPolicy.transferDestinations || []).length > 0) return true
  return legacyPhone(runtime) !== null
}

/**
 * Elige el E.164 a marcar. Si hay equipo disponible, prioriza coincidencia;
 * si no hay equipo pero sí destinos en routing, usa el número configurado (evita bloquear transfer).
 */
export async function resolveTransferDialE164(input: {
  organizationId: string
  runtime: RuntimeTransferSlice
  preferredE164?: string | null
}): Promise<{ e164: string | null; source: string }> {
  const preferred = normalizePhone(input.preferredE164 || '')
  const destinations = usableDestinations(input.runtime.transferPolicy.transferDestinations || [])
  const legacy = legacyPhone(input.runtime)
  const recipients = await getAvailableCallRecipients(input.organizationId)

  const preferredInRouting =
    preferred &&
    isPlausibleE164(preferred) &&
    (destinations.some((d) => d.phoneE164 === preferred) || legacy === preferred)

  if (preferred && isPlausibleE164(preferred)) {
    if (recipients.length === 0) {
      if (preferredInRouting || destinations.length > 0 || legacy) {
        return { e164: preferred, source: 'preferred_routing_without_team' }
      }
    } else if (recipients.some((r) => r.phoneE164 === preferred)) {
      return { e164: preferred, source: 'preferred_team_match' }
    } else {
      const fallback = await getNextCallRecipient(input.organizationId)
      if (fallback) {
        return { e164: fallback.phoneE164, source: 'team_fallback' }
      }
      if (preferredInRouting) {
        return { e164: preferred, source: 'preferred_routing_over_unmatched_team' }
      }
    }
  }

  if (recipients.length > 0) {
    const next = await getNextCallRecipient(input.organizationId)
    if (next) return { e164: next.phoneE164, source: 'next_available_recipient' }
  }

  if (destinations.length === 1) {
    return { e164: destinations[0].phoneE164, source: 'single_destination' }
  }

  if (legacy) return { e164: legacy, source: 'legacy_number' }

  return { e164: null, source: 'none' }
}
