/**
 * E.164 reservado para llamadas entrantes sin número resuelto (Vapi no envía `from`).
 * Configurable para evitar colisiones con números reales.
 */
export function unknownCallerPlaceholderE164(): string {
  const raw = process.env.VAPI_UNKNOWN_CALLER_E164?.trim()
  if (raw && raw.startsWith('+')) return raw
  return '+15555555501'
}
