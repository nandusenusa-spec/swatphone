/**
 * GET https://api.vapi.ai/call/:id (documentación Vapi).
 * Requiere clave privada (server) en env.
 */
export async function fetchVapiCallById(callId: string): Promise<{
  ok: true
  data: Record<string, unknown>
} | { ok: false; error: string; status?: number }> {
  const key =
    process.env.VAPI_PRIVATE_KEY?.trim() ||
    process.env.VAPI_API_KEY?.trim() ||
    process.env.VAPI_SERVER_KEY?.trim() ||
    ''
  if (!key) {
    return { ok: false, error: 'Missing VAPI_PRIVATE_KEY (or VAPI_API_KEY) for server-side Vapi API.' }
  }
  const url = `https://api.vapi.ai/call/${encodeURIComponent(callId)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key.replace(/^Bearer\s+/i, '')}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) {
    return {
      ok: false,
      error: text.slice(0, 500) || `HTTP ${res.status}`,
      status: res.status,
    }
  }
  try {
    const data = JSON.parse(text) as Record<string, unknown>
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'Invalid JSON from Vapi API' }
  }
}
