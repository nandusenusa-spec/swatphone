import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import { executeToolHandler } from '@/lib/vapi/tool-handlers'
import { persistCallArtifacts, persistSpamRejection } from '@/lib/vapi/persistence'
import { openAiVoiceIdForLlmPipeline } from '@/lib/vapi/openai-voice-for-pipeline'
import { shouldRejectByValidation } from '@/lib/voice-platform/service'
import {
  isWarmTransferFailureEndedReason,
  onStatusUpdate,
  onTransferUpdate,
  onWarmTransferFailureFollowUp,
} from '@/lib/vapi/transfer-lifecycle'
import { buildDynamicWarmTransferDestination } from '@/lib/vapi/operator-handoff'
import {
  buildPrepareWarmTransferServerTool,
  buildWarmTransferCallTool,
} from '@/lib/vapi/warm-transfer-tool'
import {
  getCallerPhoneFromPayload,
  getSummaryFromPayload,
  getTranscriptFromPayload,
} from '@/lib/vapi/payload'
import { resolveTrustedCallerFirstName } from '@/lib/voice-platform/caller-identity'
import { screenInboundAssistantRequest } from '@/lib/vapi/phone-screening'
import { textSuggestsPromisedCallback } from '@/lib/voice-platform/callback-heuristic'
import { normalizePhone } from '@/lib/phone'
import { logVapiToolCallReceived } from '@/lib/vapi/tool-call-logging'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function str(obj: JsonRecord, key: string): string {
  const v = obj[key]
  return typeof v === 'string' ? v : ''
}

function prepareWarmTransferFailureCode(out: unknown): string | null {
  if (!out || typeof out !== 'object') return null
  const o = out as Record<string, unknown>
  if (typeof o.error !== 'string') return null
  if (o.error === 'missing_required_fields' && Array.isArray(o.fields)) {
    return `missing_required_fields:${(o.fields as string[]).join('+')}`
  }
  return o.error
}

function flattenEvent(body: JsonRecord): JsonRecord {
  const msg = asRecord(body.message)
  return { ...body, ...msg, call: msg.call || body.call }
}

function getToolCalls(payload: JsonRecord): JsonRecord[] {
  if (Array.isArray(payload.toolCallList)) return payload.toolCallList as JsonRecord[]
  if (Array.isArray(payload.toolCalls)) return payload.toolCalls as JsonRecord[]
  return []
}

function parseToolName(toolCall: JsonRecord): string {
  const fn = asRecord(toolCall.function)
  return str(fn, 'name') || str(toolCall, 'name') || str(toolCall, 'toolName')
}

function parseToolArgs(toolCall: JsonRecord): JsonRecord {
  const fn = asRecord(toolCall.function)
  const raw = fn.arguments ?? toolCall.arguments
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as JsonRecord
    } catch {
      return {}
    }
  }
  return raw && typeof raw === 'object' ? (raw as JsonRecord) : {}
}

function getCallId(payload: JsonRecord): string {
  const call = asRecord(payload.call)
  const artifact = asRecord(payload.artifact)
  return (
    str(call, 'id') ||
    str(payload, 'callId') ||
    str(payload, 'call_id') ||
    str(payload, 'id') ||
    str(artifact, 'callId')
  )
}

function getPhone(payload: JsonRecord): string {
  const call = asRecord(payload.call)
  return (
    str(call, 'customerPhoneNumber') ||
    str(call, 'phoneNumber') ||
    str(payload, 'phone') ||
    str(payload, 'customer_phone')
  )
}

function getCustomerName(payload: JsonRecord): string {
  const call = asRecord(payload.call)
  return str(payload, 'customer_name') || str(call, 'customerName')
}

function endedEvent(type: string): boolean {
  return (
    type === 'call-ended' ||
    type === 'end-of-call-report' ||
    type === 'call.ended' ||
    type === 'conversation.ended'
  )
}

function endedReasonFromPayload(payload: JsonRecord): string {
  return str(payload, 'endedReason') || str(asRecord(payload.call), 'endedReason')
}

function conciseDynamicGreeting(raw: string): string {
  const t = (raw || '').trim()
  if (t && t.length <= 90) return t
  return 'Hello, this is SWATWORKS. How can I help?'
}

export async function dispatchVapiEvent(input: {
  body: JsonRecord
  organizationId: string
  /** URL completa del POST (p. ej. request.url) para logs en Vercel */
  requestUrl?: string | null
}) {
  const payload = flattenEvent(input.body)
  const type = str(payload, 'type')
  console.log('[vapi/dispatcher] event', {
    organization_id: input.organizationId,
    message_type: type || 'unknown',
    call_id: getCallId(payload) || null,
  })
  const runtime = await getOrganizationRuntimeConfig(input.organizationId)

  const vapiCallId = getCallId(payload)
  const phoneFromNested = getPhone(payload)
  const phoneFromCallerPayload = getCallerPhoneFromPayload(payload)
  const phoneFromRawBody = getCallerPhoneFromPayload(input.body)
  const phone =
    phoneFromNested || phoneFromCallerPayload || phoneFromRawBody || ''
  const phoneTrace = {
    from_getPhone: Boolean(phoneFromNested),
    from_getCallerPhone_payload: Boolean(phoneFromCallerPayload),
    from_getCallerPhone_raw_body: Boolean(phoneFromRawBody),
  }
  const customerName = getCustomerName(payload)
  const transcript =
    getTranscriptFromPayload(payload) ||
    getTranscriptFromPayload(input.body) ||
    str(payload, 'transcript')
  const summary =
    getSummaryFromPayload(payload) ||
    getSummaryFromPayload(input.body) ||
    str(payload, 'summary')
  const disposition = str(payload, 'disposition')

  let resolvedPhone = phone
  let phoneFromCallLogs = false
  if (!resolvedPhone && vapiCallId) {
    const supabase = createServiceRoleClient()
    const { data: rows, error: callLogPhoneErr } = await supabase
      .from('call_logs')
      .select('phone')
      .eq('organization_id', input.organizationId)
      .eq('vapi_call_id', vapiCallId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (callLogPhoneErr) {
      console.warn('[vapi/dispatcher] call_logs phone fallback query error', {
        organization_id: input.organizationId,
        call_id: vapiCallId || null,
        message: callLogPhoneErr.message,
      })
    }
    const row = rows?.[0]
    const existing = typeof row?.phone === 'string' ? row.phone.trim() : ''
    if (existing) {
      resolvedPhone = existing
      phoneFromCallLogs = true
    }
  }

  if (type === 'assistant-request') {
    console.log('[vapi/dispatcher] assistant-request', {
      organization_id: input.organizationId,
      call_id: vapiCallId || null,
    })

    if (resolvedPhone.trim()) {
      const screened = await screenInboundAssistantRequest({
        organizationId: input.organizationId,
        phoneRaw: resolvedPhone,
        spamThreshold: runtime.spamPolicy.threshold,
      })
      if (!screened.allow) {
        console.log('[vapi/dispatcher] assistant-request rejected by phone screening', {
          organization_id: input.organizationId,
          call_id: vapiCallId || null,
        })
        return { error: screened.error }
      }
    }

    const holdUrl = process.env.VAPI_TRANSFER_HOLD_AUDIO_URL
    const warmTool = buildWarmTransferCallTool(
      runtime,
      holdUrl ? { holdAudioUrl: holdUrl } : undefined,
    )
    const prepareTool = buildPrepareWarmTransferServerTool(input.organizationId)
    const model: Record<string, unknown> = {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'system', content: runtime.prompt }],
    }
    const tools: Record<string, unknown>[] = []
    if (prepareTool) tools.push(prepareTool)
    if (warmTool) tools.push(warmTool)
    if (tools.length) model.tools = tools

    let firstMessage = conciseDynamicGreeting(runtime.welcomeMessage)
    let greetingSource: 'customer' | 'call_log' | 'none' = 'none'
    let greetingName: string | null = null
    if (resolvedPhone) {
      const identity = await resolveTrustedCallerFirstName({
        organizationId: input.organizationId,
        phone: resolvedPhone,
      })
      greetingSource = identity.source
      greetingName = identity.firstName
      if (identity.firstName) {
        firstMessage = `Buen día ${identity.firstName}, gracias por comunicarte con ${runtime.organizationDisplayName}. ¿En qué podemos ayudarte hoy?`
      }
    }
    console.log('[vapi/dispatcher] assistant-request greeting', {
      organization_id: input.organizationId,
      call_id: vapiCallId || null,
      has_resolved_phone: Boolean(resolvedPhone),
      resolved_phone_suffix: resolvedPhone.length >= 4 ? resolvedPhone.slice(-4) : null,
      personalized: Boolean(greetingName),
      greeting_source: greetingSource,
      greeting_name: greetingName,
    })

    return {
      assistant: {
        firstMessage,
        model,
        voice: { provider: 'openai', voiceId: openAiVoiceIdForLlmPipeline(null, 'nova') },
        transcriber: { provider: 'deepgram', model: 'nova-2', language: 'es' },
      },
    }
  }

  if (type === 'status-update') {
    const st = str(payload, 'status')
    if (vapiCallId) {
      await onStatusUpdate({
        organizationId: input.organizationId,
        vapiCallId,
        status: st,
        phone: resolvedPhone || undefined,
      })
    }
    return { ok: true, event_type: 'status-update', status: st }
  }

  if (type === 'transfer-update') {
    const dest = asRecord(payload.destination)
    const destNum = str(dest, 'number') || str(dest, 'phoneNumber') || ''
    console.log('[vapi/dispatcher] transfer-update', {
      organization_id: input.organizationId,
      call_id: vapiCallId || null,
      has_destination_number: Boolean(destNum),
      number_suffix: destNum.length >= 4 ? destNum.slice(-4) : null,
    })
    if (vapiCallId) {
      await onTransferUpdate({
        organizationId: input.organizationId,
        vapiCallId,
        destination: dest,
      })
    }
    return { ok: true, event_type: 'transfer-update' }
  }

  if (type === 'transfer-destination-request') {
    console.log('[vapi/dispatcher] transfer-destination-request', {
      organization_id: input.organizationId,
      call_id: vapiCallId || null,
      caller_phone: resolvedPhone ? '[redacted]' : null,
      caller_phone_value: resolvedPhone || null,
      raw_payload: payload,
    })
    const dynamic = await buildDynamicWarmTransferDestination({
      organizationId: input.organizationId,
      vapiCallId,
      callerPhone: resolvedPhone || undefined,
    })
    if (dynamic) {
      const destination = asRecord(asRecord(dynamic).destination)
      const finalNumber = str(destination, 'number')
      console.log('[vapi/dispatcher] transfer-destination-request response', {
        source: 'dynamic_warm_transfer',
        has_destination: Boolean(asRecord(dynamic).destination),
        final_number: finalNumber || null,
        is_e164: /^\+[1-9]\d{7,14}$/.test(finalNumber || ''),
        response_payload: dynamic,
      })
      return dynamic
    }

    console.warn('[vapi/dispatcher] transfer-destination-request dynamic_warm_transfer returned null, using legacy fallback', {
      organization_id: input.organizationId,
      call_id: vapiCallId || null,
    })

    const number =
      runtime.transferPolicy.urgentTransferNumber ||
      runtime.transferPolicy.ramonTransferNumber ||
      runtime.transferPolicy.defaultTransferNumber ||
      null
    console.log('[vapi/dispatcher] transfer-destination-request fallback number', {
      has_number: Boolean(number),
      final_number: number,
      is_e164: /^\+[1-9]\d{7,14}$/.test(number || ''),
    })
    if (!number) {
      console.error('[vapi/dispatcher] transfer-destination-request NO_VALID_E164_FALLBACK', {
        organization_id: input.organizationId,
        call_id: vapiCallId || null,
        listed_destinations_count: runtime.transferPolicy.transferDestinations?.length ?? 0,
      })
    }
    return {
      destination: {
        type: 'number',
        number,
        description: runtime.transferPolicy.callbackDefaultOwner || 'Ramon',
      },
    }
  }

  if (type === 'tool-calls') {
    const calls = getToolCalls(payload)
    const toolNames = calls.map((tc) => parseToolName(tc)).filter(Boolean)
    /** Siempre permitidas: si no, allowed_tools en DB puede bloquear transfer aunque Vapi tenga la tool. */
    const transferToolsAlwaysOn = new Set([
      'prepare_warm_transfer',
      'transfer_to_ramon',
      'get_price_quote',
      'get_product_price',
      'get_job_status',
      'save_lead_info',
      'create_follow_up',
    ])
    console.log('[vapi/dispatcher] tool-calls', {
      organization_id: input.organizationId,
      call_id: vapiCallId || null,
      count: calls.length,
      names: toolNames,
    })
    if (toolNames.includes('prepare_warm_transfer')) {
      console.log('[vapi/dispatcher] prepare_warm_transfer phone + call id trace', {
        organization_id: input.organizationId,
        vapi_call_id: vapiCallId || null,
        vapi_call_id_missing: !vapiCallId,
        phone_trace: phoneTrace,
        resolved_phone_suffix: resolvedPhone.length >= 4 ? resolvedPhone.slice(-4) : null,
        resolved_phone_empty: !resolvedPhone,
        resolved_via_call_logs: phoneFromCallLogs,
      })
    }
    const results = await Promise.all(
      calls.map(async (tc) => {
        const toolCallId = str(tc, 'toolCallId') || str(tc, 'id')
        const name = parseToolName(tc)
        const args = parseToolArgs(tc)
        logVapiToolCallReceived({
          requestUrl: input.requestUrl,
          toolCallId,
          toolName: name,
          argKeys: Object.keys(args),
          source: 'dispatcher',
        })
        const allowed =
          transferToolsAlwaysOn.has(name) || runtime.toolsEnabled.includes(name)
        if (!allowed) {
          console.warn('[vapi/dispatcher] tool-calls blocked', {
            name,
            toolCallId: toolCallId || null,
          })
          return {
            toolCallId,
            name,
            result: JSON.stringify({
              ok: false,
              error: 'tool_disabled_for_org',
              toolName: name,
            }),
          }
        }
        const argPhoneNorm =
          typeof args.phone === 'string' && args.phone.trim()
            ? normalizePhone(args.phone)
            : ''
        const webhookPhoneNorm = resolvedPhone.trim() ? normalizePhone(resolvedPhone) || resolvedPhone.trim() : ''
        const phoneForToolContext = (webhookPhoneNorm || argPhoneNorm || '').trim() || resolvedPhone
        try {
          const out = await executeToolHandler(name, args, {
            organizationId: input.organizationId,
            phone: phoneForToolContext,
            vapiCallId,
            toolCallId: toolCallId || null,
          })
          const failed =
            out &&
            typeof out === 'object' &&
            'error' in out &&
            Boolean((out as { error?: string }).error)
          const ok = !failed
          const baseLog = {
            name,
            toolCallId: toolCallId || null,
            ok,
          }
          if (name === 'prepare_warm_transfer') {
            const rawArgsPhone = typeof args.phone === 'string' ? args.phone : ''
            const normalizedFromArgs =
              rawArgsPhone.trim() && rawArgsPhone !== resolvedPhone ? '[differs_from_webhook]' : null
            const redactedArgs = {
              customer_name: typeof args.customer_name === 'string' ? '[set]' : undefined,
              order_number: typeof args.order_number === 'string' ? '[set]' : undefined,
              intent: typeof args.intent === 'string' ? args.intent.slice(0, 200) : undefined,
              short_summary: typeof args.short_summary === 'string' ? '[set]' : undefined,
              transfer_extension: typeof args.transfer_extension === 'string' ? args.transfer_extension : undefined,
              transfer_department: typeof args.transfer_department === 'string' ? args.transfer_department : undefined,
              phone_in_args: Boolean(args.phone),
              args_phone_suffix: rawArgsPhone.length >= 4 ? rawArgsPhone.slice(-4) : null,
              args_vs_webhook_phone: normalizedFromArgs,
            }
            console.log('[vapi/dispatcher] tool-calls result', {
              ...baseLog,
              prepare_failure_code: failed ? prepareWarmTransferFailureCode(out) : null,
              prepare_context: {
                vapi_call_id: vapiCallId || null,
                webhook_caller_phone_present: Boolean(resolvedPhone),
                webhook_caller_phone_suffix:
                  resolvedPhone.length >= 4 ? resolvedPhone.slice(-4) : null,
                phone_trace: phoneTrace,
                resolved_via_call_logs: phoneFromCallLogs,
              },
              prepare_args: redactedArgs,
              prepare_failure: failed ? (out as Record<string, unknown>) : undefined,
            })
          } else if (name === 'save_lead_info') {
            const phoneSource = webhookPhoneNorm
              ? 'payload'
              : argPhoneNorm
                ? 'args'
                : 'missing'
            console.log('[vapi/dispatcher] tool-calls result', {
              ...baseLog,
              endpoint: '/api/voice/events',
              organization_id: input.organizationId,
              phone_source: phoneSource,
              args_keys: Object.keys(args).slice(0, 24),
              missing_fields:
                failed && out && typeof out === 'object' && 'missing_fields' in out
                  ? (out as { missing_fields?: unknown }).missing_fields
                  : undefined,
              ...(failed ? { failure: out as Record<string, unknown> } : {}),
            })
          } else {
            console.log('[vapi/dispatcher] tool-calls result', {
              ...baseLog,
              ...(failed ? { failure: out as Record<string, unknown> } : {}),
            })
          }
          return { toolCallId, name, result: JSON.stringify(out) }
        } catch (err) {
          console.error('[vapi/dispatcher] tool-calls handler error', {
            name,
            toolCallId: toolCallId || null,
            error: err instanceof Error ? err.message : String(err),
          })
          return {
            toolCallId,
            name,
            result: JSON.stringify({
              error: 'tool_handler_failed',
              message: err instanceof Error ? err.message : String(err),
            }),
          }
        }
      }),
    )
    return { results }
  }

  if (!resolvedPhone) return { ok: true, skipped: true, reason: 'missing_phone' }

  const validation = shouldRejectByValidation({
    name: customerName,
    phone: resolvedPhone,
    reason: `${summary} ${transcript}`.trim(),
    jobNumber: str(payload, 'job_number') || str(payload, 'order_number'),
    attempts: Number(payload.attempts || 0) || runtime.spamPolicy.maxFailedAttempts - 1,
  })

  if (validation.reject) {
    const spam = await persistSpamRejection({
      organizationId: input.organizationId,
      vapiCallId,
      phone: resolvedPhone,
      reason: 'Failed validation policy',
      spamScore: runtime.spamPolicy.threshold + 10,
    })
    return { ok: true, rejected: true, spam }
  }

  const extractionFromPayload = asRecord(payload.structured_extraction)

  const ended = endedEvent(type)
  const er = endedReasonFromPayload(payload)

  if (ended && er) {
    console.log('[vapi/dispatcher] call-ended', {
      organization_id: input.organizationId,
      call_id: vapiCallId || null,
      ended_reason: er,
      warm_transfer_failure: isWarmTransferFailureEndedReason(er),
    })
  }

  const extractionCallback =
    extractionFromPayload.callback_required === true ||
    extractionFromPayload.follow_up_required === true
  const narrative = `${summary || ''} ${transcript || ''}`.trim()
  const heuristicCallback =
    ended && narrative.length >= 16 && textSuggestsPromisedCallback(narrative)

  const persisted = await persistCallArtifacts({
    organizationId: input.organizationId,
    vapiCallId,
    phone: resolvedPhone,
    customerName: customerName || undefined,
    transcript: transcript || undefined,
    summary: summary || undefined,
    intent: str(payload, 'intent') || undefined,
    outcome: disposition || (ended ? er || 'resolved' : undefined),
    nextAction: ended ? 'Review call in dashboard' : 'Call in progress',
    callbackRequired: extractionCallback || heuristicCallback,
    followUpDate: undefined,
    spamScore: undefined,
    ended,
    structuredExtractionFromEvent:
      Object.keys(extractionFromPayload).length > 0 ? extractionFromPayload : undefined,
  })

  let followUpAfterFailedTransfer = false
  if (ended && er && vapiCallId) {
    const fu = await onWarmTransferFailureFollowUp({
      organizationId: input.organizationId,
      vapiCallId,
      phone: resolvedPhone,
      endedReason: er,
    })
    followUpAfterFailedTransfer = fu.follow_up_created
  }

  return {
    ok: true,
    event_type: type || 'unknown',
    call_log_id: persisted.call_log_id,
    classification: persisted.classification,
    ended_reason: er || undefined,
    follow_up_after_failed_transfer: followUpAfterFailedTransfer,
  }
}
