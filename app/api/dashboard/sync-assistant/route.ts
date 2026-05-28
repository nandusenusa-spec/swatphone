import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { forwardAssistantSync } from '@/lib/dashboard/trigger-assistant-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Sincroniza el asistente de voz para la org del cliente logueado.
 * Misma lógica que Admin → Sincronizar, respuesta sin detalles de Vapi.
 */
export async function POST(request: Request) {
  const organizationId = await getDashboardOrganizationId()
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: 'Sesión vencida. Volvé a iniciar sesión.' }, { status: 401 })
  }

  const result = await forwardAssistantSync(request)
  return NextResponse.json(
    {
      ok: result.ok,
      message: result.clientMessage,
    },
    { status: result.ok ? 200 : result.httpStatus >= 400 && result.httpStatus < 600 ? result.httpStatus : 502 },
  )
}
