import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import { executeToolHandler } from '@/lib/vapi/tool-handlers'
import { persistCallArtifacts, persistSpamRejection } from '@/lib/vapi/persistence'
import { getTranscriberConfigForVapi, resolveOpenAiVoiceForOrganization } from '@/lib/vapi/voice-for-vapi'
import {
  runCreateFollowUp,
  runSaveLeadInfo,
  shouldRejectByValidation,
  type QuoteContext,
} from '@/lib/voice-platform/service'
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
  buildTranscriptFromMessages,
  getAnalysisObjectFromPayload,
  getCallTimestampsFromPayload,
  getCallerPhoneFromPayload,
  getCostFromPayload,
  getDurationSecondsFromPayload,
  getEndedReasonFromPayload,
  getMessagesFromPayload,
  getRecordingUrlFromPayload,
  getSentimentFromPayload,
  getSummaryFromPayload,
  getTopicFromPayload,
  getTranscriptFromPayload,
  getCallIdFromPayload,
  getVapiMessageTypeFromPayload,
  mergeVapiWebhookBodiesForExtraction,
} from '@/lib/vapi/payload'
import { flattenVapiServerEvent } from '@/lib/vapi/vapi-event-flatten'
import { unknownCallerPlaceholderE164 } from '@/lib/vapi/vapi-unknown-caller'
import { resolveTrustedCallerFirstName } from '@/lib/voice-platform/caller-identity'
import { screenInboundAssistantRequest } from '@/lib/vapi/phone-screening'
import { textSuggestsPromisedCallback } from '@/lib/voice-platform/callback-heuristic'
import { normalizePhone } from '@/lib/phone'
import { logVapiToolCallReceived } from '@/lib/vapi/tool-call-logging'
import type { StructuredExtraction } from '@/lib/voice-platform/types'
import {
  getVapiCallIdempotencyFlags,
  mergeCallLogStructuredByVapiCallId,
  patchCallLogLeadCustomer,
  upsertCallLog,
} from '@/lib/voice-platform/repository'

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
  return flattenVapiServerEvent(body)
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

function latestUserTextFromMessages(messages: unknown[] | null | undefined): string {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const rec = asRecord(messages[i])
    const role = str(rec, 'role').toLowerCase()
    const type = str(rec, 'type').toLowerCase()
    const text =
      str(rec, 'content') ||
      str(rec, 'message') ||
      str(rec, 'text') ||
      str(rec, 'transcript')
    const isUser =
      role === 'user' ||
      role === 'customer' ||
      role === 'caller' ||
      type === 'user' ||
      type === 'customer' ||
      type === 'caller'
    if (isUser && text.trim()) return text.trim()
  }
  return ''
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
    type === 'conversation.ended' ||
    type === 'hang' ||
    type === 'hang-up'
  )
}

function stripAccentsForMatch(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

function transcriptUserLines(transcript: string): string[] {
  return transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(User|Caller|Customer|Cliente|Usuario)\s*:\s*/i, '').trim())
    .filter(Boolean)
}

type TranscriptLine = { speaker: 'assistant' | 'user' | 'unknown'; text: string }

function parseTranscriptLines(transcript: string): TranscriptLine[] {
  return (transcript || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(Assistant|Bot|Agente|Asistente|User|Caller|Customer|Cliente|Usuario)\s*:\s*(.+)$/i)
      if (!match) return { speaker: 'unknown' as const, text: line }
      const rawSpeaker = match[1].toLowerCase()
      return {
        speaker: /assistant|bot|agente|asistente/.test(rawSpeaker) ? 'assistant' as const : 'user' as const,
        text: match[2].trim(),
      }
    })
}

function titleCaseName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : '')
    .join(' ')
}

function validCallerName(raw: string): boolean {
  const normalized = stripAccentsForMatch(raw).toLowerCase().replace(/\s+/g, ' ').trim()
  const blocked =
    /^(y apellido|es jos|esta semana|particular|empresa|no tengo email|sin email|muchas gracias|gracias|buen dia|hasta luego|chau|corta|ok|correcto|perfecto)$/i.test(normalized) ||
    /\b(nombre|apellido|telefono|cotizacion|wrap|vehicular|semana|particular|gracias|chau)\b/i.test(normalized)
  if (blocked) return false
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  return parts.length >= 1 && parts.length <= 2 && parts.every((part) => /^[\p{L}'-]{2,}$/u.test(part))
}

function cleanNameCandidate(raw: string): string {
  let cleaned = raw
    .replace(/[.,;:!?¿¡"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  for (let i = 0; i < 3; i += 1) {
    const next = cleaned
      .replace(/^(?:si|sí|claro|correcto|ok|dale)\s+/iu, '')
      .replace(/^(?:me llamo|mi nombre es|soy|nombre y apellido|nombre|apellido|es)\s+/iu, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (next === cleaned) break
    cleaned = next
  }
  return cleaned
}

function inferCurrentCallNameFromTranscript(transcript: string): string {
  const lines = parseTranscriptLines(transcript)
  for (let i = 0; i < lines.length - 1; i += 1) {
    const current = stripAccentsForMatch(lines[i].text).toLowerCase()
    if (
      lines[i].speaker === 'assistant' &&
      /\b(nombre y apellido|nombre completo|me das tu nombre|cual es tu nombre|cuál es tu nombre)\b/.test(current)
    ) {
      const nextUser = lines.slice(i + 1).find((line) => line.speaker === 'user')
      const candidate = titleCaseName(cleanNameCandidate(nextUser?.text || ''))
      if (validCallerName(candidate)) return candidate
    }
  }
  return ''
}

function normalizeDictatedPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return normalizePhone(raw)
}

function inferDictatedPhoneFromTranscript(transcript: string): string {
  const digitWords: Record<string, string> = {
    zero: '0', cero: '0', oh: '0',
    one: '1', uno: '1',
    two: '2', dos: '2',
    three: '3', tres: '3',
    four: '4', cuatro: '4',
    five: '5', cinco: '5',
    six: '6', seis: '6',
    seven: '7', siete: '7',
    eight: '8', ocho: '8',
    nine: '9', nueve: '9',
  }
  const lines = transcriptUserLines(transcript)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const normalized = stripAccentsForMatch(lines[i]).toLowerCase()
    const tokens = normalized.match(/\d|zero|cero|oh|one|uno|two|dos|three|tres|four|cuatro|five|cinco|six|seis|seven|siete|eight|ocho|nine|nueve/g)
    if (tokens && tokens.length >= 10) {
      const digits = tokens.map((t) => digitWords[t] || t).join('').slice(-10)
      const phone = normalizeDictatedPhone(digits)
      if (phone) return phone
    }
    const numeric = lines[i].match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || []
    for (const candidate of numeric.reverse()) {
      const phone = normalizeDictatedPhone(candidate)
      if (phone) return phone
    }
  }
  return ''
}

function hasDeclinedEmail(transcript: string): boolean {
  const t = stripAccentsForMatch(transcript).toLowerCase()
  return /\b(no tengo email|no tengo correo|no email|sin email|sin correo|no quiero dar email|no quiero dar correo)\b/.test(t)
}

function inferWrapQuoteNeedFromTranscript(transcript: string): {
  need: string
  vehicleType: string | null
  coverage: string | null
  designHelp: boolean
  timeline: string | null
} | null {
  const normalized = stripAccentsForMatch(transcript || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null
  const hasWrap =
    /\bwrap\b/.test(normalized) ||
    /\brap vehicular\b/.test(normalized) ||
    /\bvehicle wrap\b/.test(normalized) ||
    /\bcar wrap\b/.test(normalized) ||
    /\bwrap vehicular\b/.test(normalized) ||
    /\brotulacion vehicular\b/.test(normalized) ||
    /\bvinilo vehicular\b/.test(normalized) ||
    /\bgrafica vehicular\b/.test(normalized) ||
    /\blettering vehicular\b/.test(normalized) ||
    /\bfleet graphics\b/.test(normalized)
  if (!hasWrap) return null

  const vehicleType = /\bford ranger\b/.test(normalized)
    ? 'Ford Ranger'
    : /\branger\b/.test(normalized)
      ? 'Ford Ranger'
      : /\b(van|furgoneta)\b/.test(normalized)
    ? 'van'
    : /\b(auto|carro|coche|car|vehiculo|sedan)\b/.test(normalized)
    ? 'auto'
    : /\b(camioneta|truck|pickup)\b/.test(normalized)
      ? 'camioneta'
      : /\b(flota|fleet)\b/.test(normalized)
        ? 'flota'
        : null
  const coverage = /\b(completo|complete|full|total)\b/.test(normalized)
    ? 'completo'
    : /\b(parcial|partial)\b/.test(normalized)
      ? 'parcial'
      : null
  const designHelp =
    /\b(diseno|design|arte|artwork)\b/.test(normalized) &&
    /\b(ayuda|help|needs|need|necesito|necesita|sin|no tengo|hacer|make|from us|ustedes|swatworks)\b/.test(normalized)
  const timeline = /\b(esta semana|this week)\b/.test(normalized)
    ? 'esta semana'
    : /\b(urgente|urgent|cuanto antes|as soon as possible)\b/.test(normalized)
      ? 'urgente'
      : null

  return {
    need: `Cotización de wrap vehicular ${coverage || 'completo'} para ${vehicleType || 'auto'}. Cliente ${
      designHelp ? 'necesita diseño' : 'consulta por diseño'
    }. Lo necesita ${timeline || 'esta semana'}.`,
    vehicleType,
    coverage,
    designHelp,
    timeline,
  }
}

function quoteContextFromUnknown(value: unknown): QuoteContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  const serviceName = typeof rec.service_name === 'string' ? rec.service_name.trim() : ''
  const primary = typeof rec.primary_message_for_caller === 'string' ? rec.primary_message_for_caller.trim() : ''
  const need = typeof rec.need_for_lead === 'string' ? rec.need_for_lead.trim() : ''
  if (!serviceName || !primary || !need) return null
  return {
    service_name: serviceName,
    unit_price: rec.unit_price,
    currency: typeof rec.currency === 'string' ? rec.currency : 'USD',
    description: typeof rec.description === 'string' ? rec.description : null,
    catalog_source: typeof rec.catalog_source === 'string' ? rec.catalog_source : 'unknown',
    catalog_updated_at: typeof rec.catalog_updated_at === 'string' ? rec.catalog_updated_at : null,
    primary_message_for_caller: primary,
    need_for_lead: need,
  }
}

function quoteContextFromToolResult(out: unknown): QuoteContext | null {
  if (!out || typeof out !== 'object') return null
  const rec = out as Record<string, unknown>
  return quoteContextFromUnknown(rec.quote_context)
}

function quoteContextsFromToolResult(out: unknown): QuoteContext[] {
  if (!out || typeof out !== 'object') return []
  const rec = out as Record<string, unknown>
  const raw = rec.quote_contexts
  if (!Array.isArray(raw)) return []
  return raw.map((item) => quoteContextFromUnknown(item)).filter((item): item is QuoteContext => Boolean(item))
}

function mergeQuoteContexts(existing: QuoteContext[], incoming: QuoteContext[]): QuoteContext[] {
  const merged = [...existing]
  for (const ctx of incoming) {
    const key = `${ctx.service_name.toLowerCase()}::${String(ctx.unit_price)}`
    const already = merged.some((item) => `${item.service_name.toLowerCase()}::${String(item.unit_price)}` === key)
    if (!already) merged.push(ctx)
  }
  return merged.slice(-12)
}

function quoteContextListFromUnknown(value: unknown): QuoteContext[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => quoteContextFromUnknown(item)).filter((item): item is QuoteContext => Boolean(item))
}

function selectQuoteContextFromText(contexts: QuoteContext[], text: string): QuoteContext | null {
  if (contexts.length === 0) return null
  const normalized = stripAccentsForMatch(text || '')
    .toLowerCase()
    .replace(/\bmil\b/g, '1000')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return contexts[contexts.length - 1] || null
  let best: { ctx: QuoteContext; score: number } | null = null
  for (const ctx of contexts) {
    const service = stripAccentsForMatch(ctx.service_name).toLowerCase()
    const price = String(ctx.unit_price ?? '').toLowerCase()
    let score = 0
    const serviceNumbers = service.match(/\d+/g) || []
    for (const n of serviceNumbers) {
      if (new RegExp(`\\b${n}\\b`).test(normalized)) score += 10
    }
    if (price && new RegExp(`\\b${price.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalized)) score += 4
    for (const word of service.split(/[^a-z0-9]+/).filter((w) => w.length >= 4)) {
      if (normalized.includes(word)) score += 1
    }
    if (!best || score > best.score) best = { ctx, score }
  }
  return best && best.score > 0 ? best.ctx : contexts[contexts.length - 1] || null
}

async function persistQuoteContextForCall(input: {
  organizationId: string
  vapiCallId: string
  phone: string
  quoteContext?: QuoteContext | null
  quoteContexts?: QuoteContext[]
}) {
  if (!input.vapiCallId) return
  const incomingContexts = input.quoteContexts?.length
    ? input.quoteContexts
    : input.quoteContext
      ? [input.quoteContext]
      : []
  if (incomingContexts.length === 0) return
  const supabase = createServiceRoleClient()
  const { data: rows } = await supabase
    .from('call_logs')
    .select('id, structured_extraction')
    .eq('organization_id', input.organizationId)
    .eq('vapi_call_id', input.vapiCallId)
    .order('created_at', { ascending: false })
    .limit(1)
  const existing = rows?.[0]
  const prev =
    existing?.structured_extraction &&
    typeof existing.structured_extraction === 'object' &&
    !Array.isArray(existing.structured_extraction)
      ? (existing.structured_extraction as Record<string, unknown>)
      : {}
  const prevContexts = quoteContextListFromUnknown(prev.quote_contexts)
  const mergedContexts = mergeQuoteContexts(prevContexts, incomingContexts)
  const structured = {
    ...prev,
    quote_context: input.quoteContext || incomingContexts[incomingContexts.length - 1],
    quote_contexts: mergedContexts,
  }
  await upsertCallLog({
    organizationId: input.organizationId,
    vapiCallId: input.vapiCallId,
    phone: input.phone?.trim() ? input.phone : unknownCallerPlaceholderE164(),
    validationStatus: 'pending',
    spamScore: 0,
    structuredExtraction: structured as StructuredExtraction,
  })
}

async function getStoredQuoteContext(input: {
  organizationId: string
  vapiCallId: string
  selectionText?: string
}): Promise<QuoteContext | null> {
  if (!input.vapiCallId) return null
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('call_logs')
    .select('structured_extraction')
    .eq('organization_id', input.organizationId)
    .eq('vapi_call_id', input.vapiCallId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const rec =
    data?.structured_extraction &&
    typeof data.structured_extraction === 'object' &&
    !Array.isArray(data.structured_extraction)
      ? (data.structured_extraction as Record<string, unknown>)
      : {}
  const contexts = quoteContextListFromUnknown(rec.quote_contexts)
  const selected = selectQuoteContextFromText(contexts, input.selectionText || '')
  return selected || quoteContextFromUnknown(rec.quote_context)
}

async function autoSaveQuoteLeadFromTranscript(input: {
  organizationId: string
  transcript: string
  vapiCallId: string
  quoteContext: QuoteContext | null
}) {
  if (!input.quoteContext) return null
  const flags = await getVapiCallIdempotencyFlags({
    organizationId: input.organizationId,
    vapiCallId: input.vapiCallId,
  })
  if (flags.latestSavedLeadId || flags.quoteLeadAutosaveDone) {
    console.info('[vapi/quote-lead-autosave] skipped_idempotent', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      has_saved_lead: Boolean(flags.latestSavedLeadId),
      autosave_done: flags.quoteLeadAutosaveDone,
    })
    return null
  }
  const fullName = inferCurrentCallNameFromTranscript(input.transcript) || 'Sin nombre'
  const phone = inferDictatedPhoneFromTranscript(input.transcript)
  const emailDeclined = hasDeclinedEmail(input.transcript)
  const need = input.quoteContext.need_for_lead
  if (!phone || !emailDeclined) {
    console.info('[vapi/quote-lead-autosave] skipped', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      service_name: input.quoteContext.service_name,
      has_name: fullName !== 'Sin nombre',
      has_dictated_phone: Boolean(phone),
      email_declined: emailDeclined,
    })
    return null
  }
  const out = await runSaveLeadInfo({
    organizationId: input.organizationId,
    phone,
    name: fullName,
    email: undefined,
    notes: need,
    commercialSnapshot: {
      category: 'catalog_quote',
      intent: 'quote_request',
      priority: 'normal',
      estimated_value_level: 'low_medium',
      source: 'vapi_call',
      summary: need,
      next_action: `Enviar cotización formal de ${input.quoteContext.service_name}.`,
      callback_required: true,
    },
    vapiCallId: input.vapiCallId || null,
  })
  let callLogLink: Awaited<ReturnType<typeof patchCallLogLeadCustomer>> | null = null
  if (out.ok && input.vapiCallId && out.customer?.id) {
    callLogLink = await patchCallLogLeadCustomer({
      organizationId: input.organizationId,
      vapiCallId: input.vapiCallId,
      customerId: out.customer.id,
      leadId: out.lead?.id ?? null,
      customerName: out.customer.name ?? fullName,
    }).catch((error) => {
      console.warn('[vapi/quote-lead-autosave] call_log_link_failed', {
        organization_id: input.organizationId,
        call_id: input.vapiCallId || null,
        saved_customer_id: out.customer?.id ?? null,
        saved_lead_id: out.lead?.id ?? null,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    })
  }
  const telegramSent = false
  if (out.ok) {
    await mergeCallLogStructuredByVapiCallId({
      organizationId: input.organizationId,
      vapiCallId: input.vapiCallId,
      patch: { quote_lead_autosave_done: true },
    })
  }
  console.info('[vapi/quote-lead-autosave] result', {
    organization_id: input.organizationId,
    call_id: input.vapiCallId || null,
    ok: out.ok,
    lead_id: out.ok ? out.lead?.id ?? null : null,
    final_name: fullName,
    final_phone_suffix: phone.replace(/\D/g, '').slice(-4),
    telegram_sent: telegramSent,
    saved_customer_id: out.ok ? out.customer?.id ?? null : null,
    saved_lead_id: out.ok ? out.lead?.id ?? null : null,
    call_log_customer_id_before: callLogLink?.beforeCustomerId ?? null,
    call_log_customer_id_after: callLogLink?.afterCustomerId ?? null,
    call_log_lead_id_after: callLogLink?.afterLeadId ?? null,
    error: out.ok ? null : out.error,
  })
  return { out, telegramSent }
}

async function autoSaveWrapQuoteLeadFromTranscript(input: {
  organizationId: string
  transcript: string
  vapiCallId: string
  callLogId?: string | null
}) {
  const wrap = inferWrapQuoteNeedFromTranscript(input.transcript)
  if (!wrap) return null
  const flags = await getVapiCallIdempotencyFlags({
    organizationId: input.organizationId,
    vapiCallId: input.vapiCallId,
  })
  if (flags.latestSavedLeadId || flags.wrapLeadAutosaveDone) {
    console.info('[vapi/wrap-lead-autosave] skipped_idempotent', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      has_saved_lead: Boolean(flags.latestSavedLeadId),
      autosave_done: flags.wrapLeadAutosaveDone,
    })
    return null
  }
  const fullName = inferCurrentCallNameFromTranscript(input.transcript) || 'Sin nombre'
  const phone = inferDictatedPhoneFromTranscript(input.transcript)
  if (!phone) {
    console.info('[vapi/wrap-lead-autosave] skipped', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      has_name: fullName !== 'Sin nombre',
      has_dictated_phone: Boolean(phone),
    })
    return null
  }
  const commercial = {
    category: 'wrap',
    intent: 'quote_request',
    priority: 'high',
    estimated_value_level: 'high',
    source: 'vapi_call',
    summary: wrap.need,
    next_action: 'Llamar para revisar vehículo, alcance del trabajo y preparar cotización.',
    callback_required: true,
    ...(wrap.vehicleType ? { vehicle_type: wrap.vehicleType } : {}),
    ...(wrap.coverage ? { wrap_scope: wrap.coverage } : {}),
    ...(wrap.designHelp ? { design_help_needed: true } : {}),
    ...(wrap.timeline ? { timeline: wrap.timeline } : {}),
  }
  const out = await runSaveLeadInfo({
    organizationId: input.organizationId,
    phone,
    name: fullName,
    notes: wrap.need,
    commercialSnapshot: commercial,
    vapiCallId: input.vapiCallId || null,
  })
  let callLogLink: Awaited<ReturnType<typeof patchCallLogLeadCustomer>> | null = null
  if (out.ok && input.vapiCallId && out.customer?.id) {
    callLogLink = await patchCallLogLeadCustomer({
      organizationId: input.organizationId,
      vapiCallId: input.vapiCallId,
      customerId: out.customer.id,
      leadId: out.lead?.id ?? null,
      customerName: out.customer.name ?? fullName,
    }).catch((error) => {
      console.warn('[vapi/wrap-lead-autosave] call_log_link_failed', {
        organization_id: input.organizationId,
        call_id: input.vapiCallId || null,
        saved_customer_id: out.customer?.id ?? null,
        saved_lead_id: out.lead?.id ?? null,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    })
  }
  const telegramSent = false
  let followUpCreated = false
  if (out.ok) {
    const followUp = await runCreateFollowUp({
      organizationId: input.organizationId,
      callLogId: input.callLogId || undefined,
      phone,
      customerId: out.customer?.id,
      leadId: out.lead?.id ?? undefined,
      title: 'Llamar por cotización de wrap vehicular',
      notes: [`Cliente: ${fullName}`, `Tel: ${phone}`, wrap.need].join('\n'),
      priority: 'high',
      callbackRequired: true,
    })
    followUpCreated = Boolean(followUp)
    await mergeCallLogStructuredByVapiCallId({
      organizationId: input.organizationId,
      vapiCallId: input.vapiCallId,
      patch: { wrap_lead_autosave_done: true },
    })
  }
  console.info('[vapi/wrap-lead-autosave] result', {
    organization_id: input.organizationId,
    call_id: input.vapiCallId || null,
    ok: out.ok,
    lead_id: out.ok ? out.lead?.id ?? null : null,
    final_name: fullName,
    final_phone_suffix: phone.replace(/\D/g, '').slice(-4),
    telegram_sent: telegramSent,
    follow_up_created: followUpCreated,
    saved_customer_id: out.ok ? out.customer?.id ?? null : null,
    saved_lead_id: out.ok ? out.lead?.id ?? null : null,
    call_log_customer_id_before: callLogLink?.beforeCustomerId ?? null,
    call_log_customer_id_after: callLogLink?.afterCustomerId ?? null,
    call_log_lead_id_after: callLogLink?.afterLeadId ?? null,
    error: out.ok ? null : out.error,
  })
  return { out, telegramSent, followUpCreated }
}


function conciseDynamicGreeting(raw: string): string {
  const t = (raw || '').trim()
  if (t && t.length <= 90) return t
  return 'Hello, this is SWATWORKS. How can I help?'
}

export async function dispatchVapiEvent(input: {
  body: JsonRecord
  /** JSON original del webhook (sin parse Zod) para fusionar transcript/messages anidados en message.* */
  rawBody?: JsonRecord
  organizationId: string
  /** URL completa del POST (p. ej. request.url) para logs en Vercel */
  requestUrl?: string | null
}) {
  const payload = flattenEvent(input.body)
  const flatFromRaw = input.rawBody ? flattenEvent(input.rawBody) : input.body
  const extractionMerged = mergeVapiWebhookBodiesForExtraction(flatFromRaw, payload)
  const eventType =
    getVapiMessageTypeFromPayload(extractionMerged) ||
    getVapiMessageTypeFromPayload(payload) ||
    str(payload, 'type')
  const vapiCallId = getCallIdFromPayload(extractionMerged) || ''
  console.log('[vapi/dispatcher] event', {
    organization_id: input.organizationId,
    message_type: eventType || 'unknown',
    call_id: vapiCallId || null,
  })
  const runtime = await getOrganizationRuntimeConfig(input.organizationId)
  const phoneFromNested = getPhone(payload)
  const phoneFromMerged = getCallerPhoneFromPayload(extractionMerged)
  const phone = phoneFromNested || phoneFromMerged || ''
  const phoneTrace = {
    from_getPhone: Boolean(phoneFromNested),
    from_getCallerPhone_merged: Boolean(phoneFromMerged),
    from_getCallerPhone_raw_body: Boolean(input.rawBody && getCallerPhoneFromPayload(flattenEvent(input.rawBody))),
  }
  const customerName = getCustomerName(payload)
  const summary =
    getSummaryFromPayload(extractionMerged) || str(payload, 'summary')
  const recordingUrl = getRecordingUrlFromPayload(extractionMerged)
  const topic = getTopicFromPayload(extractionMerged)
  const sentiment = getSentimentFromPayload(extractionMerged)
  const durationSeconds = getDurationSecondsFromPayload(extractionMerged)
  const disposition = str(payload, 'disposition')

  const rawTranscript =
    getTranscriptFromPayload(extractionMerged) || str(payload, 'transcript')
  const messagesFromPayload = getMessagesFromPayload(extractionMerged)
  const messagesCount = messagesFromPayload?.length ?? 0
  let transcriptFinal = (rawTranscript || '').trim()
  if (!transcriptFinal && messagesFromPayload?.length) {
    transcriptFinal = (buildTranscriptFromMessages(messagesFromPayload) || '').trim()
  }
  const latestUserText = latestUserTextFromMessages(messagesFromPayload)

  let resolvedPhone = phone
  let phoneFromCallLogs = false
  const endedEarly = endedEvent(eventType)
  if (!resolvedPhone && endedEarly && vapiCallId) {
    resolvedPhone = unknownCallerPlaceholderE164()
    console.warn('[vapi/dispatcher] missing_phone_using_placeholder', {
      organization_id: input.organizationId,
      call_id: vapiCallId,
      placeholder_suffix: resolvedPhone.slice(-4),
    })
  }

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

  if (eventType === 'end-of-call-report' && !resolvedPhone.trim()) {
    resolvedPhone = unknownCallerPlaceholderE164()
    console.warn('[vapi/dispatcher] end_of_call_report_missing_phone_placeholder', {
      organization_id: input.organizationId,
      call_id: vapiCallId || null,
    })
  }

  if (eventType === 'end-of-call-report') {
    console.log('[vapi/end-of-call-report]', {
      callId: vapiCallId || null,
      organization_id: input.organizationId,
      transcript_length_preview: transcriptFinal.length,
      recording_url_present: Boolean(recordingUrl),
    })
  }

  if (eventType === 'assistant-request') {
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

    const voiceRes = await resolveOpenAiVoiceForOrganization(input.organizationId)
    const trCfg = getTranscriberConfigForVapi()
    console.log('[vapi/dispatcher] assistant-request voice', {
      organization_id: input.organizationId,
      voice_id: voiceRes.voiceId,
      voice_source: voiceRes.source,
      transcriber_language: trCfg.language,
    })

    return {
      assistant: {
        firstMessage,
        model,
        voice: { provider: voiceRes.voiceProvider, voiceId: voiceRes.voiceId },
        transcriber: {
          provider: trCfg.provider,
          model: trCfg.model,
          language: trCfg.language,
        },
      },
    }
  }

  if (eventType === 'status-update') {
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

  if (eventType === 'transfer-update') {
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

  if (eventType === 'transfer-destination-request') {
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

  if (eventType === 'tool-calls') {
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
        if (name === 'save_lead_info' && vapiCallId) {
          const quoteSelectionText = [
            latestUserText || '',
            transcriptFinal || '',
            summary || '',
            typeof args.need === 'string' ? args.need : '',
            typeof args.notes === 'string' ? args.notes : '',
            typeof args.summary === 'string' ? args.summary : '',
            typeof args.product_name === 'string' ? args.product_name : '',
            typeof args.service_name === 'string' ? args.service_name : '',
          ]
            .filter(Boolean)
            .join('\n')
          const storedQuote = await getStoredQuoteContext({
            organizationId: input.organizationId,
            vapiCallId,
            selectionText: quoteSelectionText,
          })
          const currentNeed =
            typeof args.need === 'string'
              ? args.need.trim()
              : typeof args.notes === 'string'
                ? args.notes.trim()
                : ''
          const hasExplicitNeed =
            typeof args.need === 'string' && args.need.trim().length >= 12
          const currentNeedLooksUseful =
            /\b(cotizacion|cotización|quote|business|cards|tarjeta|tarjetas|flyer|banner|print|impresion|impresión|wrap)\b/i.test(
              stripAccentsForMatch(currentNeed),
            )
          const currentNeedWeak =
            !hasExplicitNeed || currentNeed.length < 20 || !currentNeedLooksUseful
          if (storedQuote && currentNeedWeak) {
            args.need = storedQuote.need_for_lead
            args.category = typeof args.category === 'string' && args.category.trim() ? args.category : 'catalog_quote'
            args.intent = typeof args.intent === 'string' && args.intent.trim() ? args.intent : 'quote_request'
            args.source = typeof args.source === 'string' && args.source.trim() ? args.source : 'vapi_call'
            args.summary = typeof args.summary === 'string' && args.summary.trim() ? args.summary : storedQuote.need_for_lead
            args.next_action =
              typeof args.next_action === 'string' && args.next_action.trim()
                ? args.next_action
                : `Enviar cotización formal de ${storedQuote.service_name}.`
            args.quote_context = storedQuote
            console.info('[vapi/quote-context] applied_to_save_lead', {
              organization_id: input.organizationId,
              call_id: vapiCallId,
              service_name: storedQuote.service_name,
              need_preview: storedQuote.need_for_lead.slice(0, 180),
              need_from_quote_context: true,
            })
          }
        }
        if (name === 'create_follow_up' && vapiCallId && !args.title) {
          const storedQuote = await getStoredQuoteContext({
            organizationId: input.organizationId,
            vapiCallId,
            selectionText: [latestUserText || '', transcriptFinal || '', summary || ''].filter(Boolean).join('\n'),
          })
          if (storedQuote) {
            args.title = 'Seguimiento: cotización solicitada'
            args.category = typeof args.category === 'string' && args.category.trim() ? args.category : 'catalog_quote'
            args.intent = typeof args.intent === 'string' && args.intent.trim() ? args.intent : 'quote_request'
            args.notes =
              typeof args.notes === 'string' && args.notes.trim()
                ? args.notes
                : storedQuote.need_for_lead
            console.info('[vapi/quote-context] applied_to_follow_up', {
              organization_id: input.organizationId,
              call_id: vapiCallId,
              service_name: storedQuote.service_name,
              title: args.title,
            })
          }
        }
        console.log('[vapi/tool-call]', {
          callId: vapiCallId || null,
          toolName: name,
          toolCallId: toolCallId || null,
          organization_id: input.organizationId,
          argKeys: Object.keys(args).slice(0, 32),
        })
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
            transcript: transcriptFinal || null,
            latestUserText: latestUserText || null,
            callSummary: summary || null,
          })
          if ((name === 'get_price_quote' || name === 'get_product_price') && vapiCallId) {
            const quoteContext = quoteContextFromToolResult(out)
            const quoteContexts = quoteContextsFromToolResult(out)
            if (quoteContext || quoteContexts.length > 0) {
              await persistQuoteContextForCall({
                organizationId: input.organizationId,
                vapiCallId,
                phone: phoneForToolContext || resolvedPhone,
                quoteContext,
                quoteContexts,
              })
              console.info('[vapi/quote-context] stored', {
                organization_id: input.organizationId,
                call_id: vapiCallId,
                service_name: quoteContext?.service_name ?? null,
                quote_contexts_count: quoteContexts.length,
                quote_context_names: quoteContexts.map((ctx) => ctx.service_name).slice(0, 8),
                catalog_source: quoteContext?.catalog_source ?? quoteContexts[0]?.catalog_source ?? null,
                catalog_updated_at: quoteContext?.catalog_updated_at ?? quoteContexts[0]?.catalog_updated_at ?? null,
              })
            }
          }
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
              transfer_person: typeof args.transfer_person === 'string' ? args.transfer_person : undefined,
              language: typeof args.language === 'string' ? args.language : undefined,
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

  if (!resolvedPhone) {
    console.log('[vapi/dispatcher] skip_persist_non_terminal', {
      organization_id: input.organizationId,
      message_type: eventType || 'unknown',
      call_id: vapiCallId || null,
      reason: 'missing_phone',
    })
    return { ok: true, skipped: true, reason: 'missing_phone' }
  }

  const validation = shouldRejectByValidation({
    name: customerName,
    phone: resolvedPhone,
    reason: `${summary} ${transcriptFinal}`.trim(),
    jobNumber: str(payload, 'job_number') || str(payload, 'order_number'),
    attempts: Number(payload.attempts || 0) || runtime.spamPolicy.maxFailedAttempts - 1,
  })

  if (eventType !== 'end-of-call-report' && validation.reject) {
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

  const ended = endedEvent(eventType)
  const er =
    getEndedReasonFromPayload(extractionMerged) || str(payload, 'endedReason')

  if (ended) {
    console.log('[vapi/dispatcher] call-ended', {
      organization_id: input.organizationId,
      call_id: vapiCallId || null,
      ended_reason: er || null,
      warm_transfer_failure: er ? isWarmTransferFailureEndedReason(er) : false,
    })
  }

  const extractionCallback =
    extractionFromPayload.callback_required === true ||
    extractionFromPayload.follow_up_required === true
  const narrative = `${summary || ''} ${transcriptFinal || ''}`.trim()
  const heuristicCallback =
    ended && narrative.length >= 16 && textSuggestsPromisedCallback(narrative)

  const ts = getCallTimestampsFromPayload(extractionMerged)
  const startedAtIso = ts.startedAt
  const endedAtIso = ts.endedAt
  const cost = getCostFromPayload(extractionMerged)
  const analysisObj = getAnalysisObjectFromPayload(extractionMerged)

  const structuredExtras: Record<string, unknown> = {
    ...(Object.keys(extractionFromPayload).length > 0 ? extractionFromPayload : {}),
    ...(recordingUrl ? { vapi_recording_url: recordingUrl } : {}),
    ...(typeof durationSeconds === 'number' ? { vapi_duration_seconds: durationSeconds } : {}),
    ...(topic ? { vapi_topic: topic } : {}),
    ...(sentiment ? { vapi_sentiment: sentiment } : {}),
    ...(er ? { vapi_ended_reason: er } : {}),
    ...(typeof cost === 'number' && Number.isFinite(cost) ? { vapi_cost: cost } : {}),
    ...(messagesCount > 0 ? { vapi_messages_count: messagesCount } : {}),
    ...(startedAtIso ? { vapi_started_at: startedAtIso } : {}),
    ...(endedAtIso ? { vapi_ended_at: endedAtIso } : {}),
    ...(analysisObj && Object.keys(analysisObj).length > 0 ? { vapi_analysis: analysisObj } : {}),
    ...(ended && vapiCallId
      ? {
          vapi_metadata: {
            organization_id: input.organizationId,
            webhook_message_type: eventType,
            vapi_call_id: vapiCallId,
            customer_number: resolvedPhone || null,
            ended_reason: er || null,
            has_transcript: Boolean(transcriptFinal.trim()),
            messages_count: messagesCount,
            has_summary: Boolean((summary || '').trim()),
            has_recording_url: Boolean(recordingUrl),
            started_at: startedAtIso,
            ended_at: endedAtIso,
            duration_seconds: typeof durationSeconds === 'number' ? durationSeconds : null,
            cost: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
          },
        }
      : {}),
  }

  let persisted: Awaited<ReturnType<typeof persistCallArtifacts>>
  try {
    persisted = await persistCallArtifacts({
      organizationId: input.organizationId,
      vapiCallId: vapiCallId || undefined,
      phone: resolvedPhone,
      customerName: customerName || undefined,
      transcript: transcriptFinal || undefined,
      summary: summary || undefined,
      intent: str(payload, 'intent') || undefined,
      outcome: disposition || (ended ? er || 'resolved' : undefined),
      nextAction: ended ? 'Review call in dashboard' : 'Call in progress',
      callbackRequired: extractionCallback || heuristicCallback,
      followUpDate: undefined,
      spamScore: undefined,
      ended,
      vapiStartedAtIso: startedAtIso || undefined,
      vapiEndedAtIso: ended ? endedAtIso || undefined : undefined,
      structuredExtractionFromEvent:
        Object.keys(structuredExtras).length > 0 ? structuredExtras : undefined,
    })
    if (ended && !transcriptFinal.trim()) {
      console.warn('[vapi/call-transcript-missing]', {
        callId: vapiCallId || null,
        hasMessages: messagesCount > 0,
        hasTranscript: Boolean((rawTranscript || '').trim()),
        hasSummary: Boolean((summary || '').trim()),
        endedReason: er || null,
      })
    }
    console.log('[vapi/call-outcome]', {
      callId: vapiCallId || null,
      organization_id: input.organizationId,
      saved: true,
      table: 'call_logs',
      transcriptLength: transcriptFinal.length,
      messagesCount,
      recordingUrlExists: Boolean(recordingUrl),
      endedReason: er || null,
      error: null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[vapi/call-outcome]', {
      callId: vapiCallId || null,
      organization_id: input.organizationId,
      saved: false,
      table: 'call_logs',
      transcriptLength: transcriptFinal.length,
      messagesCount,
      recordingUrlExists: Boolean(recordingUrl),
      endedReason: er || null,
      error: msg.slice(0, 400),
    })
    return {
      ok: false,
      event_type: eventType || 'unknown',
      persist_error: msg,
    }
  }

  const duplicateFinalize = Boolean(
    persisted && typeof persisted === 'object' && 'duplicate_finalize' in persisted
      ? (persisted as { duplicate_finalize?: boolean }).duplicate_finalize
      : false,
  )

  let followUpAfterFailedTransfer = false
  if (!duplicateFinalize && ended && er && vapiCallId) {
    const fu = await onWarmTransferFailureFollowUp({
      organizationId: input.organizationId,
      vapiCallId,
      phone: resolvedPhone,
      endedReason: er,
    })
    followUpAfterFailedTransfer = fu.follow_up_created
  }

  const quoteLeadAutosave =
    !duplicateFinalize && ended && transcriptFinal.trim()
      ? await autoSaveQuoteLeadFromTranscript({
          organizationId: input.organizationId,
          transcript: transcriptFinal,
          vapiCallId,
          quoteContext: await getStoredQuoteContext({
            organizationId: input.organizationId,
            vapiCallId,
          }),
        })
      : null
  const wrapLeadAutosave =
    !duplicateFinalize && ended && transcriptFinal.trim()
      ? await autoSaveWrapQuoteLeadFromTranscript({
          organizationId: input.organizationId,
          transcript: transcriptFinal,
          vapiCallId,
          callLogId: persisted.call_log_id,
        })
      : null

  return {
    ok: true,
    event_type: eventType || 'unknown',
    call_log_id: persisted.call_log_id,
    classification: persisted.classification,
    ended_reason: er || undefined,
    follow_up_after_failed_transfer: followUpAfterFailedTransfer,
    quote_lead_autosave:
      quoteLeadAutosave
        ? {
            ok: quoteLeadAutosave.out.ok,
            telegram_sent: quoteLeadAutosave.telegramSent,
          }
        : undefined,
    wrap_lead_autosave:
      wrapLeadAutosave
        ? {
            ok: wrapLeadAutosave.out.ok,
            telegram_sent: wrapLeadAutosave.telegramSent,
            follow_up_created: wrapLeadAutosave.followUpCreated,
          }
        : undefined,
  }
}
