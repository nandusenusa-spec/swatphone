import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { fetchVapiCallById } from '@/lib/vapi/vapi-get-call'
import {
  buildTranscriptFromMessages,
  getCallIdFromPayload,
  getCallerPhoneFromPayload,
  getEndedReasonFromPayload,
  getMessagesFromPayload,
  getRecordingUrlFromPayload,
  getSummaryFromPayload,
  getTranscriptFromPayload,
  mergeVapiWebhookBodiesForExtraction,
} from '@/lib/vapi/payload'
import { flattenVapiServerEvent } from '@/lib/vapi/vapi-event-flatten'
import { insertVapiCallEventRaw } from '@/lib/voice-platform/vapi-raw-events'
import { unknownCallerPlaceholderE164 } from '@/lib/vapi/vapi-unknown-caller'
import { runSaveCallOutcome } from '@/lib/voice-platform/service'

type AdminTokenPayload = { adminId: string; username: string; exp: number }

function verifyTokenSignature(payloadEncoded: string, signature: string): boolean {
  const secret = process.env.ADMIN_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(payloadEncoded).digest('base64url')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

function parseAdminToken(rawToken: string): AdminTokenPayload | null {
  const token = rawToken.trim()
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadEncoded, signature] = parts
  if (!payloadEncoded || !signature || !verifyTokenSignature(payloadEncoded, signature)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8')) as AdminTokenPayload
    if (!parsed?.username || !parsed?.adminId || typeof parsed.exp !== 'number') return null
    if (Date.now() > parsed.exp) return null
    return parsed
  } catch {
    return null
  }
}

function getAdminToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const t = authHeader.split(' ')[1]?.trim()
    if (t) return t
  }
  return request.cookies.get('admin_token')?.value || null
}

async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  const token = getAdminToken(request)
  if (!token) return false
  const payload = parseAdminToken(token)
  if (!payload) return false
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('admin_credentials')
    .select('id, username')
    .eq('id', payload.adminId)
    .eq('username', payload.username)
    .eq('is_active', true)
    .limit(1)
  return !!data && data.length > 0
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminToken(request))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { organizationId?: string; callId?: string }
  try {
    body = (await request.json()) as { organizationId?: string; callId?: string }
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const organizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : ''
  const callId = typeof body.callId === 'string' ? body.callId.trim() : ''
  if (!organizationId || !callId) {
    return NextResponse.json({ ok: false, error: 'organizationId y callId son obligatorios' }, { status: 400 })
  }

  const fetched = await fetchVapiCallById(callId)
  if (!fetched.ok) {
    return NextResponse.json({ ok: false, error: fetched.error, status: fetched.status }, { status: 502 })
  }

  const apiPayload = fetched.data
  const synthetic = {
    type: 'end-of-call-report',
    ...apiPayload,
    call: apiPayload,
  } as Record<string, unknown>
  const flat = flattenVapiServerEvent(synthetic)
  const merged = mergeVapiWebhookBodiesForExtraction(flat, flat)

  const rawIns = await insertVapiCallEventRaw({
    organizationId,
    vapiCallId: getCallIdFromPayload(merged) || callId,
    messageType: 'end-of-call-report',
    eventType: 'import',
    payload: { source: 'import-vapi-call', vapi_response: apiPayload },
  })

  let transcript =
    (getTranscriptFromPayload(merged) || '').trim() ||
    (getTranscriptFromPayload(apiPayload) || '').trim()
  const messages = getMessagesFromPayload(merged) ?? getMessagesFromPayload(apiPayload)
  const messagesCount = messages?.length ?? 0
  if (!transcript && messages?.length) {
    transcript = (buildTranscriptFromMessages(messages) || '').trim()
  }

  const recordingUrl =
    getRecordingUrlFromPayload(merged) || getRecordingUrlFromPayload(apiPayload)
  const summary = getSummaryFromPayload(merged) || getSummaryFromPayload(apiPayload) || ''
  const endedReason =
    getEndedReasonFromPayload(merged) ||
    getEndedReasonFromPayload(apiPayload) ||
    null

  let phone =
    getCallerPhoneFromPayload(merged) ||
    getCallerPhoneFromPayload(apiPayload) ||
    ''
  if (!phone.trim()) {
    phone = unknownCallerPlaceholderE164()
  }

  try {
    await runSaveCallOutcome({
      organizationId,
      vapiCallId: callId,
      phone,
      transcript: transcript || undefined,
      summary: summary || undefined,
      result: endedReason || 'imported',
      // vapi_* vive en JSONB; el tipo base no los lista — coherente con dispatcher.
      structuredExtraction: {
        summary: summary || null,
        next_action: null,
        callback_required: false,
        follow_up_date: null,
        phone,
        vapi_recording_url: recordingUrl || undefined,
        vapi_ended_reason: endedReason || undefined,
        vapi_import_source: 'api_admin_import',
        vapi_messages_count: messagesCount,
      } as never,
      ended: true,
    })

    return NextResponse.json({
      ok: true,
      callId,
      transcriptLength: transcript.length,
      recordingUrlExists: Boolean(recordingUrl),
      messagesCount,
      rawEventId: rawIns.id,
      rawEventError: rawIns.error,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        ok: false,
        callId,
        error: msg,
        transcriptLength: transcript.length,
        recordingUrlExists: Boolean(recordingUrl),
        rawEventId: rawIns.id,
      },
      { status: 500 },
    )
  }
}
