/**
 * Rutas que deben aceptar solo llamadas con VAPI_WEBHOOK_SECRET (header x-vapi-secret)
 * cuando esa variable está definida. Alineado con el chequeo en /api/vapi/webhook.
 */
export function pathRequiresVapiWebhookSecret(pathname: string): boolean {
  if (pathname.startsWith('/api/vapi/sync-assistant')) return false
  if (pathname.startsWith('/api/vapi/events')) return true
  if (pathname === '/api/vapi/tool-calls') return true
  if (pathname.startsWith('/api/vapi/tools/')) return true
  if (pathname === '/api/vapi/webhook') return true
  if (pathname.startsWith('/api/voice/events')) return true
  return false
}
