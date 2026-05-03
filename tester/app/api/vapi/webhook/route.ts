import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  getAssistantIdFromPayload,
  getCallIdFromPayload,
  getCallerPhoneFromPayload,
  getDurationSecondsFromPayload,
  getRecordingUrlFromPayload,
  getSummaryFromPayload,
  getTranscriptFromPayload,
} from '@/lib/vapi/payload'

type VapiBody = Record<string, unknown>

function normalizePhone(phone: string): string {
  const trimmed = phone.trim()
  const cleaned = trimmed.replace(/[^\d+]/g, '')
  return cleaned || trimmed
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

async function handleCallEnded(body: VapiBody) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )

  const assistantId = getAssistantIdFromPayload(body)
  if (!assistantId) {
    console.warn('[vapi:webhook] Missing assistantId in payload')
    return
  }

  // Find organization by assistant ID
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('vapi_assistant_id', assistantId)
    .single()

  if (orgError || !org) {
    console.warn('[vapi:webhook] Organization not found', { assistantId, orgError })
    return
  }

  const rawPhone = getCallerPhoneFromPayload(body)
  const customerPhone = rawPhone ? normalizePhone(rawPhone) : null
  if (!customerPhone) {
    console.warn('[vapi:webhook] Missing caller phone', { assistantId, organizationId: org.id })
    return
  }

  // Get or create lead
  const { data: existingLead, error: leadLookupError } = await supabase
    .from('leads')
    .select('id')
    .eq('organization_id', org.id)
    .eq('phone', customerPhone)
    .maybeSingle()

  if (leadLookupError) {
    console.error('[vapi:webhook] Failed lead lookup', {
      organizationId: org.id,
      phone: customerPhone,
      error: leadLookupError,
    })
    return
  }

  let leadId: string
  if (existingLead) {
    leadId = existingLead.id
  } else {
    const { data: newLead, error: leadError } = await supabase
      .from('leads')
      .insert({ organization_id: org.id, phone: customerPhone, name: 'Unknown', status: 'new' })
      .select('id')
      .single()

    if (leadError || !newLead) {
      console.error('[vapi:webhook] Failed to create lead', {
        organizationId: org.id,
        phone: customerPhone,
        error: leadError,
      })
      return
    }
    leadId = newLead.id
  }

  const call = asRecord(body.call)
  const metadata = {
    startedAt: typeof call?.startedAt === 'string' ? call.startedAt : null,
    endedAt: typeof call?.endedAt === 'string' ? call.endedAt : null,
    orgId: typeof call?.orgId === 'string' ? call.orgId : null,
    eventType: typeof body.type === 'string' ? body.type : null,
  }
  const transcript = getTranscriptFromPayload(body)
  const recordingUrl = getRecordingUrlFromPayload(body)
  const summary = getSummaryFromPayload(body)
  const durationSeconds = getDurationSecondsFromPayload(body) ?? 0
  const callId = getCallIdFromPayload(body)
  const startedAt = toIsoOrNull(metadata.startedAt)
  const endedAt = toIsoOrNull(metadata.endedAt)

  const { error: insertError } = await supabase.from('calls').insert({
    organization_id: org.id,
    lead_id: leadId,
    vapi_call_id: callId,
    phone_number: customerPhone,
    duration_seconds: durationSeconds,
    transcript: transcript || 'No transcript available',
    recording_url: recordingUrl,
    summary,
    metadata,
    direction: 'inbound',
    status: 'completed',
    started_at: startedAt || undefined,
    ended_at: endedAt || undefined,
  })

  if (insertError) {
    console.error('[vapi:webhook] Failed to insert call', {
      organizationId: org.id,
      leadId,
      callId,
      error: insertError,
    })
  } else {
    console.log('[vapi:webhook] Call stored', {
      organizationId: org.id,
      leadId,
      callId,
      phone: customerPhone,
      durationSeconds,
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: VapiBody = await request.json()
    const eventType = typeof body.type === 'string' ? body.type : null

    if (eventType === 'call-ended' || eventType === 'end-of-call-report') {
      await handleCallEnded(body)
    }

    return NextResponse.json(
      {
        ok: true,
        eventType,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[vapi:webhook] Failed to process webhook', error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 200 }
    )
  }
}
