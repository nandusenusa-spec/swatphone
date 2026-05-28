import 'server-only'

/** Mensaje corto para el dashboard del cliente (sin IDs de Vapi ni URLs técnicas). */
export function clientFriendlySyncMessage(ok: boolean, httpStatus?: number): string {
  if (ok) {
    return 'Listo. Tu asistente de voz quedó actualizado para las próximas llamadas.'
  }
  if (httpStatus === 400) {
    return 'Falta configuración del teléfono en el sistema. Contactá a SWAT y lo activamos.'
  }
  if (httpStatus === 401) {
    return 'Sesión vencida. Volvé a iniciar sesión e intentá de nuevo.'
  }
  return 'No se pudo actualizar ahora. Probá de nuevo en un minuto o avisá a SWAT.'
}

export type AssistantSyncForwardResult = {
  ok: boolean
  httpStatus: number
  clientMessage: string
  /** Solo para logs / admin; no exponer al cliente en UI. */
  detail?: string
}

export async function forwardAssistantSync(request: Request): Promise<AssistantSyncForwardResult> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : '')

  if (!base) {
    return {
      ok: false,
      httpStatus: 0,
      clientMessage: clientFriendlySyncMessage(false),
      detail: 'missing_app_url',
    }
  }

  const url = `${base.replace(/\/$/, '')}/api/vapi/sync-assistant`
  const cookie = request.headers.get('cookie')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: '{}',
      cache: 'no-store',
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const detail =
      typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : `http_${res.status}`

    if (res.ok) {
      return {
        ok: true,
        httpStatus: res.status,
        clientMessage: clientFriendlySyncMessage(true),
        detail,
      }
    }

    console.warn('[dashboard/assistant-sync]', { status: res.status, detail: detail.slice(0, 300) })
    return {
      ok: false,
      httpStatus: res.status,
      clientMessage: clientFriendlySyncMessage(false, res.status),
      detail,
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.warn('[dashboard/assistant-sync] exception', detail)
    return {
      ok: false,
      httpStatus: 0,
      clientMessage: clientFriendlySyncMessage(false),
      detail,
    }
  }
}
