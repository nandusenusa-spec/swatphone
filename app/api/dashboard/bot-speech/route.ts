import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { loadClientSpeechSettings, saveClientSpeechSettings } from '@/lib/dashboard/client-speech'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { forwardAssistantSync } from '@/lib/dashboard/trigger-assistant-sync'
import { CLIENT_WELCOME_MESSAGE_MAX } from '@/lib/vapi/client-speech-prompt'

export const dynamic = 'force-dynamic'

export async function GET() {
  const organizationId = await getDashboardOrganizationId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceRoleClient()
  const settings = await loadClientSpeechSettings(service, organizationId)
  return NextResponse.json({
    ok: true,
    ...settings,
    welcomeMaxLength: CLIENT_WELCOME_MESSAGE_MAX,
  })
}

export async function POST(request: Request) {
  const organizationId = await getDashboardOrganizationId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const welcomeMessage = typeof body.welcome_message === 'string' ? body.welcome_message : ''
  const clientSpeechNotes =
    typeof body.client_speech_notes === 'string' ? body.client_speech_notes : ''

  const service = createServiceRoleClient()

  try {
    const saved = await saveClientSpeechSettings(service, organizationId, {
      welcomeMessage,
      clientSpeechNotes,
    })

    const sync = await forwardAssistantSync(request)
    return NextResponse.json({
      ok: true,
      welcome_message: saved.welcomeMessage,
      vapi_synced: sync.ok,
      sync_message: sync.ok
        ? 'Texto guardado y asistente actualizado.'
        : 'Texto guardado. Usá «Actualizar asistente de voz» si la llamada no suena igual.',
    })
  } catch (e) {
    const code = e instanceof Error ? e.message : 'save_failed'
    if (code === 'welcome_message_required') {
      return NextResponse.json({ error: 'welcome_message_required' }, { status: 400 })
    }
    console.error('[api/dashboard/bot-speech]', e)
    return NextResponse.json({ error: code }, { status: 500 })
  }
}
