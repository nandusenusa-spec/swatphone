import type { LeadCommercialFields } from '@/lib/vapi/lead-classification'
import { normalizePhone } from '@/lib/phone'
import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import { classifyCall } from '@/lib/voice-platform/classifier'
import type { StructuredExtraction } from '@/lib/voice-platform/types'
import {
  createAppointment,
  createFollowUp,
  createNotification,
  createTransferRecord,
  createWorkOrder,
  findOrCreateCustomer,
  findWorkOrder,
  getOrgVoiceSettings,
  getPriceQuote,
  insertCallClassification,
  followUpCountForCallLog,
  upsertLeadByPhone,
  upsertCustomerLeadInfo,
  upsertCallLog,
} from '@/lib/voice-platform/repository'
import {
  expandPriceLookupTerms,
  normalizeVoiceProductQuery,
  mentionsBusinessCardsProductFamily,
  hasBusinessCardsSkuQuantityInQuery,
  detectedBusinessCardsQuantityFromInput,
} from '@/lib/voice-platform/price-lookup-terms'
import { logPriceLookup, type PriceLookupSearchMeta } from '@/lib/voice-platform/price-lookup-log'
import { logProductSuggestion } from '@/lib/voice-platform/product-suggestion-log'
import type { QuoteRow } from '@/lib/voice-platform/repository'
import {
  allQuoteRowsLookLikeBusinessCardsCatalog,
  listBusinessCardsProductVariants,
  parseBusinessCardsCatalogQty,
  sortQuoteRowsByBusinessCardsCatalogQty,
} from '@/lib/voice-platform/repository'
import { workOrderStatusForVoice } from '@/lib/voice-platform/work-order-voice'

function formatPriceForVoiceUnit(unit: unknown, currency: string | null): string {
  const n = typeof unit === 'number' ? unit : Number(unit)
  const cur = (currency || 'USD').toUpperCase()
  if (!Number.isFinite(n) || n <= 0) return 'precio a confirmar con el equipo'
  if (cur === 'USD') return `USD ${n}`
  return `${cur} ${n}`
}

function allQuotesHaveConfirmedNumericPrice(rows: QuoteRow[]): boolean {
  return rows.every((r) => {
    const n = typeof r.unit_price === 'number' ? r.unit_price : Number(r.unit_price)
    return Number.isFinite(n) && n > 0
  })
}

function buildBusinessCardsVariantsAssistantInstruction(rows: QuoteRow[]): string {
  const sorted = sortQuoteRowsByBusinessCardsCatalogQty(rows)
  const parts = sorted.map(
    (q) => `${q.service_name} por ${formatPriceForVoiceUnit(q.unit_price, q.currency)}`,
  )
  const listLine = `Decí al cliente, en pocas palabras: tenemos ${parts.join(' y ')}. ¿Cuál cantidad le interesa?`
  const has500 = sorted.some((q) => parseBusinessCardsCatalogQty(q.service_name) === 500)
  const has1000 = sorted.some((q) => parseBusinessCardsCatalogQty(q.service_name) === 1000)
  const rec =
    has500 && has1000
      ? ' Si preguntan qué conviene más, podés orientar: 500 suele servir para empezar; 1000 conviene más si las usan seguido porque la diferencia de precio entre esas dos opciones suele ser baja (no inventes montos: solo compará en términos generales y usá los precios exactos de quotes).'
      : ''
  const close =
    ' Cuando elija cantidad, llamá de nuevo get_product_price o get_price_quote con el product_name o service_name exacto del artículo elegido (como en quotes). Solo usá nombres y precios que vienen en quotes.'
  return `${listLine}${rec}${close}`
}

export async function runFindCustomer(input: {
  organizationId: string
  phone: string
  name?: string
}) {
  const customer = await findOrCreateCustomer({
    organizationId: input.organizationId,
    phone: input.phone,
    name: input.name,
  })
  return {
    found: true,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      company: (customer as { company?: string | null }).company ?? null,
    },
  }
}

export async function runGetJobStatus(input: {
  organizationId: string
  jobNumber?: string
  phone?: string
}) {
  const jobs = await findWorkOrder({
    organizationId: input.organizationId,
    jobNumber: input.jobNumber,
    phone: input.phone,
  })
  if (!jobs.matches.length) {
    return {
      found: false,
      primary_message_for_caller:
        'No encontramos un pedido o trabajo registrado con ese dato. Si tenés número de orden, decilo; si no, un asesor puede ayudarte.',
    }
  }
  const mapped = jobs.matches.map((j: Record<string, unknown>) => {
    const voice = workOrderStatusForVoice(j)
    return {
      id: j.id,
      work_order_number: j.work_order_number || j.order_number,
      status: j.status,
      tracking_phase: voice.tracking_phase,
      title: (j.title as string | undefined) || null,
      estimated_delivery_at: j.estimated_delivery_at || j.promised_date,
      confirmed_delivery_at: j.confirmed_delivery_at || j.pickup_ready_at,
      owner: j.owner || j.assigned_to,
      pickup_ready: voice.pickup_ready,
      caller_message_es: voice.client_message_es,
    }
  })
  const first = mapped[0]
  const pickupReady = Boolean(first?.pickup_ready)
  return {
    found: true,
    ambiguous: jobs.ambiguous,
    primary_message_for_caller: first?.caller_message_es ?? '',
    tracking_phase: first?.tracking_phase ?? 'other',
    tracking_summary: {
      phase: first?.tracking_phase ?? 'other',
      pickup_ready: pickupReady,
    },
    pickup_ready: pickupReady,
    title: first?.title ?? null,
    jobs: mapped,
  }
}

export async function runCreateAppointment(input: {
  organizationId: string
  phone: string
  customerName?: string
  appointmentAt: string
  notes?: string
  callLogId?: string
}) {
  const customer = await findOrCreateCustomer({
    organizationId: input.organizationId,
    phone: input.phone,
    name: input.customerName,
  })
  const appointment = await createAppointment({
    organizationId: input.organizationId,
    customerId: customer.id,
    appointmentAt: input.appointmentAt,
    notes: input.notes,
    callLogId: input.callLogId,
  })
  return { ok: true, appointment }
}

export async function runCreateWorkOrder(input: {
  organizationId: string
  phone: string
  customerName?: string
  title: string
  issueDescription?: string
}) {
  const customer = await findOrCreateCustomer({
    organizationId: input.organizationId,
    phone: input.phone,
    name: input.customerName,
  })
  const order = await createWorkOrder({
    organizationId: input.organizationId,
    customerId: customer.id,
    title: input.title,
    issueDescription: input.issueDescription,
  })
  return { ok: true, work_order: order }
}

export async function runGetPriceQuote(input: {
  organizationId: string
  serviceName: string
  logContext?: { toolCallId?: string | null; toolName?: string | null }
}) {
  const inputName = input.serviceName.trim()
  const normalizedName = normalizeVoiceProductQuery(inputName)
  const terms = expandPriceLookupTerms(input.serviceName)
  let rows: QuoteRow[] = []
  let winningTerm = ''
  let lastSearchMeta: PriceLookupSearchMeta | null = null
  let winningSearchMeta: PriceLookupSearchMeta | null = null
  for (const term of terms) {
    const { rows: chunk, searchMeta } = await getPriceQuote({
      organizationId: input.organizationId,
      serviceName: term,
      logContext: { inputName, normalizedName },
    })
    lastSearchMeta = searchMeta
    if (chunk.length) {
      rows = chunk
      winningTerm = term
      winningSearchMeta = searchMeta
      break
    }
  }

  if (
    rows.length === 0 &&
    mentionsBusinessCardsProductFamily(inputName) &&
    !hasBusinessCardsSkuQuantityInQuery(inputName)
  ) {
    const variants = await listBusinessCardsProductVariants(input.organizationId)
    if (variants.length) {
      rows = variants
      winningTerm = '__business_cards_variants__'
      winningSearchMeta = lastSearchMeta
      logProductSuggestion({
        inputName,
        normalizedName,
        detectedProductFamily: 'business_cards',
        detectedQuantity: detectedBusinessCardsQuantityFromInput(inputName),
        suggestedProducts: variants.map((v) => ({
          id: v.source_row_id,
          name: v.service_name,
          unit_price: v.unit_price,
          currency: v.currency,
        })),
      })
    }
  }

  if (rows.length > 1 && allQuoteRowsLookLikeBusinessCardsCatalog(rows)) {
    rows = sortQuoteRowsByBusinessCardsCatalogQty(rows)
  }

  const first = rows[0]
  const numericPrice = (v: unknown) => {
    if (v == null) return NaN
    if (typeof v === 'number') return v
    const n = Number(v)
    return Number.isFinite(n) ? n : NaN
  }
  const firstPrice = first ? numericPrice(first.unit_price) : NaN
  const priceNeedsTeamConfirm =
    Boolean(first) &&
    (first.unit_price == null || !Number.isFinite(firstPrice) || firstPrice <= 0)

  const isBusinessCardsMultiVariantOffer =
    rows.length > 1 &&
    allQuoteRowsLookLikeBusinessCardsCatalog(rows) &&
    allQuotesHaveConfirmedNumericPrice(rows)

  const mustConfirmPriceWithTeam =
    rows.length === 0 ||
    (rows.length > 1 && !isBusinessCardsMultiVariantOffer) ||
    (rows.length === 1 && priceNeedsTeamConfirm)

  const metaForLog = winningSearchMeta ?? lastSearchMeta
  logPriceLookup({
    toolCallId: input.logContext?.toolCallId,
    toolName: input.logContext?.toolName,
    inputName,
    normalizedName,
    organization_id: input.organizationId,
    tableQueried: metaForLog?.tableQueried ?? 'none',
    queryFilters: metaForLog?.queryFilters ?? { reason: 'no_query_meta' },
    resultCount: rows.length,
    matchedName: first?.service_name ?? null,
    matchedId: first?.source_row_id ?? null,
    mustConfirmPriceWithTeam,
    termsTried: terms,
    winningTerm: winningTerm || undefined,
  })

  const quotes = rows.map((r: QuoteRow) => ({
    service_name: r.service_name,
    unit_price: r.unit_price,
    currency: r.currency,
    description: r.description,
    catalog_source: r.source,
  }))

  if (rows.length === 0) {
    const triedNote =
      terms.length > 1
        ? ' Se probaron términos relacionados (p. ej. cantidad + producto, BC, business cards, tarjetas).'
        : ''
    return {
      found: false,
      match_count: 0,
      quotes,
      must_confirm_price_with_team: true,
      lookup_terms_tried: terms,
      assistant_instruction:
        `No hay precio publicado en el catálogo para esa búsqueda.${triedNote} Decí al cliente, en una frase breve: "No tengo un precio confirmado para eso. Te tomo los datos y el equipo te envía una cotización." Luego save_lead_info (nombre y apellido, teléfono si el cliente lo dio, qué necesita) y, si prometés cotización o contacto, create_follow_up antes de despedirte. No inventes montos.`,
    }
  }

  if (rows.length > 1) {
    if (isBusinessCardsMultiVariantOffer) {
      logProductSuggestion({
        inputName,
        normalizedName,
        detectedProductFamily: 'business_cards',
        detectedQuantity: detectedBusinessCardsQuantityFromInput(inputName),
        suggestedProducts: rows.map((v) => ({
          id: v.source_row_id,
          name: v.service_name,
          unit_price: v.unit_price,
          currency: v.currency,
        })),
      })
      return {
        found: true,
        match_count: rows.length,
        quotes: quotes.slice(0, 8),
        must_confirm_price_with_team: false,
        assistant_instruction: buildBusinessCardsVariantsAssistantInstruction(rows),
      }
    }
    return {
      found: true,
      match_count: rows.length,
      quotes: quotes.slice(0, 5),
      must_confirm_price_with_team: true,
      assistant_instruction:
        'Hay varias coincidencias: leé nombre y precio tal cual vienen en quotes (sin redondear). Si el cliente no elige, pedí aclaración o ofrecé pasar con un asesor.',
    }
  }

  if (priceNeedsTeamConfirm) {
    return {
      found: true,
      match_count: 1,
      quotes,
      must_confirm_price_with_team: true,
      assistant_instruction:
        'Hay coincidencia en catálogo pero el precio no está confirmado o es referencial (p. ej. cotización por volumen). Decí que el equipo confirma el monto; no inventes cifra. Si aún no guardaste lead, usá save_lead_info y create_follow_up si prometés cotización.',
    }
  }

  return {
    found: true,
    match_count: 1,
    quotes,
    must_confirm_price_with_team: false,
    assistant_instruction:
      'Comunicá solo el precio y moneda de quotes[0]; no agregues cargos que no figuren en el sistema.',
  }
}

export async function runTransferToRamon(input: {
  organizationId: string
  callLogId: string
  reason: string
  urgent?: boolean
}) {
  const runtime = await getOrganizationRuntimeConfig(input.organizationId)
  const policy = runtime.transferPolicy
  const dests = policy.transferDestinations

  const fromRuntimePhone =
    (input.urgent && policy.urgentTransferNumber) ||
    policy.ramonTransferNumber ||
    policy.defaultTransferNumber ||
    (dests[0]?.phoneE164 ?? null)

  const fromRuntimeName = policy.callbackDefaultOwner || dests[0]?.name || 'Ramon'

  const settings = await getOrgVoiceSettings(input.organizationId)
  const ramonPhone =
    fromRuntimePhone || settings?.transfer_target_phone || process.env.TWILIO_FORWARD_NUMBER || null
  const ramonName = settings?.transfer_target_name || fromRuntimeName

  if (!ramonPhone) {
    const followUp = await createFollowUp({
      organizationId: input.organizationId,
      callLogId: input.callLogId,
      title: `Callback pendiente para ${ramonName}`,
      notes: input.reason,
      owner: ramonName,
      priority: input.urgent ? 'urgent' : 'high',
      callbackRequired: true,
      dueAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    await createNotification({
      organizationId: input.organizationId,
      callLogId: input.callLogId,
      followUpId: followUp.id,
      type: 'callback_required',
      title: 'Ramon no disponible, callback creado',
      message: input.reason,
      priority: input.urgent ? 'urgent' : 'high',
    })
    return {
      transferred: false,
      callback_created: true,
      target_name: ramonName,
      reason: 'No transfer target phone configured',
    }
  }

  await createTransferRecord({
    organizationId: input.organizationId,
    callLogId: input.callLogId,
    requested: true,
    completed: true,
    targetName: ramonName,
    targetPhone: ramonPhone,
    reason: input.reason,
  })
  await createNotification({
    organizationId: input.organizationId,
    callLogId: input.callLogId,
    type: 'transfer_completed',
    title: `Llamada transferida a ${ramonName}`,
    message: input.reason,
    priority: input.urgent ? 'urgent' : 'high',
  })

  return {
    transferred: true,
    target_name: ramonName,
    target_phone: ramonPhone,
  }
}

export async function runSaveCallOutcome(input: {
  organizationId: string
  vapiCallId?: string
  phone: string
  customerName?: string
  intent?: string
  callType?: string
  validationStatus?: 'validated' | 'invalid' | 'spam_or_invalid' | 'pending'
  transcript?: string
  summary?: string
  result?: string
  owner?: string
  followUpDate?: string
  transferRequested?: boolean
  transferCompleted?: boolean
  spamScore?: number
  nextAction?: string
  structuredExtraction?: StructuredExtraction
  ended?: boolean
}) {
  const classificationInput = classifyCall({
    text: `${input.summary || ''} ${input.transcript || ''}`.trim(),
    phone: input.phone,
    name: input.customerName,
    attempts: 0,
    explicitHumanRequest: input.transferRequested === true,
  })

  const callLog = await upsertCallLog({
    organizationId: input.organizationId,
    vapiCallId: input.vapiCallId,
    phone: input.phone,
    customerName: input.customerName,
    intent: input.intent || classificationInput.intent,
    callType: input.callType || classificationInput.intent,
    validationStatus: input.validationStatus || classificationInput.validationStatus,
    classification: classificationInput.classification,
    spamScore: input.spamScore ?? classificationInput.spamScore,
    transferRequested: input.transferRequested,
    transferCompleted: input.transferCompleted,
    result: input.result,
    owner: input.owner,
    followUpDate: input.followUpDate,
    transcript: input.transcript,
    summary: input.summary,
    structuredExtraction: input.structuredExtraction,
    nextAction: input.nextAction,
    ended: input.ended,
  })

  if (input.ended) {
    try {
      await findOrCreateCustomer({
        organizationId: input.organizationId,
        phone: input.phone,
        name: input.customerName,
      })
    } catch (err) {
      console.warn('[voice-platform] findOrCreateCustomer after call log', err)
    }
  }

  await insertCallClassification({
    organizationId: input.organizationId,
    callLogId: callLog.id,
    classification: classificationInput.classification,
    confidence: 0.8,
    reason: `intent=${classificationInput.intent} spamScore=${classificationInput.spamScore}`,
  })

  if (classificationInput.transferCandidate && !input.transferCompleted) {
    await createFollowUp({
      organizationId: input.organizationId,
      callLogId: callLog.id,
      title: 'Revisar llamada transfer candidate',
      notes: input.summary || 'Revisar contexto y definir accion.',
      owner: 'Ramon',
      dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      priority: classificationInput.urgent ? 'urgent' : 'high',
      callbackRequired: true,
    })
  }

  const ext = input.structuredExtraction
  const wantsCallback =
    Boolean(input.followUpDate) ||
    ext?.callback_required === true ||
    ext?.follow_up_required === true
  const spamish =
    input.validationStatus === 'spam_or_invalid' ||
    classificationInput.intent === 'spam' ||
    classificationInput.validationStatus === 'spam_or_invalid'
  if (wantsCallback && !spamish && input.ended) {
    const existing = await followUpCountForCallLog(callLog.id)
    if (existing === 0) {
      const due =
        input.followUpDate ||
        ext?.follow_up_date ||
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const blob = `${input.summary || ''} ${input.transcript || ''}`.toLowerCase()
      const title = blob.includes('presupuesto') || blob.includes('cotiz')
        ? 'Presupuesto / cotización — devolver contacto al cliente'
        : 'Seguimiento — contacto prometido al cliente'
      const fuRow = await createFollowUp({
        organizationId: input.organizationId,
        callLogId: callLog.id,
        title,
        notes: [input.summary, input.nextAction].filter(Boolean).join('\n') || null,
        owner: input.owner || null,
        dueAt: due,
        priority: 'high',
        callbackRequired: true,
      })
      const fuId = fuRow && typeof fuRow === 'object' && 'id' in fuRow ? String((fuRow as { id: string }).id) : null
      await createNotification({
        organizationId: input.organizationId,
        callLogId: callLog.id,
        followUpId: fuId,
        type: 'follow_up_created',
        title: 'Seguimiento creado desde cierre de llamada',
        message: title,
        priority: 'high',
      })
    }
  }

  return {
    ok: true,
    call_log_id: callLog.id,
    classification: classificationInput.classification,
    spam_score: classificationInput.spamScore,
    transfer_candidate: classificationInput.transferCandidate,
  }
}

export async function runMarkSpamCall(input: {
  organizationId: string
  vapiCallId?: string
  phone: string
  reason?: string
  spamScore?: number
}) {
  const score = Math.max(70, Math.min(100, input.spamScore || 90))
  const out = await runSaveCallOutcome({
    organizationId: input.organizationId,
    vapiCallId: input.vapiCallId,
    phone: input.phone,
    validationStatus: 'spam_or_invalid',
    result: 'spam_rejected',
    spamScore: score,
    summary: input.reason || 'Llamada marcada como spam o invalida',
    nextAction: 'No escalar; cerrar flujo.',
    ended: true,
  })

  try {
    const { flagPhoneAsSpam } = await import('@/lib/vapi/phone-screening')
    await flagPhoneAsSpam({
      organizationId: input.organizationId,
      phone: input.phone,
      reason: input.reason || 'mark_spam_call',
      spamScore: score,
      block: true,
    })
  } catch (e) {
    console.warn('[runMarkSpamCall] phone_screening sync skipped', e)
  }

  return {
    ok: true,
    ...out,
  }
}

export async function runCreateFollowUp(input: {
  organizationId: string
  callLogId?: string
  phone?: string
  customerId?: string
  title: string
  notes?: string
  owner?: string
  dueAt?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  callbackRequired?: boolean
}) {
  let customerId = input.customerId || null
  if (!customerId && input.phone) {
    const customer = await findOrCreateCustomer({
      organizationId: input.organizationId,
      phone: input.phone,
    })
    customerId = customer.id
  }

  const followUp = await createFollowUp({
    organizationId: input.organizationId,
    callLogId: input.callLogId,
    customerId,
    title: input.title,
    notes: input.notes,
    owner: input.owner,
    dueAt: input.dueAt,
    priority: input.priority,
    callbackRequired: input.callbackRequired,
  })

  await createNotification({
    organizationId: input.organizationId,
    callLogId: input.callLogId,
    followUpId: followUp.id,
    type: 'follow_up_created',
    title: 'Nuevo seguimiento creado',
    message: input.title,
    priority: input.priority || 'normal',
  })

  return {
    ok: true,
    follow_up: followUp,
  }
}

export type SaveLeadInfoSuccess = {
  ok: true
  saved: true
  lead_saved: boolean
  customer: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    company: string | null
  }
}

export type SaveLeadInfoFailure = {
  ok: false
  error: 'save_lead_failed'
  primary_message_for_caller: string
  /** Código PostgREST / Supabase cuando existe (sin detalle sensible). */
  db_code?: string
}

export async function runSaveLeadInfo(input: {
  organizationId: string
  phone: string
  name?: string
  email?: string
  company?: string
  notes?: string
  /** Clasificación comercial (tabla `leads.metadata` + score sugerido). */
  commercialSnapshot?: Partial<LeadCommercialFields>
  vapiCallId?: string | null
}): Promise<SaveLeadInfoSuccess | SaveLeadInfoFailure> {
  try {
    const customer = await upsertCustomerLeadInfo({
      organizationId: input.organizationId,
      phone: input.phone,
      name: input.name,
      email: input.email,
      company: input.company,
      notes: input.notes,
    })
    const lead = await upsertLeadByPhone({
      organizationId: input.organizationId,
      phone: input.phone,
      name: input.name,
      email: input.email,
      company: input.company,
      notes: input.notes,
      commercialSnapshot: input.commercialSnapshot,
      vapiCallId: input.vapiCallId ?? null,
    })

    return {
      ok: true,
      saved: true,
      lead_saved: Boolean(lead),
      customer: {
        id: customer.id,
        name: customer.name ?? null,
        phone: customer.phone ?? null,
        email: (customer as { email?: string | null }).email ?? null,
        company: (customer as { company?: string | null }).company ?? null,
      },
    }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    const code = typeof err?.code === 'string' ? err.code : undefined
    console.error('[voice-platform/runSaveLeadInfo] save_lead_failed', {
      organization_id: input.organizationId,
      phone_suffix: input.phone.length >= 4 ? input.phone.replace(/\D/g, '').slice(-4) : null,
      db_code: code ?? null,
      message: err?.message ?? (e instanceof Error ? e.message : String(e)),
    })
    return {
      ok: false,
      error: 'save_lead_failed',
      primary_message_for_caller:
        'No pude registrar tus datos en este momento. Puedo transferirte o intentar de nuevo.',
      ...(code ? { db_code: code } : {}),
    }
  }
}

export function shouldRejectByValidation(input: {
  name?: string | null
  phone?: string | null
  reason?: string | null
  jobNumber?: string | null
  attempts?: number
}) {
  const attempts = Math.max(0, input.attempts || 0)
  const hasName = !!(input.name || '').trim()
  const hasPhone = !!normalizePhone(input.phone || '')
  const hasReason = !!(input.reason || '').trim()
  const hasJob = !!(input.jobNumber || '').trim()

  const minimalValid = hasName && hasPhone && (hasReason || hasJob)
  if (minimalValid) return { reject: false, validationStatus: 'validated' as const }
  if (attempts >= 2) return { reject: true, validationStatus: 'spam_or_invalid' as const }
  return { reject: false, validationStatus: 'pending' as const }
}
