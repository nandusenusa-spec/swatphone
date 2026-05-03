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
import { normalizePhone } from '@/lib/phone'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  getClientStatusPayload,
  spokenJobLineFromStatusPayload,
} from '@/lib/print-shop/service'
import { openAiVoiceIdForLlmPipeline } from '@/lib/vapi/openai-voice-for-pipeline'
import { resolveTrustedCallerFirstName } from '@/lib/voice-platform/caller-identity'
import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import { screenInboundAssistantRequest } from '@/lib/vapi/phone-screening'
import {
  runCreateAppointment,
  runCreateFollowUp,
  runGetPriceQuote,
  runGetJobStatus,
  runSaveLeadInfo,
} from '@/lib/voice-platform/service'

type JsonRecord = Record<string, unknown>

function flattenVapiBody(body: JsonRecord): JsonRecord {
  const msg = body.message
  if (!msg || typeof msg !== 'object') return body
  const m = msg as JsonRecord
  const out: JsonRecord = { ...body, ...m }
  if (m.call) out.call = m.call
  return out
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' ? (value as JsonRecord) : null
}

async function resolveOrganizationId(
  request: NextRequest,
  supabase: ReturnType<typeof createServiceRoleClient>,
  flat: JsonRecord,
): Promise<string | null> {
  const fromQuery = request.nextUrl.searchParams.get('org')
  if (fromQuery) return fromQuery

  const assistantId = getAssistantIdFromPayload(flat)
  if (!assistantId) return null

  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('vapi_assistant_id', assistantId)
    .maybeSingle()

  return data?.id ?? null
}

async function handleCallEnded(flat: JsonRecord) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )

  const assistantId = getAssistantIdFromPayload(flat)
  if (!assistantId) {
    console.warn('[vapi:webhook] Missing assistantId in payload (call end)')
    return
  }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('vapi_assistant_id', assistantId)
    .single()

  if (orgError || !org) {
    console.warn('[vapi:webhook] Organization not found (call end)', { assistantId, orgError })
    return
  }

  const rawPhone = getCallerPhoneFromPayload(flat)
  const customerPhone = rawPhone ? normalizePhone(rawPhone) : null
  if (!customerPhone) {
    console.warn('[vapi:webhook] Missing caller phone (call end)', {
      assistantId,
      organizationId: org.id,
    })
    return
  }

  const { data: existingLead, error: leadLookupError } = await supabase
    .from('leads')
    .select('id')
    .eq('organization_id', org.id)
    .eq('phone', customerPhone)
    .maybeSingle()

  if (leadLookupError) {
    console.error('[vapi:webhook] Failed lead lookup (call end)', {
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
      .insert({
        organization_id: org.id,
        phone: customerPhone,
        name: 'Unknown',
        status: 'new',
      })
      .select('id')
      .single()

    if (leadError || !newLead) {
      console.error('[vapi:webhook] Failed to create lead (call end)', {
        organizationId: org.id,
        phone: customerPhone,
        error: leadError,
      })
      return
    }
    leadId = newLead.id
  }

  const call = asRecord(flat.call)
  const metadata = {
    startedAt: typeof call?.startedAt === 'string' ? call.startedAt : null,
    endedAt: typeof call?.endedAt === 'string' ? call.endedAt : null,
    orgId: typeof call?.orgId === 'string' ? call.orgId : null,
    eventType: typeof flat.type === 'string' ? flat.type : null,
  }

  const transcript = getTranscriptFromPayload(flat)
  const recordingUrl = getRecordingUrlFromPayload(flat)
  const summary = getSummaryFromPayload(flat)
  const durationSeconds = getDurationSecondsFromPayload(flat) ?? 0
  const callId = getCallIdFromPayload(flat)
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
    console.error('[vapi:webhook] Failed to insert call (call end)', {
      organizationId: org.id,
      leadId,
      callId,
      error: insertError,
    })
  } else {
    console.log('[vapi:webhook] Call stored (call end)', {
      organizationId: org.id,
      leadId,
      callId,
      phone: customerPhone,
      durationSeconds,
    })
  }
}

function defaultTransientAssistant(firstMessage: string) {
  return {
    firstMessage,
    model: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      messages: [
        {
          role: 'system',
          content:
            'El estado del pedido ya se comunicó en el primer mensaje. Responde solo preguntas breves de seguimiento. No inventes datos.',
        },
      ],
    },
    voice: { provider: 'openai', voiceId: openAiVoiceIdForLlmPipeline(null, 'alloy') },
    transcriber: { provider: 'deepgram', model: 'nova-2', language: 'es' },
  }
}

async function handleAssistantRequest(request: NextRequest, flat: JsonRecord) {
  const supabase = createServiceRoleClient()
  const orgId = await resolveOrganizationId(request, supabase, flat)
  const phoneRaw = getCallerPhoneFromPayload(flat)

  if (!phoneRaw?.trim()) {
    console.warn('[vapi:webhook] assistant-request: missing caller phone')
    return NextResponse.json({
      assistant: defaultTransientAssistant(
        'Hola, gracias por llamarnos. No pudimos identificar su número automáticamente.',
      ),
    })
  }

  const normalizedPhone = normalizePhone(phoneRaw)

  if (orgId && normalizedPhone) {
    try {
      const runtime = await getOrganizationRuntimeConfig(orgId)
      const screened = await screenInboundAssistantRequest({
        organizationId: orgId,
        phoneRaw: normalizedPhone,
        spamThreshold: runtime.spamPolicy.threshold,
      })
      if (!screened.allow) {
        return NextResponse.json({ error: screened.error })
      }
    } catch (e) {
      console.warn('[vapi:webhook] phone screening skipped', e)
    }
  }

  const payload = await getClientStatusPayload(supabase, phoneRaw, orgId)

  let orgName = 'SWATWORKS'
  if (orgId) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
    if (typeof orgRow?.name === 'string' && orgRow.name.trim()) {
      orgName = orgRow.name.trim()
    }
  }

  const identity =
    orgId && normalizedPhone
      ? await resolveTrustedCallerFirstName({
          organizationId: orgId,
          phone: normalizedPhone,
        })
      : { firstName: null, source: 'none' as const }

  let firstMessage: string
  if (identity.firstName) {
    const personalized = `Buen día ${identity.firstName}, gracias por comunicarte con ${orgName}.`
    if (!payload.found) {
      firstMessage = `${personalized} ¿En qué podemos ayudarte hoy?`
    } else if (!payload.job) {
      firstMessage = `${personalized} ¿En qué podemos ayudarte hoy? No encontramos trabajos activos en este momento.`
    } else {
      firstMessage = `${personalized} ${spokenJobLineFromStatusPayload(payload.job)}`
    }
  } else if (!payload.found) {
    firstMessage = 'Hola, gracias por llamar. ¿Me indica su nombre, por favor?'
  } else {
    const greeting = `Hola ${payload.client.name}, ¿en qué podemos ayudarte hoy?`
    if (!payload.job) {
      firstMessage = `${greeting} No encontramos trabajos activos en este momento.`
    } else {
      firstMessage = `${greeting} ${spokenJobLineFromStatusPayload(payload.job)}`
    }
  }

  console.log('[vapi:webhook] assistant-request', {
    organizationId: orgId,
    personalized: Boolean(identity.firstName),
    personalized_source: identity.source,
    personalized_name: identity.firstName,
    normalized_phone_suffix: normalizedPhone.length >= 4 ? normalizedPhone.slice(-4) : null,
    found: payload.found,
    hasJob: !!payload.found && !!payload.job,
  })

  return NextResponse.json({
    assistant: defaultTransientAssistant(firstMessage),
  })
}

async function handleToolCalls(request: NextRequest, flat: JsonRecord) {
  const list = Array.isArray(flat.toolCallList)
    ? flat.toolCallList
    : Array.isArray(flat.toolCalls)
      ? flat.toolCalls
      : null
  if (!list) {
    return NextResponse.json({ results: [] })
  }

  const supabase = createServiceRoleClient()
  const orgId = await resolveOrganizationId(request, supabase, flat)
  const phoneRaw = getCallerPhoneFromPayload(flat)

  const results = await Promise.all(
    list.map(async (tc) => {
      const item = tc as JsonRecord
      const toolCallId =
        (typeof item.toolCallId === 'string' && item.toolCallId) ||
        (typeof item.id === 'string' && item.id) ||
        ''
      const fn = asRecord(item.function)
      const name =
        typeof fn?.name === 'string' ? fn.name : typeof item.name === 'string' ? item.name : ''
      const parseArgs = (): JsonRecord => {
        const raw = fn?.arguments ?? item.arguments
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as JsonRecord
        if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw) as unknown
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
              ? (parsed as JsonRecord)
              : {}
          } catch {
            return {}
          }
        }
        return {}
      }
      const args = parseArgs()

      let result = '{}'
      if (name === 'get_client_status' && phoneRaw) {
        const payload = await getClientStatusPayload(supabase, phoneRaw, orgId)
        result = JSON.stringify(payload)
      } else if (name === 'get_job_status' && phoneRaw && orgId) {
        const out = await runGetJobStatus({
          organizationId: orgId,
          jobNumber:
            typeof args.job_number === 'string'
              ? args.job_number
              : typeof args.order_number === 'string'
                ? args.order_number
                : undefined,
          phone: phoneRaw,
        })
        result = JSON.stringify(out)
      } else if ((name === 'get_product_price' || name === 'get_price_quote') && orgId) {
        const serviceName =
          typeof args.product_name === 'string'
            ? args.product_name
            : typeof args.service_name === 'string'
              ? args.service_name
              : ''
        const out = serviceName.trim()
          ? await runGetPriceQuote({
              organizationId: orgId,
              serviceName,
            })
          : { error: 'missing_required_fields', fields: ['product_name'] }
        result = JSON.stringify(out)
      } else if (name === 'save_lead_info' && phoneRaw && orgId) {
        const out = await runSaveLeadInfo({
          organizationId: orgId,
          phone: phoneRaw,
          name: typeof args.name === 'string' ? args.name : undefined,
          email: typeof args.email === 'string' ? args.email : undefined,
          company: typeof args.company === 'string' ? args.company : undefined,
          notes: typeof args.notes === 'string' ? args.notes : undefined,
        })
        console.log('[vapi:webhook] save_lead_info persisted', {
          organizationId: orgId,
          phone_suffix: normalizePhone(phoneRaw).slice(-4),
          saved: out.saved,
          has_name: Boolean(out.customer?.name),
          has_email: Boolean(out.customer?.email),
          has_company: Boolean(out.customer?.company),
        })
        result = JSON.stringify(out)
      } else if (name === 'create_appointment' && orgId) {
        const appointmentAt =
          typeof args.appointment_at === 'string' ? args.appointment_at.trim() : ''
        const out = appointmentAt
          ? await runCreateAppointment({
              organizationId: orgId,
              phone: phoneRaw || (typeof args.phone === 'string' ? args.phone : ''),
              customerName:
                typeof args.customer_name === 'string' ? args.customer_name : undefined,
              appointmentAt,
              notes: typeof args.notes === 'string' ? args.notes : undefined,
            })
          : { error: 'missing_required_fields', fields: ['appointment_at'] }
        result = JSON.stringify(out)
      } else if (name === 'create_follow_up' && orgId) {
        const title = typeof args.title === 'string' ? args.title.trim() : ''
        const out = title
          ? await runCreateFollowUp({
              organizationId: orgId,
              phone: phoneRaw || (typeof args.phone === 'string' ? args.phone : undefined),
              customerId: typeof args.customer_id === 'string' ? args.customer_id : undefined,
              callLogId: typeof args.call_log_id === 'string' ? args.call_log_id : undefined,
              title,
              notes: typeof args.notes === 'string' ? args.notes : undefined,
              owner: typeof args.owner === 'string' ? args.owner : undefined,
              dueAt: typeof args.due_at === 'string' ? args.due_at : undefined,
              priority:
                args.priority === 'low' ||
                args.priority === 'normal' ||
                args.priority === 'high' ||
                args.priority === 'urgent'
                  ? args.priority
                  : undefined,
              callbackRequired: Boolean(args.callback_required),
            })
          : { error: 'missing_required_fields', fields: ['title'] }
        result = JSON.stringify(out)
      }

      // Vapi ToolCallResult requires both toolCallId and name
      return { toolCallId, name: name || 'unknown', result }
    }),
  )

  return NextResponse.json({ results })
}

export async function POST(request: NextRequest) {
  try {
    const rawSecret = process.env.VAPI_WEBHOOK_SECRET
    if (rawSecret) {
      const headerSecret =
        request.headers.get('x-vapi-secret') || request.headers.get('X-Vapi-Secret')
      if (!headerSecret || headerSecret !== rawSecret) {
        console.warn('[vapi:webhook] Invalid or missing webhook secret header')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = (await request.json()) as JsonRecord
    const flat = flattenVapiBody(body)
    const eventType = typeof flat.type === 'string' ? flat.type : null

    if (eventType === 'assistant-request') {
      return handleAssistantRequest(request, flat)
    }

    if (eventType === 'tool-calls') {
      return handleToolCalls(request, flat)
    }

    if (eventType === 'call-ended' || eventType === 'end-of-call-report') {
      await handleCallEnded(flat)
    }

    return NextResponse.json({})
  } catch (error) {
    console.error('[vapi:webhook] Failed to process webhook', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
