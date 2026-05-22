import { classifyLeadTemperature, notifyLeadTelegram, notifySavedLeadTelegram } from '@/lib/notifications/telegram'
import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import {
  runCreateAppointment,
  runCreateFollowUp,
  runCreateWorkOrder,
  runFindCustomer,
  runGetJobStatus,
  runGetPriceQuote,
  runMarkSpamCall,
  runSaveLeadInfo,
} from '@/lib/voice-platform/service'
import {
  followUpCountForCallLog,
  getCallLogIdByVapiCallId,
  findTeamMemberByPhoneOrName,
  getCallLogLeadCustomerContext,
  getVapiCallIdempotencyFlags,
  mergeCallLogStructuredByVapiCallId,
  patchCallLogLeadCustomer,
} from '@/lib/voice-platform/repository'
import {
  persistCallArtifacts,
  persistFollowUp,
  persistTransfer,
} from '@/lib/vapi/persistence'
import { runPrepareWarmTransfer } from '@/lib/vapi/operator-handoff'
import { normalizePhone } from '@/lib/phone'
import { prepareCommercialFollowUpFromArgs } from '@/lib/vapi/commercial-follow-up'
import {
  buildCommercialMetaBlock,
  classificationSourceText,
  defaultFollowUpDueIsoTomorrow,
  detectWrapIntent,
  parseModelLeadClassification,
  prependCommercialBlockToNotes,
  type LeadCommercialFields,
} from '@/lib/vapi/lead-classification'

function leadFullNameValid(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const normalized = stripAccentsForMatch(name).toLowerCase().replace(/\s+/g, ' ').trim()
  const blocked =
    /^(y apellido|es jos|esta semana|particular|empresa|no tengo email|sin email|muchas gracias|gracias|buen dia|hasta luego|chau|corta|ok|correcto|perfecto)$/i.test(normalized) ||
    /\b(nombre|apellido|telefono|cotizacion|semana|particular|gracias|chau)\b/i.test(normalized)
  if (blocked) return false
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0)
  return (
    parts.length >= 1 &&
    parts.length <= 4 &&
    parts.every((part) => /^[\p{L}'-]{2,}$/u.test(part))
  )
}

/** Corta colas tipo " from Katy Magic" que el modelo mete en full_name. */
function stripTrailingCompanyFromPersonName(raw: string): string {
  let s = raw.trim()
  const cutFrom = s.search(/\s+from\s+/i)
  if (cutFrom > 4) s = s.slice(0, cutFrom).trim()
  const cutDe = s.search(/\s+de\s+(la\s+)?(empresa|mi negocio)\b/i)
  if (cutDe > 4) s = s.slice(0, cutDe).trim()
  const cutPara = s.search(/\s+para\s+(mi|el)\s+/i)
  if (cutPara > 6) s = s.slice(0, cutPara).trim()
  return s.replace(/\s+/g, ' ').trim()
}

function strArg(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeTransferLanguage(raw: string): 'en' | 'es' | null {
  const v = raw.trim().toLowerCase()
  if (v === 'en' || v.startsWith('english')) return 'en'
  if (v === 'es' || v.startsWith('spanish') || v.startsWith('espanol') || v.startsWith('español')) return 'es'
  return null
}

async function saveAndNotifyTransferRequestLead(input: {
  organizationId: string
  phone: string
  vapiCallId?: string | null
  args: Record<string, unknown>
  requestedDepartment: string
  language: 'en' | 'es' | null
}) {
  const phone = normalizePhone(input.phone)
  const requestedDepartment = input.requestedDepartment.trim()
  if (!phone || !requestedDepartment) {
    console.info('[vapi/transfer-request-lead] skipped', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      has_phone: Boolean(phone),
      requested_department: requestedDepartment || null,
    })
    return
  }

  const language = input.language || 'unknown'
  const requestSummary =
    requestedDepartment.toLowerCase().includes('graphic') ||
    requestedDepartment.toLowerCase().includes('logo') ||
    requestedDepartment.toLowerCase().includes('brand')
      ? 'Caller requested transfer to graphic design'
      : `Caller requested transfer to ${requestedDepartment}`
  const customerName = strArg(input.args, 'customer_name') || undefined
  const notes = [
    `request_summary: ${requestSummary}`,
    `requested_department: ${requestedDepartment}`,
    `language: ${language}`,
    'status: transfer_requested',
    input.vapiCallId ? `call_id: ${input.vapiCallId}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const commercialSnapshot = {
    category: 'support',
    intent: 'transfer_request',
    priority: 'normal',
    source: 'vapi_call',
    callback_required: false,
    summary: requestSummary,
    next_action: `Transfer caller to ${requestedDepartment}.`,
    requested_department: requestedDepartment,
    request_summary: requestSummary,
    language,
    status: 'transfer_requested',
    call_id: input.vapiCallId || null,
  }

  let leadSaved = false
  let leadId: string | null = null
  let savedCustomerName: string | null = null
  let savedCustomerPhone: string | null = null
  try {
    const out = await runSaveLeadInfo({
      organizationId: input.organizationId,
      phone,
      name: customerName,
      notes,
      commercialSnapshot,
      vapiCallId: input.vapiCallId ?? null,
    })
    leadSaved = Boolean(out.ok)
    leadId = out.ok ? out.lead?.id ?? null : null
    savedCustomerName = out.ok ? out.customer?.name ?? null : null
    savedCustomerPhone = out.ok ? out.customer?.phone ?? null : null
    console.info('[vapi/transfer-request-lead] saved', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      requested_department: requestedDepartment,
      language,
      saved: leadSaved,
      lead_id: leadId,
      error: out.ok ? null : out.error,
    })
    if (!out.ok) return
  } catch (err) {
    console.error('[vapi/transfer-request-lead] save_error', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      requested_department: requestedDepartment,
      error: err instanceof Error ? err.message : String(err),
    })
    return
  }

  try {
    const tgOk = await notifyLeadTelegram({
      temperature: 'lukewarm',
      customerName: savedCustomerName || customerName || 'Transfer request',
      phone: savedCustomerPhone || phone,
      need: requestSummary,
      priceRequested: false,
      category: 'transfer_request',
      summary: requestSummary,
      nextAction: `Transfer to ${requestedDepartment}`,
    })
    console.info('[vapi/transfer-request-lead] telegram', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      requested_department: requestedDepartment,
      lead_saved: leadSaved,
      lead_id: leadId,
      sent: tgOk,
    })
  } catch (err) {
    console.error('[vapi/transfer-request-lead] telegram_error', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      requested_department: requestedDepartment,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function tryAutoFollowUpAfterLeadSave(input: {
  organizationId: string
  phone: string
  vapiCallId: string | null | undefined
  toolCallId: string | null | undefined
  leadId: string | null
  commercial: Partial<LeadCommercialFields> & Record<string, unknown>
  customerName: string | undefined
  args: Record<string, unknown>
}) {
  const c = input.commercial
  const needsHuman =
    input.args.needs_human_follow_up === true ||
    (typeof input.args.needs_human_follow_up === 'string' &&
      input.args.needs_human_follow_up === 'true')

  const transferFailed =
    input.args.transfer_failed === true ||
    (typeof input.args.transfer_failed === 'string' && input.args.transfer_failed === 'true')

  const shouldAuto =
    c.category === 'wrap' ||
    c.intent === 'quote_request' ||
    c.callback_required === true ||
    needsHuman ||
    transferFailed

  if (!shouldAuto) return

  let callLogId: string | undefined =
    input.vapiCallId && input.vapiCallId.trim()
      ? (await getCallLogIdByVapiCallId(input.organizationId, input.vapiCallId)) || undefined
      : undefined
  if (callLogId) {
    const n = await followUpCountForCallLog(callLogId)
    if (n > 0) {
      console.info('[vapi/follow-up]', {
        source: 'auto_after_lead' as const,
        toolCallId: input.toolCallId ?? null,
        leadId: input.leadId,
        organization_id: input.organizationId,
        title: null,
        category: c.category ?? null,
        priority: null,
        due_at: null,
        callback_required: null,
        created: false,
        followUpId: null,
        table: 'follow_ups',
        error: 'already_exists_for_call_log',
      })
      return
    }
  }

  const title =
    c.category === 'wrap'
      ? 'Llamar por cotización de wrap vehicular'
      : 'Seguimiento: cotización o contacto solicitado'

  const notes = [
    input.customerName ? `Cliente: ${input.customerName}` : null,
    `Tel: ${input.phone}`,
    c.summary ? `Resumen: ${c.summary}` : null,
    c.next_action ? `Próxima acción: ${c.next_action}` : null,
    c.category ? `Categoría: ${c.category}` : null,
    c.intent ? `Intent: ${c.intent}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const dueAt = defaultFollowUpDueIsoTomorrow()
  const priority = c.category === 'wrap' ? 'high' : 'normal'

  try {
    const out = await runCreateFollowUp({
      organizationId: input.organizationId,
      callLogId,
      phone: input.phone,
      leadId: input.leadId || undefined,
      title,
      notes,
      dueAt,
      priority,
      callbackRequired: true,
    })
    const fu = out.follow_up as { id?: string } | undefined
    console.info('[vapi/follow-up]', {
      source: 'auto_after_lead' as const,
      toolCallId: input.toolCallId ?? null,
      leadId: input.leadId,
      callLogId: callLogId ?? null,
      organization_id: input.organizationId,
      title: title.slice(0, 120),
      category: c.category ?? null,
      priority,
      due_at: dueAt,
      callback_required: true,
      created: true,
      followUpId: fu?.id ?? null,
      table: 'follow_ups',
      error: null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[vapi/follow-up]', {
      source: 'auto_after_lead',
      toolCallId: input.toolCallId ?? null,
      leadId: input.leadId,
      callLogId: callLogId ?? null,
      organization_id: input.organizationId,
      title: title.slice(0, 120),
      category: c.category ?? null,
      priority,
      due_at: dueAt,
      callback_required: true,
      created: false,
      followUpId: null,
      table: 'follow_ups',
      error: msg.slice(0, 400),
    })
  }
}

type ToolContext = {
  organizationId: string
  phone: string
  vapiCallId: string
  /** Id de tool call de Vapi (logging). */
  toolCallId?: string | null
  transcript?: string | null
  latestUserText?: string | null
  callSummary?: string | null
}

function stripAccentsForMatch(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

function inferTransferDestinationFromText(text: string): {
  department: string
  extension: string | null
  language: 'en' | 'es' | null
  reason: string
} | null {
  const normalized = stripAccentsForMatch(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null

  const designHit =
    /\bdiseno\b/.test(normalized) ||
    /\bdiseno grafico\b/.test(normalized) ||
    /\bdisenador grafico\b/.test(normalized) ||
    /\bgraphic design\b/.test(normalized) ||
    /\bdesign\b/.test(normalized) ||
    /\blogo(s)?\b/.test(normalized) ||
    /\bbranding\b/.test(normalized)

  if (!designHit) return null

  const language: 'en' | 'es' =
    /\bgraphic design\b|\bdesign\b|\blogo(s)?\b|\bbranding\b/.test(normalized) &&
    !/\bdiseno\b|\bdisenador\b/.test(normalized)
      ? 'en'
      : 'es'

  return {
    department: language === 'en' ? 'graphic design' : 'diseño gráfico',
    extension: '90',
    language,
    reason: 'design_keyword_context',
  }
}

function contextTextForTool(context: ToolContext, ...extra: string[]): string {
  return [
    context.latestUserText || '',
    context.transcript || '',
    context.callSummary || '',
    ...extra,
  ]
    .filter(Boolean)
    .join('\n')
}

function inferProductNameFromText(text: string): string {
  let normalized = stripAccentsForMatch(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''
  normalized = normalized
    .replace(/\b4\s*(x|por|by)\s*6\b/g, '4x6')
    .replace(/\bcuatro\s*(por|x)\s*seis\b/g, '4x6')
    .replace(/[¿?¡!.,;:"]/g, ' ')
    .replace(/\b(cuanto|cuantos|cuestan|cuesta|sale|salen|precio|precios|cotizar|cotizacion|quote|price|the|los|las|el|la|un|una|de|del|por favor)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.length >= 2 ? normalized : ''
}

type TranscriptLine = { speaker: 'assistant' | 'user' | 'unknown'; text: string }

function parseTranscriptLines(text: string): TranscriptLine[] {
  return (text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(Assistant|Bot|Agente|Asistente|User|Caller|Customer|Cliente|Usuario)\s*:\s*(.+)$/i)
      if (!match) return { speaker: 'unknown' as const, text: line }
      const rawSpeaker = match[1].toLowerCase()
      const speaker =
        /assistant|bot|agente|asistente/.test(rawSpeaker)
          ? 'assistant'
          : 'user'
      return { speaker, text: match[2].trim() }
    })
}

function userOnlyText(text: string): string {
  const lines = parseTranscriptLines(text)
  const hasSpeakerLabels = lines.some((line) => line.speaker !== 'unknown')
  return lines
    .filter((line) => !hasSpeakerLabels || line.speaker === 'user')
    .map((line) => line.text)
    .join('\n')
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

function titleCaseName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : '')
    .join(' ')
}

function inferNameAfterAssistantPrompt(transcript: string): string {
  const lines = parseTranscriptLines(transcript)
  for (let i = 0; i < lines.length - 1; i += 1) {
    const current = stripAccentsForMatch(lines[i].text).toLowerCase()
    if (lines[i].speaker !== 'assistant') continue
    const namePrompt =
      /\b(nombre y apellido|nombre completo|me das tu nombre|cual es tu nombre)\b/.test(current) ||
      /\bwhat'?s your name\b/.test(current) ||
      /\bwhat is your name\b/.test(current) ||
      /\btell me your name\b/.test(current) ||
      /\bmay i have your name\b/.test(current)
    if (namePrompt) {
      const nextUser = lines.slice(i + 1).find((line) => line.speaker === 'user')
      const candidate = stripTrailingCompanyFromPersonName(
        titleCaseName(cleanNameCandidate(nextUser?.text || '')),
      )
      if (leadFullNameValid(candidate)) return candidate
    }
  }
  return ''
}

function inferFullNameFromText(text: string): string {
  const candidate = inferNameAfterAssistantPrompt(text)
  return leadFullNameValid(candidate) ? candidate : ''
}

/** Nombre + apellido cuando el modelo no los pasa bien (inglés: nombre y apellido en turnos separados). */
function inferFullNameFromConversation(transcript: string): string {
  const lines = parseTranscriptLines(transcript)
  const hasLabels = lines.some((line) => line.speaker !== 'unknown')
  if (!hasLabels) {
    const m = transcript.match(/\bmy name is\s+([^.?\n]+)/i)
    if (m) {
      const t = stripTrailingCompanyFromPersonName(titleCaseName(cleanNameCandidate(m[1])))
      if (leadFullNameValid(t)) return t
    }
    return ''
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].speaker !== 'user') continue
    const mm =
      lines[i].text.match(/\bmy name is\s+([^.?\n]+)/i) ||
      lines[i].text.match(/\bmi nombre es\s+([^.?\n]+)/i) ||
      lines[i].text.match(/\b(?:soy|me llamo)\s+([^.?\n]+)/i)
    if (!mm) continue
    let first = stripTrailingCompanyFromPersonName(titleCaseName(cleanNameCandidate(mm[1])))
    if (leadFullNameValid(first)) return first
    const firstTok = first.split(/\s+/).filter(Boolean)[0] || ''
    if (firstTok.length < 2) continue

    for (let j = i + 1; j < Math.min(lines.length, i + 10); j += 1) {
      if (lines[j].speaker !== 'assistant') continue
      const aj = stripAccentsForMatch(lines[j].text).toLowerCase()
      if (!/\blast name\b|\bapellido\b/i.test(aj)) continue
      const nextU = lines.slice(j + 1).find((line) => line.speaker === 'user')
      if (!nextU) break
      const lastRaw = titleCaseName(cleanNameCandidate(nextU.text))
      const lastTok = lastRaw.split(/\s+/).filter(Boolean)[0] || ''
      if (!lastTok || !/^[\p{L}'-]{2,}$/u.test(lastTok)) break
      const full = `${firstTok} ${lastTok}`.trim()
      if (leadFullNameValid(full)) return full
      break
    }
  }

  for (const L of lines) {
    if (L.speaker !== 'assistant') continue
    const m = L.text.match(/\b(?:Perfect|Perfecto)[^.!?\n]{0,100}?\b([A-Z][a-z]{1,24})\s+([A-Z][a-z]{1,24})\b/)
    if (m) {
      const full = `${m[1]} ${m[2]}`.trim()
      if (leadFullNameValid(full)) return full
    }
  }
  return ''
}

function normalizeDictatedDigits(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return normalizePhone(raw)
}

function inferDictatedPhoneFromText(text: string): string {
  const raw = userOnlyText(text)
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
  const tokens = stripAccentsForMatch(raw)
    .toLowerCase()
    .match(/\d|zero|cero|oh|one|uno|two|dos|three|tres|four|cuatro|five|cinco|six|seis|seven|siete|eight|ocho|nine|nueve/g)
  if (tokens && tokens.length >= 10) {
    const digits = tokens.map((t) => digitWords[t] || t).join('')
    const normalized = normalizeDictatedDigits(digits.slice(-10))
    if (normalized) return normalized
  }
  const candidates = raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || []
  for (const candidate of candidates.reverse()) {
    const normalized = normalizeDictatedDigits(candidate)
    if (normalized) return normalized
  }
  return ''
}

function inferConfirmedPhoneFromText(text: string): string {
  return inferDictatedPhoneFromText(text)
}

function cleanOptionalEmail(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw
    .trim()
    .toLowerCase()
    .replace(/\barroba\b/g, '@')
    .replace(/\bat\b/g, '@')
    .replace(/\bpunto\b/g, '.')
    .replace(/\bdot\b/g, '.')
    .replace(/\s+/g, '')
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return undefined
  return trimmed
}

function callerDeclinedEmail(text: string): boolean {
  const normalized = stripAccentsForMatch(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  return /\b(no tengo email|no tengo correo|no email|sin email|sin correo|no quiero dar email|no quiero dar correo)\b/.test(normalized)
}

/** Email dicho "at gmail dot com" o literal en turnos de usuario. */
function inferSpokenEmailFromTranscript(transcript: string): string | undefined {
  const normalized = (transcript || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ')
  const spokenGmail = normalized.match(
    /\b([a-z0-9][a-z0-9._\s-]{1,48}[a-z0-9])\s+at\s+gmail\s+dot\s+com\b/i,
  )
  if (spokenGmail) {
    const local = spokenGmail[1].replace(/\s+/g, '').toLowerCase()
    if (local.length >= 3) return cleanOptionalEmail(`${local}@gmail.com`)
  }
  const spokenYahoo = normalized.match(
    /\b([a-z0-9][a-z0-9._\s-]{1,48}[a-z0-9])\s+at\s+yahoo\s+dot\s+com\b/i,
  )
  if (spokenYahoo) {
    const local = spokenYahoo[1].replace(/\s+/g, '').toLowerCase()
    if (local.length >= 3) return cleanOptionalEmail(`${local}@yahoo.com`)
  }
  const direct = normalized.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)
  if (direct) return cleanOptionalEmail(direct[0])
  return undefined
}

function inferCompanyFromTranscript(transcript: string): string | undefined {
  const lines = parseTranscriptLines(transcript)
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i].speaker !== 'assistant') continue
    const a = stripAccentsForMatch(lines[i].text).toLowerCase()
    const companyQ =
      /\b(what'?s the company name|what is the company name|company name)\b/.test(a) ||
      /\b(what'?s your business name|your business name|business name)\b/.test(a) ||
      /\b(nombre de la empresa|como se llama la empresa)\b/.test(a)
    if (!companyQ) continue
    const next = lines.slice(i + 1).find((line) => line.speaker === 'user')
    if (!next) return undefined
    const raw = cleanNameCandidate(next.text)
    if (!raw || raw.length > 80) continue
    if (/^\d[\d\s-]+$/.test(raw)) continue
    if (/@|\bat\s+gmail|\bgmail\s+dot|\bdot\s+com\b/i.test(raw)) continue
    const parts = raw.split(/\s+/).filter(Boolean)
    if (parts.length > 6) continue
    return titleCaseName(raw)
  }
  return undefined
}

function quoteContextFromArgs(args: Record<string, unknown>): {
  serviceName: string
  needForLead: string
} | null {
  const raw = args.quote_context
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const serviceName = typeof rec.service_name === 'string' ? rec.service_name.trim() : ''
  const needForLead = typeof rec.need_for_lead === 'string' ? rec.need_for_lead.trim() : ''
  if (!serviceName || !needForLead) return null
  return { serviceName, needForLead }
}

/** Señales de pedido comercial (ES + EN): cartelería, letreros, cotización, etc. */
const LEAD_NEED_TOPIC =
  /\b(cartel|carteles|luminoso|luminosos|rótulo|rotulo|senaletica|señalética|restaurant|restaurante|impres|imprenta|banner|vinilo|letrero|ne[oó]n|neon|backlit|fachada|avenida|cotiz|cotización|presupuest|gran formato|wide\s*format|lettering|señal|tablero|sign|signs|signage|billboard|storefront|store\s+front|awning|facade|outdoor|indoor|acrylic|aluminum|metal|wood|plywood|pvc|size|format|black\s*cat|graphic|logo|printed|printing|business\s+owner|my business|front of my|for my business|make a|need a|need an|would like|looking for|trying to|get a|order a|quote|pricing|estimate)\b/i

const COMMERCIAL_NEED_FALLBACK =
  /\b(need|want|would like|looking for|trying to|make|get|order|buy|quote|estimate|sign|signage|cartel|luminoso|outdoor|indoor|large|big|small|custom|printed|wrap|vehicle|restaurant|store|shop|cat|avenue|front)\b/i

function stripLikelyPromptLeak(text: string): string {
  const idx = text.search(
    /\binterno\s*(108|90|100)\b|seg[uú]i el flujo de captura|transferencias internas|system\s+sos\s+recepcionista/i,
  )
  if (idx > 80) return text.slice(0, idx).trim()
  return text
}

/**
 * Si la tool va sin need/notes pero el cliente ya describió el trabajo en la llamada, usa esas frases.
 * Evita loops de missing_need cuando el modelo olvida pasar need en los argumentos.
 */
function inferLeadNeedFromRecapLines(transcript: string | null | undefined): string | null {
  const lines = parseTranscriptLines(transcript || '')
  for (const L of lines) {
    if (L.speaker !== 'assistant' && L.speaker !== 'unknown') continue
    const t = L.text
    if (!/\b(recap|summarize|resumen|so to recap|entonces|outdoor|indoor|sign|cartel|luminoso|quote)\b/i.test(t)) {
      continue
    }
    if (!LEAD_NEED_TOPIC.test(t) && !COMMERCIAL_NEED_FALLBACK.test(t)) continue
    const cleaned = stripLikelyPromptLeak(t).trim()
    if (cleaned.length >= 24) return cleaned.slice(0, 2000)
  }
  return null
}

function inferLeadNeedFromTranscript(transcript: string | null | undefined): string | null {
  const raw = (transcript || '').trim()
  if (raw.length < 15) return null
  const userLines = userOnlyText(raw)
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
  const hits = userLines.filter((s) => LEAD_NEED_TOPIC.test(s))
  let picked = hits.length ? hits : userLines.filter((s) => s.length >= 28)
  if (!picked.length) {
    picked = userLines.filter((s) => COMMERCIAL_NEED_FALLBACK.test(s) && s.length >= 14)
  }
  if (!picked.length) return null
  const merged = stripLikelyPromptLeak(picked.slice(-10).join('\n')).trim()
  return merged.length >= 3 ? merged.slice(0, 2000) : null
}

function inferWrapNeedFromText(text: string): {
  need: string
  vehicleType: string | null
  coverage: string | null
  designHelp: boolean
  timeline: string | null
} | null {
  const normalized = stripAccentsForMatch(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null
  const hasWrap =
    /\bwrap\b/.test(normalized) ||
    /\brap vehicular\b/.test(normalized) ||
    /\bcar wrap\b/.test(normalized) ||
    /rotulacion/.test(normalized) ||
    /vehicle wrap/.test(normalized) ||
    /vinilo vehicular/.test(normalized) ||
    /grafica vehicular/.test(normalized) ||
    /lettering vehicular/.test(normalized) ||
    /fleet graphics/.test(normalized)
  if (!hasWrap) return null

  const vehicleType = /\bford ranger\b/.test(normalized)
    ? 'Ford Ranger'
    : /\branger\b/.test(normalized)
      ? 'Ford Ranger'
      : /\bvan|furgoneta\b/.test(normalized)
    ? 'van'
    : /\b(auto|carro|car|vehiculo|vehículo)\b/.test(normalized)
    ? 'auto'
    : /\bcamioneta|truck|pickup\b/.test(normalized)
      ? 'camioneta'
      : null
  const coverage = /\bcompleto|complete|full|total\b/.test(normalized)
    ? 'completo'
    : /\bparcial|partial\b/.test(normalized)
      ? 'parcial'
      : null
  const designHelp =
    /\b(diseno|diseño|design|arte|artwork)\b/.test(normalized) &&
    /\b(ayuda|help|needs|need|necesito|necesita|sin|no tengo|hacer|make|from us|ustedes|swatworks)\b/.test(normalized)
  const timeline = /esta semana|this week/.test(normalized)
    ? 'esta semana'
    : /\burgente|urgent|cuanto antes/.test(normalized)
      ? 'urgente'
      : null
  const scope = coverage || 'completo'
  const vehicle = vehicleType || 'auto'
  const designText = designHelp ? 'necesita diseño' : 'consulta por diseño'
  const dueText = timeline || 'esta semana'
  const need = `Cotización de wrap vehicular ${scope} para ${vehicle}. Cliente ${designText}. Lo necesita ${dueText}.`

  return { need, vehicleType, coverage: coverage || 'completo', designHelp, timeline: timeline || 'esta semana' }
}

export async function executeToolHandler(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolContext,
) {
  const missing = (fields: string[], primary = 'Me falta un dato para continuar.') => ({
    ok: false as const,
    error: 'missing_required_fields' as const,
    missing_fields: fields,
    fields,
    primary_message_for_caller: primary,
  })

  switch (toolName) {
    case 'find_customer':
      if (!args.phone && !context.phone) return missing(['phone'])
      return runFindCustomer({
        organizationId: context.organizationId,
        phone: String(args.phone || context.phone || ''),
        name: typeof args.name === 'string' ? args.name : undefined,
      })
    case 'get_client_status': {
      if (!context.phone?.trim()) {
        return missing(['phone'])
      }
      return runGetJobStatus({
        organizationId: context.organizationId,
        phone: context.phone,
      })
    }
    case 'get_job_status': {
      const jobNumber =
        typeof args.job_number === 'string'
          ? args.job_number
          : typeof args.order_number === 'string'
            ? args.order_number
            : undefined
      return runGetJobStatus({
        organizationId: context.organizationId,
        jobNumber,
        phone: typeof args.phone === 'string' ? args.phone : context.phone,
      })
    }
    case 'create_appointment':
      if (!args.appointment_at) return missing(['appointment_at'])
      return runCreateAppointment({
        organizationId: context.organizationId,
        phone: String(args.phone || context.phone || ''),
        customerName: typeof args.customer_name === 'string' ? args.customer_name : undefined,
        appointmentAt: String(args.appointment_at || ''),
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      })
    case 'create_work_order':
      if (!args.title) return missing(['title'])
      return runCreateWorkOrder({
        organizationId: context.organizationId,
        phone: String(args.phone || context.phone || ''),
        customerName: typeof args.customer_name === 'string' ? args.customer_name : undefined,
        title: String(args.title || 'Nuevo trabajo'),
        issueDescription:
          typeof args.issue_description === 'string' ? args.issue_description : undefined,
      })
    case 'get_price_quote':
      if (!args.service_name) {
        const inferred = inferProductNameFromText(contextTextForTool(context))
        if (inferred) args.service_name = inferred
      }
      console.info('[vapi/tool-call] get_price_quote', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        service_name_preview: String(args.service_name ?? '').slice(0, 120),
        inferred_from_context: !args.service_name ? false : typeof args.service_name === 'string',
      })
      if (!args.service_name) return missing(['service_name'])
      return runGetPriceQuote({
        organizationId: context.organizationId,
        serviceName: String(args.service_name || ''),
        logContext: { toolCallId: context.vapiCallId || null, toolName: 'get_price_quote' },
      })
    case 'get_product_price': {
      if (!args.product_name && !args.service_name) {
        const inferred = inferProductNameFromText(contextTextForTool(context))
        if (inferred) args.product_name = inferred
      }
      const name =
        typeof args.product_name === 'string'
          ? args.product_name
          : typeof args.service_name === 'string'
            ? args.service_name
            : ''
      console.info('[vapi/tool-call] get_product_price', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        product_name_preview: name.slice(0, 120),
        inferred_from_context: Boolean(name && !('product_name' in args || 'service_name' in args)),
      })
      if (!name.trim()) return missing(['product_name'])
      return runGetPriceQuote({
        organizationId: context.organizationId,
        serviceName: name,
        logContext: { toolCallId: context.vapiCallId || null, toolName: 'get_product_price' },
      })
    }
    case 'save_lead_info': {
      console.log('[vapi/tool-call]', {
        callId: context.vapiCallId || null,
        toolName: 'save_lead_info',
        toolCallId: context.toolCallId || null,
        organization_id: context.organizationId,
        argKeys: Object.keys(args).slice(0, 32),
      })
      console.info('[vapi/tool-call] save_lead_info', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        arg_keys: Object.keys(args).slice(0, 24),
        has_phone_arg: Boolean(
          typeof args.phone === 'string' && String(args.phone).trim(),
        ),
        has_context_phone: Boolean(context.phone?.trim()),
      })
      const argContextText = [
        ...Object.entries(args)
          .filter(([, value]) => typeof value === 'string' || value === true)
          .map(([key, value]) => `${key}: ${value === true ? 'true' : value}`),
        args.design_help_needed === true ? 'needs design' : '',
        args.needs_design === true ? 'needs design' : '',
        args.design_needed === true ? 'needs design' : '',
      ]
        .filter(Boolean)
        .join('\n')
      const fallbackText = contextTextForTool(context, argContextText)
      const dictatedPhone = inferConfirmedPhoneFromText(fallbackText)
      const argPhone = typeof args.phone === 'string' ? normalizeDictatedDigits(args.phone) : ''
      const ctxPhone = context.phone ? normalizePhone(context.phone) : ''
      const phone = dictatedPhone || argPhone || ctxPhone || ''
      const phoneSource = dictatedPhone ? 'transcript' : argPhone ? 'tool_args' : ctxPhone ? 'caller_id' : 'missing'
      const emailDeclined = callerDeclinedEmail(fallbackText)
      const cleanedEmail = emailDeclined ? undefined : cleanOptionalEmail(args.email)
      const inferredEmailFromTx = emailDeclined
        ? undefined
        : inferSpokenEmailFromTranscript(context.transcript || '')
      const effectiveEmail = cleanedEmail || inferredEmailFromTx
      const argCompanyTrim = typeof args.company === 'string' ? args.company.trim() : ''
      const inferredCompanyFromTx = inferCompanyFromTranscript(context.transcript || '')
      const effectiveCompany =
        argCompanyTrim || inferredCompanyFromTx
          ? argCompanyTrim || inferredCompanyFromTx
          : undefined
      if (!phone) {
        return missing(['phone'], 'Me falta un dato para registrar tu solicitud.')
      }

      const first = typeof args.first_name === 'string' ? args.first_name.trim() : ''
      const last = typeof args.last_name === 'string' ? args.last_name.trim() : ''
      const full = typeof args.full_name === 'string' ? args.full_name.trim() : ''
      const nameOnly = typeof args.name === 'string' ? args.name.trim() : ''
      const promptAnswerName = inferNameAfterAssistantPrompt(context.transcript || '')
      const inferredFromPattern = inferFullNameFromText(fallbackText)
      const inferredFromConvo = inferFullNameFromConversation(context.transcript || '')
      const inferredName = promptAnswerName || inferredFromPattern || inferredFromConvo
      const modelArgsNameRaw = [first, last].filter(Boolean).join(' ').trim() || full || nameOnly || ''
      const modelArgsName = stripTrailingCompanyFromPersonName(modelArgsNameRaw)
      const modelNameLooksLikeFragment = /\b(es|soy|nombre|llamo|jos)\b/i.test(modelArgsName)
      const transcriptNameWins =
        leadFullNameValid(inferredName) && (!leadFullNameValid(modelArgsName) || modelNameLooksLikeFragment)
      let mergedName = transcriptNameWins
        ? inferredName
        : modelArgsName || inferredName || undefined
      mergedName = mergedName ? stripTrailingCompanyFromPersonName(mergedName) : undefined
      const nameSource = transcriptNameWins ? 'transcript' : modelArgsName ? 'tool_args' : inferredName ? 'transcript' : 'missing'

      const wrapFallback = inferWrapNeedFromText(fallbackText)
      const quoteContext = quoteContextFromArgs(args)
      const noteParts = [
        typeof args.notes === 'string' ? args.notes.trim() : '',
        typeof args.need === 'string' ? args.need.trim() : '',
        typeof args.summary === 'string' ? args.summary.trim() : '',
        typeof args.description === 'string' ? args.description.trim() : '',
        typeof args.project === 'string' ? args.project.trim() : '',
        typeof args.work_needed === 'string' ? args.work_needed.trim() : '',
        typeof args.motivo === 'string' ? args.motivo.trim() : '',
        typeof args.reason === 'string' ? args.reason.trim() : '',
        quoteContext?.needForLead || '',
        wrapFallback?.need || '',
      ].filter(Boolean)
      let mergedNotes = noteParts.join('\n').trim() || undefined
      if (!mergedNotes || mergedNotes.trim().length < 3) {
        const fromTranscript = inferLeadNeedFromTranscript(context.transcript || '')
        if (fromTranscript) mergedNotes = fromTranscript
      }
      if (!mergedNotes || mergedNotes.trim().length < 3) {
        const fromRecap = inferLeadNeedFromRecapLines(context.transcript || '')
        if (fromRecap) mergedNotes = fromRecap
      }

      const needPresent = Boolean(mergedNotes && mergedNotes.trim().length >= 3)
      const namePresent = leadFullNameValid(mergedName)
      const finalName = namePresent ? mergedName : 'Sin nombre'

      if (!namePresent) {
        console.info('[vapi/save-lead]', {
          toolCallId: context.toolCallId ?? null,
          organization_id: context.organizationId,
          full_name_present: false,
          phone_present: true,
          need_present: needPresent,
          inferred_name_present: Boolean(inferredName),
          saved: needPresent,
          leadId: null,
          error: needPresent ? null : 'missing_name',
          fallback_name: needPresent ? finalName : null,
        })
        if (!needPresent) {
          return {
            ok: false as const,
            error: 'missing_name' as const,
            primary_message_for_caller:
              'Disculpá, no pude guardar la solicitud todavía. Confirmame tu nombre y apellido.',
            assistant_instruction:
              'Say only primary_message_for_caller. Do not say the request was registered.',
          }
        }
      }

      if (!needPresent) {
        console.info('[vapi/save-lead]', {
          toolCallId: context.toolCallId ?? null,
          organization_id: context.organizationId,
          full_name_present: true,
          phone_present: true,
          need_present: false,
          saved: false,
          leadId: null,
          error: 'missing_need',
        })
        return {
          ok: false as const,
          error: 'missing_need' as const,
          primary_message_for_caller:
            'Disculpá, todavía no pude guardar la solicitud. Confirmame qué necesitás cotizar.',
          assistant_instruction:
            'Say only primary_message_for_caller. Do not say the request was registered.',
        }
      }

      let commercial = parseModelLeadClassification(args)
      const sniff = classificationSourceText(
        mergedNotes ? [...noteParts, mergedNotes] : noteParts,
      )
      if (wrapFallback || detectWrapIntent(sniff)) {
        commercial = {
          category: 'wrap',
          intent: commercial.intent || 'quote_request',
          priority: 'high',
          estimated_value_level: 'high',
          summary:
            commercial.summary ||
            'Cliente solicita cotización para wrap vehicular.',
          next_action:
            commercial.next_action ||
            'Llamar para revisar vehículo, alcance del trabajo y preparar cotización.',
          source: commercial.source || 'vapi_call',
          callback_required: true,
          vehicle_type: wrapFallback?.vehicleType || commercial.vehicle_type,
          wrap_scope: wrapFallback?.coverage || commercial.wrap_scope,
          design_help_needed: wrapFallback?.designHelp ?? commercial.design_help_needed,
          timeline: wrapFallback?.timeline || commercial.timeline,
        }
      } else if (quoteContext) {
        commercial = {
          ...commercial,
          category: commercial.category || 'catalog_quote',
          intent: commercial.intent || 'quote_request',
          priority: commercial.priority || 'normal',
          estimated_value_level: commercial.estimated_value_level || 'low_medium',
          summary: commercial.summary || quoteContext.needForLead,
          next_action: commercial.next_action || `Enviar cotización formal de ${quoteContext.serviceName}.`,
          source: commercial.source || 'vapi_call',
          callback_required: commercial.callback_required ?? true,
        }
      } else if (!commercial.category && sniff) {
        commercial = {
          ...commercial,
          category: commercial.category || 'general_quote',
          intent: commercial.intent || 'inquiry',
          priority: commercial.priority || 'normal',
          estimated_value_level: commercial.estimated_value_level || 'low_medium',
          source: commercial.source || 'vapi_call',
        }
      }

      const metaBlock = buildCommercialMetaBlock(commercial)
      const notesWithMeta = prependCommercialBlockToNotes(metaBlock, mergedNotes)
      const teamMemberMatch = await findTeamMemberByPhoneOrName({
        organizationId: context.organizationId,
        phone,
        name: mergedName,
      }).catch((error) => {
        console.warn('[vapi/save-lead] team_member_match_lookup_failed', {
          organization_id: context.organizationId,
          message: error instanceof Error ? error.message : String(error),
        })
        return null
      })

      console.info('[vapi/lead-classification]', {
        toolCallId: context.toolCallId || null,
        input: {
          has_need: Boolean(typeof args.need === 'string' && args.need.trim()),
          has_motivo: Boolean(typeof args.motivo === 'string' && args.motivo.trim()),
        },
        category: commercial.category ?? null,
        intent: commercial.intent ?? null,
        priority: commercial.priority ?? null,
        estimated_value_level: commercial.estimated_value_level ?? null,
        next_action: commercial.next_action ? String(commercial.next_action).slice(0, 160) : null,
        wrap_sniff: detectWrapIntent(sniff),
      })

      const out = await runSaveLeadInfo({
        organizationId: context.organizationId,
        phone,
        name: finalName,
        email: effectiveEmail,
        company: effectiveCompany,
        notes: notesWithMeta || mergedNotes,
        commercialSnapshot: commercial,
        vapiCallId: context.vapiCallId ?? null,
      })

      if (out.ok) {
        const displayCustomerName =
          namePresent && mergedName ? mergedName : out.customer?.name ?? finalName
        let callLogLink:
          | {
              callLogId: string | null
              beforeCustomerId: string | null
              afterCustomerId: string | null
              afterLeadId: string | null
            }
          | null = null
        if (context.vapiCallId && out.customer?.id) {
          callLogLink = await patchCallLogLeadCustomer({
            organizationId: context.organizationId,
            vapiCallId: context.vapiCallId,
            customerId: out.customer.id,
            leadId: out.lead?.id ?? null,
            customerName: displayCustomerName,
          }).catch((error) => {
            console.warn('[vapi/save-lead] call_log_link_failed', {
              toolCallId: context.toolCallId ?? null,
              organization_id: context.organizationId,
              vapi_call_id: context.vapiCallId || null,
              saved_customer_id: out.customer?.id ?? null,
              saved_lead_id: out.lead?.id ?? null,
              message: error instanceof Error ? error.message : String(error),
            })
            return null
          })
        }
        console.info('[vapi/save-lead] name_resolution', {
          toolCallId: context.toolCallId ?? null,
          organization_id: context.organizationId,
          model_args_name: modelArgsName || null,
          transcript_name: inferredName || null,
          caller_id_phone: ctxPhone || null,
          dictated_phone: dictatedPhone || null,
          existing_customer_name: out.customer?.name ?? null,
          team_member_match: teamMemberMatch
            ? {
                id: (teamMemberMatch as { id?: string }).id ?? null,
                name: (teamMemberMatch as { name?: string | null }).name ?? null,
                phone_suffix:
                  typeof (teamMemberMatch as { phone?: string | null }).phone === 'string'
                    ? String((teamMemberMatch as { phone?: string }).phone).replace(/\D/g, '').slice(-4)
                    : null,
              }
            : null,
          current_call_name: namePresent ? mergedName ?? null : null,
          existing_contact_name: out.customer?.name ?? null,
          final_saved_name: displayCustomerName,
          final_saved_phone: out.customer?.phone ?? phone,
          name_source: namePresent ? nameSource : 'fallback_sin_nombre',
          phone_source: phoneSource,
          saved_customer_id: out.customer?.id ?? null,
          saved_lead_id: out.lead?.id ?? null,
          call_log_customer_id_before: callLogLink?.beforeCustomerId ?? null,
          call_log_customer_id_after: callLogLink?.afterCustomerId ?? null,
          call_log_lead_id_after: callLogLink?.afterLeadId ?? null,
        })
        console.info('[vapi/save-lead]', {
          toolCallId: context.toolCallId ?? null,
          organization_id: context.organizationId,
          full_name_present: true,
          phone_present: true,
          need_present: true,
          saved: true,
          leadId: out.lead?.id ?? null,
          error: null,
        })
        try {
          let skipTelegram = false
          if (context.vapiCallId) {
            const idem = await getVapiCallIdempotencyFlags({
              organizationId: context.organizationId,
              vapiCallId: context.vapiCallId,
            })
            skipTelegram = idem.telegramSaveLeadSent
          }
          let tgOk = false
          if (skipTelegram) {
            console.info('[vapi/save-lead] telegram_skipped_idempotent', {
              leadId: out.lead?.id ?? null,
              vapi_call_id: context.vapiCallId || null,
            })
          } else {
            const runtime = await getOrganizationRuntimeConfig(context.organizationId)
            tgOk = await notifySavedLeadTelegram({
              organizationName: runtime.organizationDisplayName,
              customerName: displayCustomerName,
              phone: out.customer?.phone ?? phone,
              email: effectiveEmail ?? null,
              company: effectiveCompany ?? null,
              need: mergedNotes || '',
              priceRequested: commercial.intent === 'quote_request',
              dateNeeded: typeof args.date_needed === 'string' ? args.date_needed : null,
              category: commercial.category || null,
              summary: commercial.summary || null,
              nextAction: commercial.next_action || null,
            })
            console.info('[vapi/save-lead] telegram', { sent: tgOk, leadId: out.lead?.id ?? null })
            if (tgOk && context.vapiCallId) {
              await mergeCallLogStructuredByVapiCallId({
                organizationId: context.organizationId,
                vapiCallId: context.vapiCallId,
                patch: { telegram_save_lead_sent: true },
              })
            }
          }
        } catch (tgErr) {
          console.error('[vapi/save-lead] telegram_error', tgErr)
        }
        await tryAutoFollowUpAfterLeadSave({
          organizationId: context.organizationId,
          phone,
          vapiCallId: context.vapiCallId,
          toolCallId: context.toolCallId ?? null,
          leadId: out.lead?.id ?? null,
          commercial,
          customerName: finalName,
          args,
        })
      } else {
        console.info('[vapi/save-lead]', {
          toolCallId: context.toolCallId ?? null,
          organization_id: context.organizationId,
          full_name_present: true,
          phone_present: true,
          need_present: true,
          saved: false,
          leadId: null,
          error: out.error,
        })
        return {
          ...out,
          primary_message_for_caller:
            out.error === 'missing_name'
              ? 'Disculpá, no pude guardar la solicitud todavía. Confirmame tu nombre y apellido.'
              : 'Disculpá, no pude guardar la solicitud todavía. Confirmame los datos para intentarlo de nuevo.',
          assistant_instruction:
            'Say only primary_message_for_caller. Do not say the request was registered.',
        }
      }

      return out
    }
    case 'prepare_warm_transfer': {
      const rawArgsPhone = typeof args.phone === 'string' ? args.phone : ''
      const ctxPhone = context.phone || ''
      let transferDepartment = strArg(args, 'transfer_department')
      const transferPerson = strArg(args, 'transfer_person')
      let transferExtension = strArg(args, 'transfer_extension')
      const intent = strArg(args, 'intent')
      const shortSummary = strArg(args, 'short_summary')
      let language = normalizeTransferLanguage(strArg(args, 'language'))
      const contextText = [
        context.latestUserText || '',
        context.transcript || '',
        context.callSummary || '',
        intent,
        shortSummary,
      ].filter(Boolean).join('\n')
      const inferredDestination =
        !transferDepartment && !transferPerson && !transferExtension
          ? inferTransferDestinationFromText(contextText)
          : null
      if (inferredDestination) {
        transferDepartment = inferredDestination.department
        transferExtension = inferredDestination.extension || ''
        language = language || inferredDestination.language
      }
      const requestedDestination =
        transferDepartment || transferPerson || intent || shortSummary || transferExtension
      const chosenPhoneSource =
        rawArgsPhone.trim() ? 'tool_args.phone' : ctxPhone.trim() ? 'webhook_context.phone' : 'none'
      console.log('[vapi/tool-handlers] prepare_warm_transfer input', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        transfer_department: transferDepartment || null,
        transfer_person: transferPerson || null,
        transfer_extension: transferExtension || null,
        language: language || null,
        intent_preview:
          intent ? intent.slice(0, 200) : null,
        short_summary_set: Boolean(shortSummary),
        inferred_destination: inferredDestination
          ? {
              department: inferredDestination.department,
              extension: inferredDestination.extension,
              language: inferredDestination.language,
              reason: inferredDestination.reason,
            }
          : null,
        context_text_preview: contextText ? contextText.slice(0, 220) : null,
        context_phone_suffix: ctxPhone.length >= 4 ? ctxPhone.slice(-4) : null,
        args_phone_suffix: rawArgsPhone.length >= 4 ? rawArgsPhone.slice(-4) : null,
        chosen_phone_source: chosenPhoneSource,
      })
      if (!requestedDestination.trim()) {
        console.warn('[vapi/tool-handlers] prepare_warm_transfer FAIL missing transfer destination', {
          failure_code: 'missing_transfer_destination',
          organization_id: context.organizationId,
          vapi_call_id: context.vapiCallId || null,
          loop_prevention_result: 'returned_transfer_destination_needed_instead_of_missing_transfer_destination',
        })
        return {
          ok: false as const,
          error: 'transfer_destination_needed' as const,
          primary_message_for_caller:
            language === 'en'
              ? 'Which department or person should I transfer you to?'
              : '¿Con qué departamento o persona querés que te transfiera?',
        }
      }
      if (!context.vapiCallId) {
        console.warn(
          '[vapi/tool-handlers] prepare_warm_transfer FAIL missing vapi_call_id → ok:false (missing_required_fields)',
          {
            failure_code: 'missing_required_fields:vapi_call_id',
            organization_id: context.organizationId,
            context_phone_suffix: ctxPhone.length >= 4 ? ctxPhone.slice(-4) : null,
            args_phone_suffix: rawArgsPhone.length >= 4 ? rawArgsPhone.slice(-4) : null,
          },
        )
        return missing(['vapi_call_id'])
      }
      if (!args.phone && !context.phone) {
        console.warn(
          '[vapi/tool-handlers] prepare_warm_transfer FAIL missing phone in args and webhook → ok:false (missing_required_fields)',
          {
            failure_code: 'missing_required_fields:phone',
            organization_id: context.organizationId,
            vapi_call_id: context.vapiCallId,
          },
        )
        return missing(['phone'])
      }
      await saveAndNotifyTransferRequestLead({
        organizationId: context.organizationId,
        vapiCallId: context.vapiCallId,
        phone: String(args.phone || context.phone || ''),
        args,
        requestedDepartment: transferDepartment || transferPerson || requestedDestination,
        language,
      })
      console.info('[vapi/tool-handlers] prepare_warm_transfer minimal_transfer_lead_requested', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        requested_department: transferDepartment || transferPerson || requestedDestination,
        language: language || null,
        phone_suffix: String(args.phone || context.phone || '').slice(-4) || null,
        inferred: Boolean(inferredDestination),
      })
      const prepared = await runPrepareWarmTransfer({
        organizationId: context.organizationId,
        vapiCallId: context.vapiCallId,
        phone: String(args.phone || context.phone || ''),
        customerName: typeof args.customer_name === 'string' ? args.customer_name : null,
        orderNumber: typeof args.order_number === 'string' ? args.order_number : null,
        intent: intent || null,
        shortSummary: shortSummary || null,
        transferExtension: transferExtension || null,
        transferDepartment: transferDepartment || null,
        transferPerson: transferPerson || null,
        language,
      })
      console.info('[vapi/tool-handlers] prepare_warm_transfer result', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        ok: Boolean(prepared && typeof prepared === 'object' && 'ok' in prepared && prepared.ok),
        error:
          prepared && typeof prepared === 'object' && 'error' in prepared
            ? prepared.error
            : null,
      })
      return prepared
    }
    case 'transfer_to_ramon': {
      const fromArgs =
        typeof args.call_log_id === 'string' && args.call_log_id.trim()
          ? args.call_log_id.trim()
          : null
      const callLogId =
        fromArgs ||
        (context.vapiCallId
          ? await getCallLogIdByVapiCallId(context.organizationId, context.vapiCallId)
          : null)
      if (!callLogId) {
        console.info('[vapi/transfer-routing]', {
          input: 'transfer_to_ramon',
          matchedName: null,
          matchedRole: null,
          matchedDepartment: null,
          transferExtension: null,
          transferPhone: null,
          found: true,
          prepared: true,
          transferred: true,
          error: null,
          note: 'native_transfer_no_call_log_row',
        })
        console.info('[vapi/tool-handlers] transfer_to_ramon result', {
          organization_id: context.organizationId,
          vapi_call_id: context.vapiCallId || null,
          ok: true,
          native_transfer: true,
          call_log_id: null,
        })
        return { ok: true, native_transfer: true }
      }
      const pt = await persistTransfer({
        organizationId: context.organizationId,
        callLogId,
        reason: String(args.reason || 'Transfer requested by caller'),
        urgent: Boolean(args.urgent),
      })
      console.info('[vapi/transfer-routing]', {
        input: 'transfer_to_ramon',
        matchedName: null,
        matchedRole: null,
        matchedDepartment: null,
        transferExtension: null,
        transferPhone: null,
        found: true,
        prepared: true,
        transferred: true,
        error: null,
        call_log_id: callLogId,
      })
      console.info('[vapi/tool-handlers] transfer_to_ramon result', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        ok: Boolean(pt && typeof pt === 'object' && 'ok' in pt ? pt.ok : pt),
        call_log_id: callLogId,
      })
      return pt
    }
    case 'save_call_outcome':
      if (!args.phone && !context.phone) return missing(['phone'])
      return persistCallArtifacts({
        organizationId: context.organizationId,
        vapiCallId: context.vapiCallId,
        phone: String(args.phone || context.phone || ''),
        customerName: typeof args.customer_name === 'string' ? args.customer_name : undefined,
        intent: typeof args.intent === 'string' ? args.intent : undefined,
        transcript: typeof args.transcript === 'string' ? args.transcript : undefined,
        summary: typeof args.summary === 'string' ? args.summary : undefined,
        outcome: typeof args.result === 'string' ? args.result : undefined,
        nextAction: typeof args.next_action === 'string' ? args.next_action : undefined,
        callbackRequired: Boolean(args.callback_required),
        followUpDate: typeof args.follow_up_date === 'string' ? args.follow_up_date : undefined,
        spamScore: typeof args.spam_score === 'number' ? args.spam_score : undefined,
        ended: true,
      })
    case 'mark_spam_call':
      if (!args.phone && !context.phone) return missing(['phone'])
      return runMarkSpamCall({
        organizationId: context.organizationId,
        vapiCallId: context.vapiCallId,
        phone: String(args.phone || context.phone || ''),
        reason: typeof args.reason === 'string' ? args.reason : undefined,
        spamScore: typeof args.spam_score === 'number' ? args.spam_score : undefined,
      })
    case 'create_follow_up': {
      console.log('[vapi/tool-call]', {
        callId: context.vapiCallId || null,
        toolName: 'create_follow_up',
        toolCallId: context.toolCallId || null,
        organization_id: context.organizationId,
        argKeys: Object.keys(args).slice(0, 32),
      })
      console.info('[vapi/tool-call] create_follow_up', {
        organization_id: context.organizationId,
        vapi_call_id: context.vapiCallId || null,
        title_preview: String(args.title ?? '').slice(0, 120),
        callback_required: Boolean(args.callback_required),
      })
      const followUpContext = contextTextForTool(
        context,
        typeof args.category === 'string' ? args.category : '',
        typeof args.intent === 'string' ? args.intent : '',
        typeof args.summary === 'string' ? args.summary : '',
        typeof args.notes === 'string' ? args.notes : '',
      )
      const isWrapFollowUp =
        detectWrapIntent(followUpContext) ||
        String(args.category || '').toLowerCase().trim() === 'wrap'
      const isQuoteFollowUp =
        isWrapFollowUp ||
        String(args.intent || '').toLowerCase().trim() === 'quote_request' ||
        /\b(cotizacion|cotización|quote)\b/i.test(stripAccentsForMatch(followUpContext))
      if (!args.title && isWrapFollowUp) {
        args.title = 'Llamar por cotización de wrap vehicular'
      } else if (!args.title && isQuoteFollowUp) {
        args.title = 'Seguimiento: cotización solicitada'
      }
      if (!args.title)
        return missing(
          ['title'],
          'Me falta un dato para registrar el seguimiento.',
        )
      const prep = prepareCommercialFollowUpFromArgs(args)

      let callLogId: string | undefined =
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
      if (!callLogId && context.vapiCallId) {
        savedLink = await getCallLogLeadCustomerContext({
          organizationId: context.organizationId,
          vapiCallId: context.vapiCallId,
        })
        callLogId = savedLink.callLogId || undefined
      }
      if (!savedLink && context.vapiCallId) {
        savedLink = await getCallLogLeadCustomerContext({
          organizationId: context.organizationId,
          vapiCallId: context.vapiCallId,
        })
      }
      const explicitCustomerId =
        typeof args.customer_id === 'string' && args.customer_id.trim()
          ? args.customer_id.trim()
          : undefined
      const finalCustomerId = savedLink?.customerId || explicitCustomerId
      const finalLeadId = savedLink?.leadId || undefined

      try {
        const out = await persistFollowUp({
          organizationId: context.organizationId,
          callLogId,
          phone: typeof args.phone === 'string' ? args.phone : context.phone,
          customerId: finalCustomerId,
          leadId: finalLeadId,
          title: prep.title,
          notes: prep.notesMerged,
          owner: typeof args.owner === 'string' ? args.owner : undefined,
          dueAt: prep.dueAt,
          priority: prep.priority,
          callbackRequired: prep.callbackRequired,
        })
        const fu = out && typeof out === 'object' && 'follow_up' in out ? (out as { follow_up?: { id?: string } }).follow_up : null
        console.info('[vapi/follow-up]', {
          source: 'tool' as const,
          toolCallId: context.toolCallId || null,
          callId: context.vapiCallId || null,
          organization_id: context.organizationId,
          title: prep.title.slice(0, 120),
          category: prep.category,
          priority: prep.priority ?? null,
          due_at: prep.dueAt ?? null,
          callback_required: prep.callbackRequired,
          created: true,
          followUpId: fu?.id ?? null,
          table: 'follow_ups',
          error: null,
          saved_customer_id: savedLink?.customerId ?? null,
          saved_lead_id: savedLink?.leadId ?? null,
          follow_up_customer_id_before: explicitCustomerId ?? null,
          follow_up_customer_id_after:
            typeof (out as { follow_up?: { customer_id?: string | null } }).follow_up?.customer_id === 'string'
              ? (out as { follow_up?: { customer_id?: string } }).follow_up?.customer_id
              : finalCustomerId ?? null,
          follow_up_lead_id_after:
            typeof (out as { follow_up?: { lead_id?: string | null } }).follow_up?.lead_id === 'string'
              ? (out as { follow_up?: { lead_id?: string } }).follow_up?.lead_id
              : finalLeadId ?? null,
          follow_up_title_final: prep.title,
        })
        return out
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[vapi/follow-up]', {
          source: 'tool' as const,
          toolCallId: context.toolCallId || null,
          callId: context.vapiCallId || null,
          organization_id: context.organizationId,
          title: prep.title.slice(0, 120),
          category: prep.category,
          priority: prep.priority ?? null,
          due_at: prep.dueAt ?? null,
          callback_required: prep.callbackRequired,
          created: false,
          followUpId: null,
          table: 'follow_ups',
          error: msg.slice(0, 400),
          saved_customer_id: savedLink?.customerId ?? null,
          saved_lead_id: savedLink?.leadId ?? null,
          follow_up_customer_id_before: explicitCustomerId ?? null,
          follow_up_customer_id_after: finalCustomerId ?? null,
          follow_up_lead_id_after: finalLeadId ?? null,
          follow_up_title_final: prep.title,
        })
        return {
          ok: false as const,
          error: 'follow_up_failed' as const,
          primary_message_for_caller:
            'No pude registrar el seguimiento en el sistema. Podemos intentar de nuevo en un momento.',
          assistant_instruction:
            'Say only primary_message_for_caller. Do not say the follow-up or callback was created.',
        }
      }
    }
    default:
      console.warn('[vapi/tool-call] unknown_tool_no_handler', { toolName })
      return {
        ok: false as const,
        error: 'unknown_tool' as const,
        toolName,
      }
  }
}
