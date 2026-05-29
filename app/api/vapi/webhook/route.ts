import { NextRequest, NextResponse } from 'next/server'
import {
  getAssistantIdFromPayload,
  getCallIdFromPayload,
  getCallerPhoneFromPayload,
  getDurationSecondsFromPayload,
  getEndedReasonFromPayload,
  getRecordingUrlFromPayload,
  getSentimentFromPayload,
  getSummaryFromPayload,
  getTopicFromPayload,
  getTranscriptFromPayload,
} from '@/lib/vapi/payload'
import { timingSafeEqualUtf8 } from '@/lib/security/timing-safe'
import { normalizePhone } from '@/lib/phone'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { persistCallArtifacts } from '@/lib/vapi/persistence'
import { flattenVapiServerEvent } from '@/lib/vapi/vapi-event-flatten'
import { unknownCallerPlaceholderE164 } from '@/lib/vapi/vapi-unknown-caller'
import {
  getClientStatusPayload,
  spokenJobLineFromStatusPayload,
} from '@/lib/print-shop/service'
import {
  buildVapiAssistantCallBehavior,
  enhanceTranscriberForLowLatency,
} from '@/lib/vapi/call-settings'
import {
  getTranscriberConfigForVapi,
  resolveOpenAiVoiceForOrganization,
  resolveOpenAiVoiceForSync,
} from '@/lib/vapi/voice-for-vapi'
import { resolveTrustedCallerFirstName } from '@/lib/voice-platform/caller-identity'
import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import { defaultWelcomeForOrganization, resolveWelcomeMessageForCall } from '@/lib/vapi/welcome-message'
import { screenInboundAssistantRequest } from '@/lib/vapi/phone-screening'
import {
  runCreateAppointment,
  runCreateFollowUp,
  runGetPriceQuote,
  runGetJobStatus,
} from '@/lib/voice-platform/service'
import { resolveOrganizationIdForVapiTools } from '@/lib/vapi/vapi-org-resolution'
import { resolvePhoneForVapiTool } from '@/lib/vapi/vapi-caller-phone'
import { executeToolHandler } from '@/lib/vapi/tool-handlers'
import { logVapiToolCallReceived } from '@/lib/vapi/tool-call-logging'
import { prepareCommercialFollowUpFromArgs } from '@/lib/vapi/commercial-follow-up'
import { getCallLogLeadCustomerContext } from '@/lib/voice-platform/repository'

type JsonRecord = Record<string, unknown>

function flattenVapiBody(body: JsonRecord): JsonRecord {
  return flattenVapiServerEvent(body)
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' ? (value as JsonRecord) : null
}

async function handleCallEnded(flat: JsonRecord) {
  const supabase = createServiceRoleClient()

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
  let customerPhone = rawPhone ? normalizePhone(rawPhone) : ''
  if (!customerPhone) {
    customerPhone = normalizePhone(unknownCallerPlaceholderE164())
    console.warn('[vapi:webhook] Missing caller phone (call end); using placeholder for call_logs', {
      assistantId,
      organizationId: org.id,
    })
  }

  const call = asRecord(flat.call)
  const transcript = getTranscriptFromPayload(flat)
  const recordingUrl = getRecordingUrlFromPayload(flat)
  const summary = getSummaryFromPayload(flat)
  const durationSeconds = getDurationSecondsFromPayload(flat)
  const callId = getCallIdFromPayload(flat)
  const endedReason = getEndedReasonFromPayload(flat)
  const topic = getTopicFromPayload(flat)
  const sentiment = getSentimentFromPayload(flat)

  const structuredExtras: Record<string, unknown> = {
    webhook_call_end: true,
    ...(recordingUrl ? { vapi_recording_url: recordingUrl } : {}),
    ...(typeof durationSeconds === 'number' ? { vapi_duration_seconds: durationSeconds } : {}),
    ...(topic ? { vapi_topic: topic } : {}),
    ...(sentiment ? { vapi_sentiment: sentiment } : {}),
    ...(endedReason ? { vapi_ended_reason: endedReason } : {}),
    ...(call
      ? {
          vapi_call_started_at: typeof call.startedAt === 'string' ? call.startedAt : null,
          vapi_call_ended_at: typeof call.endedAt === 'string' ? call.endedAt : null,
        }
      : {}),
  }

  try {
    const persisted = await persistCallArtifacts({
      organizationId: org.id,
      vapiCallId: callId || undefined,
      phone: customerPhone,
      transcript: transcript || undefined,
      summary: summary || undefined,
      outcome: endedReason || 'completed',
      nextAction: 'Review call in dashboard',
      ended: true,
      structuredExtractionFromEvent: structuredExtras,
    })
    console.log('[vapi/call-outcome]', {
      source: 'webhook',
      callId: callId || null,
      organization_id: org.id,
      saved: true,
      table: 'call_logs',
      transcriptLength: (transcript || '').length,
      summaryExists: Boolean((summary || '').trim()),
      endedReason: endedReason || null,
      call_log_id: persisted.call_log_id,
      error: null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const errObj = e as { code?: string; details?: string; hint?: string }
    console.error('[vapi/call-outcome]', {
      source: 'webhook',
      callId: callId || null,
      organization_id: org.id,
      saved: false,
      table: 'call_logs',
      transcriptLength: (transcript || '').length,
      summaryExists: Boolean((summary || '').trim()),
      endedReason: endedReason || null,
      error: msg.slice(0, 400),
      code: errObj?.code ?? null,
      details: errObj?.details ?? null,
      hint: errObj?.hint ?? null,
    })
  }
}

// ─────────────────────────────────────────────────────────────
// FIX: se agregó orgName, tools de save_lead_info, system prompt
// correcto para captura de leads, y se corrigió el encoding.
// ─────────────────────────────────────────────────────────────
function defaultTransientAssistant(
  firstMessage: string,
  voiceRes: { voiceProvider: string; voiceId: string },
  trCfg: { provider: string; model: string; language: string },
  orgName = 'SWATWORKS',
) {
  return {
    firstMessage,
    model: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 80,
      messages: [
        {
          role: 'system',
          content: `Sos la recepcionista de ${orgName}. Bilingüe español/inglés. Detectá el idioma del cliente y respondé siempre en ese idioma.

REGLAS ESTRICTAS:
- Respuestas MUY cortas, una oración por turno
- Una pregunta por turno, nunca dos
- NUNCA repitas datos que el cliente ya confirmó
- NUNCA vuelvas a pedir datos que ya tenés
- Si el cliente dicta teléfono, conservá todos los dígitos exactos, incluidos ceros, y confirmalo en grupos antes de avanzar
- Si dice que el teléfono está mal, borrá el número entero, pedilo de nuevo desde el principio y no digas "Perfecto" hasta que confirme

FLUJO OBLIGATORIO (en este orden):
1. Saludo (ya hecho en el primer mensaje)
2. Pedí NOMBRE Y APELLIDO — ambas partes son obligatorias. Si solo dan el nombre, pedí el apellido antes de continuar.
3. Pedí teléfono si no tenés Caller ID. Confirmalo como 813-370-4657 o 8-1-3, 3-7-0, 4-6-5-7 y esperá confirmación explícita.
4. Pedí email (una sola vez)
5. Preguntá por el trabajo a cotizar: tipo de impresión o servicio, tamaño, cantidad y cuándo lo necesita. Una pregunta por turno.
6. Confirmá los datos en una oración: "Entonces: [nombre completo], [email/teléfono], necesitás [resumen del trabajo]. ¿Correcto?"
7. Solo después de que el cliente confirme → llamá save_lead_info
8. Si save_lead_info retorna ok:true → decí "Perfecto [nombre], quedó registrado, te contactamos pronto." y despedite
9. Si save_lead_info retorna ok:false → preguntá exactamente lo que dice primary_message_for_caller, luego volvé a llamar save_lead_info con los datos completos

CRÍTICO para save_lead_info:
- full_name DEBE tener nombre Y apellido (mínimo 2 palabras). Si solo tenés el primer nombre, NO llames al tool aún.
- phone dictado DEBE estar confirmado por el cliente. Si corrigió el número, no uses el anterior.
- need debe describir el trabajo con suficiente detalle (tipo + descripción breve)
- Usá notes para detalles: tamaño, cantidad, material, plazo requerido
- En inglés, hablá natural: "What is your name?" y "What is the company name?". Nunca agregues fragmentos como "I'm" o "The company".`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'save_lead_info',
            description: 'Guarda los datos del cliente interesado en los servicios de la empresa',
            parameters: {
              type: 'object',
              properties: {
                full_name: {
                  type: 'string',
                  description: 'Nombre y apellido completo del cliente (obligatorio: mínimo 2 palabras)',
                },
                phone: {
                  type: 'string',
                  description: 'Número de teléfono del cliente, solo si fue confirmado cuando el cliente lo dictó o corrigió',
                },
                email: {
                  type: 'string',
                  description: 'Email del cliente',
                },
                need: {
                  type: 'string',
                  description: 'Tipo de trabajo a cotizar (ej: "500 tarjetas personales" o "banner vinílico 2x1m")',
                },
                notes: {
                  type: 'string',
                  description: 'Detalles del trabajo: tamaño, cantidad, material, plazo de entrega requerido',
                },
                date_needed: {
                  type: 'string',
                  description: 'Fecha aproximada en que necesita el trabajo (si la mencionó)',
                },
              },
              required: ['full_name', 'need'],
            },
          },
        },
      ],
    },
    voice: { provider: voiceRes.voiceProvider, voiceId: voiceRes.voiceId },
    transcriber: enhanceTranscriberForLowLatency({
      provider: trCfg.provider,
      model: trCfg.model,
      language: trCfg.language,
    }),
    ...buildVapiAssistantCallBehavior(),
  }
}

async function handleAssistantRequest(request: NextRequest, flat: JsonRecord, rawBody: JsonRecord) {
  const supabase = createServiceRoleClient()
  const orgRes = await resolveOrganizationIdForVapiTools({
    args: {},
    flat,
    rawBody,
    request,
    toolCallId: 'assistant-request',
    logPrefix: '[vapi:webhook]',
  })
  const orgId = orgRes.organizationId
  const phoneRes = resolvePhoneForVapiTool({
    args: {},
    flat,
    rawBody,
    toolCallId: 'assistant-request',
    tool: 'assistant_request',
    allowDemoFallback: false,
    logPrefix: '[vapi:webhook]',
  })
  const phoneRaw = phoneRes.phone || getCallerPhoneFromPayload(flat)

  // Resolución del nombre de la org (para usar en el system prompt dinámico)
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

  let runtimeWelcome: string | null = null
  if (orgId) {
    try {
      const runtime = await getOrganizationRuntimeConfig(orgId)
      const w = (runtime.welcomeMessage || '').trim()
      if (w) {
        runtimeWelcome = resolveWelcomeMessageForCall(
          w,
          defaultWelcomeForOrganization(runtime.organizationDisplayName),
        )
      }
    } catch (e) {
      console.warn('[vapi:webhook] runtime welcome read skipped', e)
    }
  }

  if (!phoneRaw?.trim()) {
    console.warn('[vapi:webhook] assistant-request: missing caller phone')
    const trCfg = getTranscriberConfigForVapi()
    const voiceRes =
      orgId && orgId.trim()
        ? await resolveOpenAiVoiceForOrganization(orgId)
        : resolveOpenAiVoiceForSync({
            organizationId: '',
            assistantConfigVoiceId: null,
            organizationAiVoiceId: null,
          })
    return NextResponse.json({
      assistant: defaultTransientAssistant(
        runtimeWelcome ||
          resolveWelcomeMessageForCall(null, `Buen día, ${orgName}, ¿en qué le puedo ayudar?`),
        voiceRes,
        trCfg,
        orgName,
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

  const identity =
    orgId && normalizedPhone
      ? await resolveTrustedCallerFirstName({
          organizationId: orgId,
          phone: normalizedPhone,
        })
      : { firstName: null, source: 'none' as const }

  let firstMessage: string
  if (runtimeWelcome) {
    firstMessage = runtimeWelcome
  } else if (identity.firstName) {
    const personalized = `Buen día ${identity.firstName}, gracias por comunicarte con ${orgName}.`
    if (!payload.found) {
      firstMessage = `${personalized} ¿En qué podemos ayudarte hoy?`
    } else if (!payload.job) {
      firstMessage = `${personalized} ¿En qué podemos ayudarte hoy? No encontramos trabajos activos en este momento.`
    } else {
      firstMessage = `${personalized} ${spokenJobLineFromStatusPayload(payload.job)}`
    }
  } else if (!payload.found) {
    firstMessage = `Buen día, ${orgName}, ¿en qué le puedo ayudar?`
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
    orgName,
    client_welcome_set: Boolean(runtimeWelcome),
    welcome_preview: firstMessage.slice(0, 80),
    personalized: Boolean(identity.firstName) && !runtimeWelcome,
    personalized_source: identity.source,
    personalized_name: identity.firstName,
    normalized_phone_suffix: normalizedPhone.length >= 4 ? normalizedPhone.slice(-4) : null,
    found: payload.found,
    hasJob: !!payload.found && !!payload.job,
  })

  const trCfg = getTranscriberConfigForVapi()
  const voiceRes =
    orgId && orgId.trim()
      ? await resolveOpenAiVoiceForOrganization(orgId)
      : resolveOpenAiVoiceForSync({
          organizationId: '',
          assistantConfigVoiceId: null,
          organizationAiVoiceId: null,
        })
  console.log('[vapi:webhook] assistant-request voice', {
    organization_id: orgId || null,
    voice_id: voiceRes.voiceId,
    voice_source: voiceRes.source,
    transcriber_language: trCfg.language,
  })

  // FIX: se pasa orgName para que el system prompt sea dinámico por cliente
  return NextResponse.json({
    assistant: defaultTransientAssistant(firstMessage, voiceRes, trCfg, orgName),
  })
}

async function handleToolCalls(request: NextRequest, flat: JsonRecord, rawBody: JsonRecord) {
  const requestUrl = request.url
  const list = Array.isArray(flat.toolCallList)
    ? flat.toolCallList
    : Array.isArray(flat.toolCalls)
      ? flat.toolCalls
      : null
  if (!list) {
    return NextResponse.json({ results: [] })
  }

  const supabase = createServiceRoleClient()

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

      logVapiToolCallReceived({
        requestUrl,
        toolCallId,
        toolName: name,
        argKeys: Object.keys(args),
        source: 'webhook',
      })

      const orgRes = await resolveOrganizationIdForVapiTools({
        args,
        flat,
        rawBody,
        request,
        toolCallId,
        logPrefix: '[vapi:webhook]',
      })
      const orgId = orgRes.organizationId
      const phoneRes = resolvePhoneForVapiTool({
        args,
        flat,
        rawBody,
        toolCallId,
        tool: name || 'tool',
        allowDemoFallback: false,
        logPrefix: '[vapi:webhook]',
      })
      const phoneRaw = phoneRes.phone

      console.log('[vapi/tool-call]', {
        callId: getCallIdFromPayload(flat) || null,
        toolName: name,
        toolCallId: toolCallId || null,
        organization_id: orgId || null,
        argKeys: Object.keys(args).slice(0, 32),
      })

      let result = '{}'
      if (name === 'get_client_status' && phoneRaw && orgId) {
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
        console.info(`[vapi/tool-call] ${name}`, {
          organization_id: orgId,
          toolCallId,
          query_preview: serviceName.slice(0, 120),
        })
        const out = serviceName.trim()
          ? await runGetPriceQuote({
              organizationId: orgId,
              serviceName,
              logContext: {
                toolCallId: getCallIdFromPayload(flat) || null,
                toolName: name,
              },
            })
          : { error: 'missing_required_fields', fields: ['product_name'] }
        result = JSON.stringify(out)
      } else if (name === 'save_lead_info') {
        const logBase = {
          endpoint: '/api/vapi/webhook',
          toolCallId,
          organization_id_final: orgId,
          org_source: orgRes.orgSource,
          phone_source: phoneRes.phoneSource,
          args_keys: Object.keys(args).slice(0, 32),
          assistant_id_detected: orgRes.assistantIdDetected,
        }
        if (!orgId) {
          const missingFields = ['organization_id']
          console.warn('[vapi:webhook] save_lead_info_blocked', {
            ...logBase,
            missing_fields: missingFields,
          })
          result = JSON.stringify({
            ok: false,
            error: 'missing_required_fields',
            missing_fields: missingFields,
            primary_message_for_caller: 'Me falta un dato para registrar tu solicitud.',
          })
        } else if (!phoneRaw) {
          const missingFields = ['phone']
          console.warn('[vapi:webhook] save_lead_info_blocked', {
            ...logBase,
            missing_fields: missingFields,
          })
          result = JSON.stringify({
            ok: false,
            error: 'missing_required_fields',
            missing_fields: missingFields,
            primary_message_for_caller: 'Me falta un dato para registrar tu solicitud.',
          })
        } else {
          const out = await executeToolHandler('save_lead_info', args, {
            organizationId: orgId,
            phone: phoneRaw,
            vapiCallId: getCallIdFromPayload(flat) || '',
            toolCallId: toolCallId || null,
            transcript: getTranscriptFromPayload(flat) || null,
            callSummary: getSummaryFromPayload(flat) || null,
          })
          if (out && typeof out === 'object' && 'ok' in out && out.ok === true) {
            console.log('[vapi:webhook] save_lead_info persisted', {
              organizationId: orgId,
              phone_suffix: normalizePhone(phoneRaw).slice(-4),
              saved: (out as { saved?: boolean }).saved,
              has_name: Boolean((out as { customer?: { name?: string | null } }).customer?.name),
            })
          } else {
            console.warn('[vapi:webhook] save_lead_info_result', {
              ...logBase,
              outcome: out,
            })
          }
          result = JSON.stringify(out)
        }
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
        console.info('[vapi/tool-call] create_follow_up', {
          organization_id: orgId,
          toolCallId,
          title_preview: title.slice(0, 120),
          callback_required: Boolean(args.callback_required),
        })
        if (!title) {
          result = JSON.stringify({ error: 'missing_required_fields', fields: ['title'] })
        } else {
          const prep = prepareCommercialFollowUpFromArgs(args)
          let callLogId =
            typeof args.call_log_id === 'string' && args.call_log_id.trim()
              ? args.call_log_id.trim()
              : undefined
          let savedLink:
            | {
                callLogId: string | null
                customerId: string | null
                leadId: string | null
                customerName: string | null
              }
            | null = null
          const vapiCid = getCallIdFromPayload(flat) || ''
          if (!callLogId && vapiCid) {
            savedLink = await getCallLogLeadCustomerContext({
              organizationId: orgId,
              vapiCallId: vapiCid,
            })
            callLogId = savedLink.callLogId || undefined
          }
          if (!savedLink && vapiCid) {
            savedLink = await getCallLogLeadCustomerContext({
              organizationId: orgId,
              vapiCallId: vapiCid,
            })
          }
          const out = await runCreateFollowUp({
            organizationId: orgId,
            phone: phoneRaw || (typeof args.phone === 'string' ? args.phone : undefined),
            customerId:
              savedLink?.customerId ||
              (typeof args.customer_id === 'string' ? args.customer_id : undefined),
            leadId: savedLink?.leadId || undefined,
            callLogId,
            title: prep.title,
            notes: prep.notesMerged,
            owner: typeof args.owner === 'string' ? args.owner : undefined,
            dueAt: prep.dueAt,
            priority: prep.priority,
            callbackRequired: prep.callbackRequired,
          })
          console.info('[vapi/follow-up]', {
            toolCallId: toolCallId || null,
            callId: getCallIdFromPayload(flat) || null,
            organization_id: orgId,
            title: prep.title.slice(0, 120),
            category: prep.category,
            priority: prep.priority ?? null,
            due_at: prep.dueAt ?? null,
            callback_required: prep.callbackRequired,
            created: true,
            followUpId: (out as { follow_up?: { id?: string } }).follow_up?.id ?? null,
            table: 'follow_ups',
            error: null,
          })
          result = JSON.stringify(out)
        }
      }

      if (
        result === '{}' &&
        (name === 'get_job_status' || name === 'get_client_status')
      ) {
        const missing_fields = [
          ...(!orgId ? (['organization_id'] as const) : []),
          ...(!phoneRaw ? (['phone'] as const) : []),
        ]
        if (missing_fields.length) {
          console.warn('[vapi:webhook] tool_missing_context', {
            name,
            toolCallId,
            missing_fields,
            org_source: orgRes.orgSource,
            phone_source: phoneRes.phoneSource,
          })
          result = JSON.stringify({
            ok: false,
            error: 'missing_required_fields',
            missing_fields,
            primary_message_for_caller: 'Me falta un dato para registrar tu solicitud.',
          })
        }
      }

      if (result === '{}' && name) {
        console.warn('[vapi:webhook] unknown_tool_unhandled', { toolCallId, toolName: name })
        result = JSON.stringify({ ok: false, error: 'unknown_tool', toolName: name })
      }

      return { toolCallId, name: name || 'unknown', result }
    }),
  )

  return NextResponse.json({ results })
}

export async function POST(request: NextRequest) {
  try {
    const rawSecret = process.env.VAPI_WEBHOOK_SECRET?.trim()
    if (rawSecret) {
      const headerSecret = (
        request.headers.get('x-vapi-secret') ||
        request.headers.get('X-Vapi-Secret') ||
        ''
      ).trim()
      if (!timingSafeEqualUtf8(headerSecret, rawSecret)) {
        console.warn('[vapi:webhook] Invalid or missing webhook secret header')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = (await request.json()) as JsonRecord
    const flat = flattenVapiBody(body)
    const eventType = typeof flat.type === 'string' ? flat.type : null

    if (eventType === 'assistant-request') {
      return handleAssistantRequest(request, flat, body)
    }

    if (eventType === 'tool-calls') {
      return handleToolCalls(request, flat, body)
    }

    if (
      eventType === 'call-ended' ||
      eventType === 'end-of-call-report' ||
      eventType === 'hang' ||
      eventType === 'hang-up'
    ) {
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
