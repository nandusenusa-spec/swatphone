import { randomUUID } from 'crypto'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { LeadCommercialFields } from '@/lib/vapi/lead-classification'
import { scoreHintFromCommercial } from '@/lib/vapi/lead-classification'
import type { PriceLookupSearchMeta } from '@/lib/voice-platform/price-lookup-log'
import { fieldsFromPostgrestError, logProductsPriceLookupError } from '@/lib/voice-platform/products-query-log'
import { normalizePhone } from '@/lib/phone'
import type { CallClassification, StructuredExtraction, ValidationStatus } from '@/lib/voice-platform/types'

type OrgSettings = {
  transfer_target_name: string | null
  transfer_target_phone: string | null
  spam_threshold: number | null
}

export async function getOrgVoiceSettings(organizationId: string): Promise<OrgSettings | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('organization_voice_settings')
    .select('transfer_target_name, transfer_target_phone, spam_threshold')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error?.code === 'PGRST205') return null
  if (error) throw error
  return data || null
}

export async function findOrCreateCustomer(input: {
  organizationId: string
  phone: string
  name?: string | null
  company?: string | null
}) {
  const supabase = createServiceRoleClient()
  const phone = normalizePhone(input.phone)
  if (!phone) throw new Error('Telefono invalido')

  const { data: existing, error: exError } = await supabase
    .from('customers')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('phone', phone)
    .maybeSingle()
  if (exError) throw exError
  if (existing) return existing

  const { data, error } = await supabase
    .from('customers')
    .insert({
      id: randomUUID(),
      organization_id: input.organizationId,
      phone,
      name: input.name || 'Cliente',
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function upsertCustomerLeadInfo(input: {
  organizationId: string
  phone: string
  name?: string | null
  email?: string | null
  company?: string | null
  notes?: string | null
}) {
  const supabase = createServiceRoleClient()
  const phone = normalizePhone(input.phone)
  if (!phone) throw new Error('Telefono invalido')

  const norm = (v?: string | null) => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t || null
  }

  const incomingName = norm(input.name)
  const incomingEmail = norm(input.email)?.toLowerCase() || null
  const incomingCompany = norm(input.company)
  const incomingNotes = norm(input.notes)

  const { data: rows, error: exError } = await supabase
    .from('customers')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
  if (exError) throw exError
  const existing = rows?.[0]

  if (!existing) {
    const { data, error } = await supabase
      .from('customers')
      .insert({
        id: randomUUID(),
        organization_id: input.organizationId,
        phone,
        name: incomingName || 'Cliente',
        email: incomingEmail,
        company: incomingCompany,
        notes: incomingNotes,
      })
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (incomingName && String(existing.name || '').trim() !== incomingName) {
    patch.name = incomingName
  }
  if (incomingEmail) patch.email = incomingEmail
  if (incomingCompany) patch.company = incomingCompany
  if (incomingNotes) patch.notes = incomingNotes

  if (Object.keys(patch).length === 1) return existing

  const { data, error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function upsertLeadByPhone(input: {
  organizationId: string
  phone: string
  name?: string | null
  email?: string | null
  company?: string | null
  notes?: string | null
  commercialSnapshot?: Partial<LeadCommercialFields>
  vapiCallId?: string | null
}) {
  const supabase = createServiceRoleClient()
  const phone = normalizePhone(input.phone)
  if (!phone) throw new Error('Telefono invalido')

  const norm = (v?: string | null) => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t || null
  }
  const incomingName = norm(input.name)
  const incomingEmail = norm(input.email)?.toLowerCase() || null
  const incomingCompany = norm(input.company)
  const incomingNotes = norm(input.notes)

  const mergeLeadMetadata = (
    existingRow: Record<string, unknown> | undefined,
  ): Record<string, unknown> => {
    const prev =
      existingRow &&
      typeof existingRow.metadata === 'object' &&
      existingRow.metadata !== null &&
      !Array.isArray(existingRow.metadata)
        ? { ...(existingRow.metadata as Record<string, unknown>) }
        : {}
    let touched = false
    if (input.commercialSnapshot && Object.keys(input.commercialSnapshot).length > 0) {
      const prevComm =
        prev.commercial && typeof prev.commercial === 'object' && !Array.isArray(prev.commercial)
          ? (prev.commercial as Record<string, unknown>)
          : {}
      prev.commercial = { ...prevComm, ...input.commercialSnapshot }
      touched = true
    }
    if (input.vapiCallId) {
      prev.related_vapi_call_id = input.vapiCallId
      prev.last_source = 'vapi_call'
      touched = true
    }
    if (touched) prev.commercial_updated_at = new Date().toISOString()
    return prev
  }

  const scoreBoost = scoreHintFromCommercial(input.commercialSnapshot)

  const { data: rows, error: findErr } = await supabase
    .from('leads')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
  if (findErr?.code === 'PGRST205') return null
  if (findErr) throw findErr
  const existing = rows?.[0]

  if (!existing) {
    const metaRow = mergeLeadMetadata(undefined)
    const { data, error } = await supabase
      .from('leads')
      .insert({
        id: randomUUID(),
        organization_id: input.organizationId,
        phone,
        name: incomingName,
        email: incomingEmail,
        company: incomingCompany,
        notes: incomingNotes,
        status: 'new',
        score: scoreBoost,
        ...(Object.keys(metaRow).length > 0 ? { metadata: metaRow } : {}),
      })
      .select('*')
      .single()
    if (error?.code === 'PGRST205') return null
    if (error) throw error
    return data
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (incomingName) patch.name = incomingName
  if (incomingEmail) patch.email = incomingEmail
  if (incomingCompany) patch.company = incomingCompany
  if (incomingNotes) patch.notes = incomingNotes

  const mergedMeta = mergeLeadMetadata(existing as Record<string, unknown>)
  const prevMetaPlain =
    existing &&
    typeof (existing as Record<string, unknown>).metadata === 'object' &&
    (existing as Record<string, unknown>).metadata !== null
      ? JSON.stringify((existing as Record<string, unknown>).metadata)
      : '{}'
  const mergedMetaPlain = JSON.stringify(mergedMeta)
  if (mergedMetaPlain !== prevMetaPlain && Object.keys(mergedMeta).length > 0) {
    patch.metadata = mergedMeta
  }

  const prevScore = typeof existing.score === 'number' ? existing.score : Number(existing.score || 0)
  if (scoreBoost > 0) {
    patch.score = Math.max(prevScore, scoreBoost)
  }

  const metaChanged = mergedMetaPlain !== prevMetaPlain && Object.keys(mergedMeta).length > 0

  const hasSubstantivePatch =
    Boolean(incomingName) ||
    Boolean(incomingEmail) ||
    Boolean(incomingCompany) ||
    Boolean(incomingNotes) ||
    metaChanged ||
    (scoreBoost > 0 && patch.score !== undefined)

  if (!hasSubstantivePatch) return existing

  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error?.code === 'PGRST205') return existing
  if (error) throw error
  return data
}

export async function findWorkOrder(input: {
  organizationId: string
  jobNumber?: string | null
  phone?: string | null
}) {
  const supabase = createServiceRoleClient()
  const jobNumber = (input.jobNumber || '').trim()
  const phone = normalizePhone(input.phone || '')

  if (jobNumber) {
    const sel = '*, customers(name, phone)'
    const base = (col: 'order_number' | 'work_order_number') =>
      supabase
        .from('work_orders')
        .select(sel)
        .eq('organization_id', input.organizationId)
        .eq(col, jobNumber)
        .limit(2)

    let { data, error } = await base('order_number')
    if (error) {
      const second = await base('work_order_number')
      if (second.error) throw second.error
      data = second.data
      error = second.error
    } else if (!data?.length) {
      const second = await base('work_order_number')
      if (!second.error && second.data?.length) data = second.data
    }
    if (error) throw error
    return { matches: data || [], ambiguous: (data || []).length > 1 }
  }

  if (!phone) return { matches: [], ambiguous: false }

  const { data: custRows, error: cErr } = await supabase
    .from('customers')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('phone', phone)
    .limit(2)
  if (cErr) throw cErr
  if (!custRows?.length) return { matches: [], ambiguous: false }
  if (custRows.length > 1) return { matches: [], ambiguous: true }

  const customerId = custRows[0].id as string
  const { data, error } = await supabase
    .from('work_orders')
    .select('*, customers(name, phone)')
    .eq('organization_id', input.organizationId)
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false })
    .limit(5)
  if (error) throw error
  return { matches: data || [], ambiguous: (data || []).length > 1 }
}

export async function createAppointment(input: {
  organizationId: string
  customerId: string
  appointmentAt: string
  notes?: string | null
  callLogId?: string | null
}) {
  const supabase = createServiceRoleClient()
  const dt = new Date(input.appointmentAt)
  if (Number.isNaN(dt.getTime())) throw new Error('Fecha de cita invalida')

  const dateOnly = dt.toISOString().slice(0, 10)
  const timeStr = `${dt.getUTCHours().toString().padStart(2, '0')}:${dt.getUTCMinutes().toString().padStart(2, '0')}:00`

  const minimalRow = {
    id: randomUUID(),
    organization_id: input.organizationId,
    customer_id: input.customerId,
    date: dateOnly,
    time: timeStr,
    notes: input.notes || null,
    status: 'scheduled',
    source: 'vapi',
  }

  const legacyRow = {
    organization_id: input.organizationId,
    customer_id: input.customerId,
    call_log_id: input.callLogId || null,
    appointment_at: input.appointmentAt,
    notes: input.notes || null,
    status: 'pending',
    created_by: 'vapi',
  }

  let { data, error } = await supabase.from('appointments').insert(minimalRow).select('*').single()
  if (error) {
    const retry = await supabase.from('appointments').insert(legacyRow).select('*').single()
    if (retry.error) throw retry.error
    data = retry.data
  }
  return data
}

export async function createWorkOrder(input: {
  organizationId: string
  customerId: string
  title: string
  issueDescription?: string | null
}) {
  const supabase = createServiceRoleClient()
  const orderNumber = `WO-${Date.now().toString().slice(-8)}`

  const minimalRow = {
    id: randomUUID(),
    organization_id: input.organizationId,
    customer_id: input.customerId,
    order_number: orderNumber,
    service_type: input.title,
    issue_description: input.issueDescription || null,
    status: 'pending',
  }

  const legacyRow = {
    organization_id: input.organizationId,
    customer_id: input.customerId,
    work_order_number: orderNumber,
    title: input.title,
    issue_description: input.issueDescription || null,
    status: 'pending',
    created_by: 'vapi',
    owner: 'Ramon',
  }

  let { data, error } = await supabase.from('work_orders').insert(minimalRow).select('*').single()
  if (error) {
    const retry = await supabase.from('work_orders').insert(legacyRow).select('*').single()
    if (retry.error) throw retry.error
    data = retry.data
  }
  return data
}

export type QuoteRow = {
  service_name: string
  unit_price: unknown
  currency: string | null
  description: string | null
  source: 'products' | 'organization_catalog' | 'price_catalog'
  /** id de fila en `products` u otra tabla según `source` */
  source_row_id: string | null
  source_updated_at: string | null
}

function catalogRowActive(r: Record<string, unknown>): boolean {
  if (r.active === false || r.is_active === false) return false
  return true
}

function mapProductRowToQuote(r: Record<string, unknown>): QuoteRow {
  return {
    service_name: String(r.name || ''),
    unit_price: r.price,
    currency: (r.currency as string) || 'USD',
    description: (r.description as string) || null,
    source: 'products',
    source_row_id: typeof r.id === 'string' ? r.id : null,
    source_updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
  }
}

/** Columnas alineadas con admin `products` (sin category ni otras si no existen en todas las DB). */
const PRODUCTS_SELECT_ADMIN =
  'id, organization_id, name, description, price, currency, is_active, updated_at' as const

function isValidOrganizationUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/** Escapa % y _ en lo que el usuario dijo para usarlo dentro de ilike %…%. */
function escapeIlikeUserPatternForContains(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/** Cantidad en nombre tipo "Business Cards - 500" (catálogo admin). */
export function parseBusinessCardsCatalogQty(name: string): number | null {
  const m = String(name).match(/business\s+cards\s*-\s*(\d+)/i)
  return m ? parseInt(m[1], 10) : null
}

export function sortQuoteRowsByBusinessCardsCatalogQty(rows: QuoteRow[]): QuoteRow[] {
  return [...rows].sort((a, b) => {
    const na = parseBusinessCardsCatalogQty(a.service_name)
    const nb = parseBusinessCardsCatalogQty(b.service_name)
    if (na != null && nb != null) return na - nb
    if (na != null) return -1
    if (nb != null) return 1
    return a.service_name.localeCompare(b.service_name)
  })
}

export function allQuoteRowsLookLikeBusinessCardsCatalog(rows: QuoteRow[]): boolean {
  if (!rows.length) return false
  return rows.every((r) => /business\s+cards/i.test(r.service_name))
}

function shouldTryBusinessCardsCatalogQuery(term: string): boolean {
  const t = term.trim()
  if (!t) return false
  if (/\bbusiness\s+cards\b/i.test(t)) return true
  if (t.toLowerCase().includes('business cards')) return true
  return false
}

/**
 * Tras una query segura `name ilike '%Business Cards%'`, acota por cantidad / nombre exacto en memoria.
 */
function applyBusinessCardsMemoryFilter(rows: QuoteRow[], term: string): QuoteRow[] {
  if (!rows.length) return rows
  const t = term.trim()
  const sorted = sortQuoteRowsByBusinessCardsCatalogQty([...rows])

  const exact = sorted.filter((r) => r.service_name.trim().toLowerCase() === t.toLowerCase())
  if (exact.length === 1) return exact

  const dash = t.match(/business\s+cards\s*-\s*(\d+)/i)
  if (dash) {
    const needle = dash[0].replace(/\s+/g, ' ').toLowerCase()
    const by = sorted.filter((r) => r.service_name.replace(/\s+/g, ' ').toLowerCase().includes(needle))
    if (by.length === 1) return by
  }

  const qty = t.match(/\b(\d{2,5})\b/)
  if (qty && sorted.every((r) => /business\s+cards/i.test(r.service_name))) {
    const q = qty[1]
    const narrowed = sorted.filter((r) => new RegExp(`-\\s*${q}\\s*$`, 'i').test(r.service_name.trim()))
    if (narrowed.length === 1) return narrowed
    if (narrowed.length > 0) return narrowed
  }

  const lasLos = t.match(/\b(?:las|los)\s+(\d{2,5})\b/i)
  if (lasLos && sorted.every((r) => /business\s+cards/i.test(r.service_name))) {
    const q = lasLos[1]
    const narrowed = sorted.filter((r) => new RegExp(`-\\s*${q}\\s*$`, 'i').test(r.service_name.trim()))
    if (narrowed.length === 1) return narrowed
    if (narrowed.length > 0) return narrowed
  }

  return sorted
}

function logProductQueryFailure(
  stage: string,
  err: PostgrestError | null,
  organizationId: string,
  filtersUsed: Record<string, unknown>,
  logCtx?: { inputName?: string; normalizedName?: string },
  searchTerm?: string,
) {
  if (!err) return
  logProductsPriceLookupError({
    stage,
    ...fieldsFromPostgrestError(err),
    filtersUsed,
    organization_id: organizationId,
    inputName: logCtx?.inputName ?? searchTerm ?? null,
    normalizedName: logCtx?.normalizedName ?? null,
  })
}

/**
 * Productos `products` cuyo nombre contiene "Business Cards" (misma fuente que admin), ordenados por cantidad en el nombre.
 */
export async function listBusinessCardsProductVariants(organizationId: string): Promise<QuoteRow[]> {
  if (!isValidOrganizationUuid(organizationId)) {
    logProductsPriceLookupError({
      stage: 'listBusinessCardsProductVariants_invalid_org',
      filtersUsed: { organization_id: organizationId },
      organization_id: organizationId,
      message: 'invalid organization_id UUID',
    })
    return []
  }
  const supabase = createServiceRoleClient()
  const filtersUsed = {
    table: 'products',
    select: PRODUCTS_SELECT_ADMIN,
    organization_id: organizationId,
    name_ilike: '%Business Cards%',
    limit: 40,
  }
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCTS_SELECT_ADMIN)
    .eq('organization_id', organizationId)
    .ilike('name', '%Business Cards%')
    .limit(40)
  if (error) {
    logProductQueryFailure('listBusinessCardsProductVariants', error, organizationId, filtersUsed, undefined, undefined)
    return []
  }
  const raw = data || []
  const rows = raw
    .filter((r) => /business\s+cards/i.test(String((r as Record<string, unknown>).name || '')))
    .map((r) => mapProductRowToQuote(r as Record<string, unknown>))
  return sortQuoteRowsByBusinessCardsCatalogQty(rows)
}

/** ILIKE literal: sin % ni _ comodines → coincidencia exacta case-insensitive. */
function escapeIlikeLiteral(pattern: string): string {
  return pattern.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Si `ilike %term%` en nombre devuelve varias filas tipo "Business Cards - 500/1000"
 * y el término incluye una cantidad, quedarse con la que termina en "- {qty}".
 */
function narrowBusinessCardRowsByQuantity(rows: QuoteRow[], searchTerm: string): QuoteRow[] {
  if (rows.length <= 1) return rows
  const qtyMatch = searchTerm.match(/\b(\d{2,5})\b/)
  if (!qtyMatch) return rows
  const q = qtyMatch[1]
  const allNamedLikeBc = rows.every((r) => /\bbusiness\s+cards?\s*-/i.test(r.service_name))
  if (!allNamedLikeBc) return rows
  const narrowed = rows.filter((r) => new RegExp(`-\\s*${q}\\s*$`, 'i').test(r.service_name.trim()))
  return narrowed.length === 1 ? narrowed : rows
}

/**
 * Misma tabla/columnas que admin Productos: `products` + `organization_id`, sin columnas dudosas ni `.or()` raros.
 */
async function searchProductsForPriceQuote(
  supabase: ReturnType<typeof createServiceRoleClient>,
  organizationId: string,
  term: string,
  logCtx?: { inputName?: string; normalizedName?: string },
): Promise<{ rows: QuoteRow[]; meta: PriceLookupSearchMeta }> {
  const metaFor = (
    matchMode: string,
    queryFilters: Record<string, unknown>,
    resultCount: number,
  ): PriceLookupSearchMeta => ({
    tableQueried: 'products',
    queryFilters: {
      ...queryFilters,
      organization_id: organizationId,
      is_active_filter: 'none (aligned with dashboard/admin products)',
    },
    resultCount,
    matchMode,
  })

  if (!isValidOrganizationUuid(organizationId)) {
    logProductsPriceLookupError({
      stage: 'searchProducts_invalid_org',
      filtersUsed: { organization_id: organizationId, term },
      organization_id: organizationId,
      inputName: logCtx?.inputName ?? term,
      normalizedName: logCtx?.normalizedName ?? null,
      message: 'invalid organization_id UUID',
    })
    return {
      rows: [],
      meta: metaFor('invalid_org', { term, reason: 'invalid_organization_id' }, 0),
    }
  }

  // Ruta segura Business Cards: un solo filtro name ilike, sin category; refinamiento en memoria.
  if (shouldTryBusinessCardsCatalogQuery(term)) {
    const filtersUsed = {
      select: PRODUCTS_SELECT_ADMIN,
      organization_id: organizationId,
      name_ilike: '%Business Cards%',
      limit: 50,
    }
    const bcRes = await supabase
      .from('products')
      .select(PRODUCTS_SELECT_ADMIN)
      .eq('organization_id', organizationId)
      .ilike('name', '%Business Cards%')
      .limit(50)
    if (bcRes.error) {
      logProductQueryFailure(
        'products_business_cards_safe_ilike',
        bcRes.error,
        organizationId,
        filtersUsed,
        logCtx,
        term,
      )
    }
    if (!bcRes.error && bcRes.data?.length) {
      const mapped = (bcRes.data || []).map((r) => mapProductRowToQuote(r as Record<string, unknown>))
      const filtered = mapped.filter((r) => /business\s+cards/i.test(r.service_name))
      const rows = applyBusinessCardsMemoryFilter(filtered, term)
      if (rows.length) {
        return {
          rows,
          meta: metaFor(
            'business_cards_safe_query',
            { ...filtersUsed, memory_filter: true, search_term: term },
            rows.length,
          ),
        }
      }
    }
  }

  // 1) Case-sensitive exact
  const filtersEq = { select: PRODUCTS_SELECT_ADMIN, organization_id: organizationId, name_eq: term, limit: 8 }
  const eqRes = await supabase
    .from('products')
    .select(PRODUCTS_SELECT_ADMIN)
    .eq('organization_id', organizationId)
    .eq('name', term)
    .limit(8)
  if (eqRes.error) logProductQueryFailure('products_name_eq', eqRes.error, organizationId, filtersEq, logCtx, term)
  if (eqRes.error && eqRes.error.code !== 'PGRST205') throw eqRes.error
  const eqRows = (eqRes.data || []).map((r) => mapProductRowToQuote(r as Record<string, unknown>))
  if (eqRows.length) {
    return {
      rows: eqRows,
      meta: metaFor('name_eq', { name_eq: term }, eqRows.length),
    }
  }

  // 2) Case-insensitive exact en name
  const exactPattern = escapeIlikeLiteral(term)
  const filtersIlikeExact = {
    select: PRODUCTS_SELECT_ADMIN,
    organization_id: organizationId,
    name_ilike_exact: exactPattern,
    limit: 8,
  }
  const ilikeExactRes = await supabase
    .from('products')
    .select(PRODUCTS_SELECT_ADMIN)
    .eq('organization_id', organizationId)
    .ilike('name', exactPattern)
    .limit(8)
  if (ilikeExactRes.error) {
    logProductQueryFailure(
      'products_name_ilike_exact',
      ilikeExactRes.error,
      organizationId,
      filtersIlikeExact,
      logCtx,
      term,
    )
  }
  if (ilikeExactRes.error && ilikeExactRes.error.code !== 'PGRST205') throw ilikeExactRes.error
  const exactRows = (ilikeExactRes.data || []).map((r) =>
    mapProductRowToQuote(r as Record<string, unknown>),
  )
  if (exactRows.length) {
    return {
      rows: exactRows,
      meta: metaFor('name_ilike_exact', { name_ilike: exactPattern }, exactRows.length),
    }
  }

  const escapedContains = escapeIlikeUserPatternForContains(term)
  const partialPattern = `%${escapedContains}%`

  const filtersNamePartial = {
    select: PRODUCTS_SELECT_ADMIN,
    organization_id: organizationId,
    name_ilike: partialPattern,
    limit: 8,
  }
  const namePartial = await supabase
    .from('products')
    .select(PRODUCTS_SELECT_ADMIN)
    .eq('organization_id', organizationId)
    .ilike('name', partialPattern)
    .limit(8)
  if (namePartial.error) {
    logProductQueryFailure('products_name_ilike_partial', namePartial.error, organizationId, filtersNamePartial, logCtx, term)
  }
  if (namePartial.error && namePartial.error.code !== 'PGRST205') throw namePartial.error
  let nameRows = (namePartial.data || []).map((r) => mapProductRowToQuote(r as Record<string, unknown>))
  nameRows = narrowBusinessCardRowsByQuantity(nameRows, term)
  if (nameRows.length) {
    return {
      rows: nameRows,
      meta: metaFor('name_ilike', { column: 'name', ilike: partialPattern }, nameRows.length),
    }
  }

  const filtersDescPartial = {
    select: PRODUCTS_SELECT_ADMIN,
    organization_id: organizationId,
    description_ilike: partialPattern,
    limit: 8,
  }
  const descRes = await supabase
    .from('products')
    .select(PRODUCTS_SELECT_ADMIN)
    .eq('organization_id', organizationId)
    .ilike('description', partialPattern)
    .limit(8)
  if (descRes.error) {
    logProductQueryFailure(
      'products_description_ilike_partial',
      descRes.error,
      organizationId,
      filtersDescPartial,
      logCtx,
      term,
    )
  }
  if (descRes.error && descRes.error.code !== 'PGRST205') throw descRes.error
  const descRows = (descRes.data || []).map((r) => mapProductRowToQuote(r as Record<string, unknown>))
  if (descRows.length) {
    return {
      rows: descRows,
      meta: metaFor('description_ilike', { column: 'description', ilike: partialPattern }, descRows.length),
    }
  }

  return {
    rows: [],
    meta: {
      tableQueried: 'products',
      queryFilters: {
        organization_id: organizationId,
        term,
        tried: 'business_cards_safe,name_eq,name_ilike_exact,name_ilike,description_ilike',
        is_active_filter: 'none (aligned with dashboard/admin products)',
      },
      resultCount: 0,
    },
  }
}

export async function getPriceQuote(input: {
  organizationId: string
  serviceName: string
  logContext?: { inputName?: string; normalizedName?: string }
}): Promise<{ rows: QuoteRow[]; searchMeta: PriceLookupSearchMeta }> {
  const supabase = createServiceRoleClient()
  const term = input.serviceName.trim()
  if (!term) {
    return {
      rows: [],
      searchMeta: {
        tableQueried: 'none',
        queryFilters: { reason: 'empty_term' },
        resultCount: 0,
      },
    }
  }

  const { rows: productRows, meta: productMeta } = await searchProductsForPriceQuote(
    supabase,
    input.organizationId,
    term,
    input.logContext,
  )
  if (productRows.length) {
    return { rows: productRows, searchMeta: productMeta }
  }

  // 2) organization_catalog (legacy)
  const fromOrgCatalog = await supabase
    .from('organization_catalog')
    .select('*')
    .eq('organization_id', input.organizationId)
    .ilike('service_name', `%${term}%`)
    .limit(12)

  if (fromOrgCatalog.error && fromOrgCatalog.error.code !== 'PGRST205') {
    throw fromOrgCatalog.error
  }
  const catFiltered = (fromOrgCatalog.data || []).filter((r: Record<string, unknown>) =>
    catalogRowActive(r),
  )
  if (catFiltered.length) {
    const rows = catFiltered.slice(0, 8).map(
      (r: Record<string, unknown>): QuoteRow => ({
        service_name: String(r.service_name || ''),
        unit_price: r.public_price ?? r.unit_price ?? r.price,
        currency: (r.currency as string) || 'USD',
        description: (r.description as string) || null,
        source: 'organization_catalog',
        source_row_id: typeof r.id === 'string' ? r.id : null,
        source_updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
      }),
    )
    return {
      rows,
      searchMeta: {
        tableQueried: 'organization_catalog',
        queryFilters: {
          organization_id: input.organizationId,
          service_name_ilike: `%${term}%`,
          catalog_row_active: true,
        },
        resultCount: rows.length,
        matchMode: 'service_name_ilike',
      },
    }
  }

  // 3) price_catalog (legacy)
  const { data, error } = await supabase
    .from('price_catalog')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('is_active', true)
    .ilike('service_name', `%${term}%`)
    .limit(8)
  if (error?.code === 'PGRST205') {
    return { rows: [], searchMeta: productMeta }
  }
  if (error) throw error
  const pcRows = (data || []).map(
    (r: Record<string, unknown>): QuoteRow => ({
      service_name: String(r.service_name || ''),
      unit_price: r.unit_price,
      currency: (r.currency as string) || 'USD',
      description: (r.description as string) || null,
      source: 'price_catalog',
      source_row_id: typeof r.id === 'string' ? r.id : null,
      source_updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
    }),
  )
  if (pcRows.length) {
    return {
      rows: pcRows,
      searchMeta: {
        tableQueried: 'price_catalog',
        queryFilters: {
          organization_id: input.organizationId,
          service_name_ilike: `%${term}%`,
          is_active: true,
        },
        resultCount: pcRows.length,
        matchMode: 'service_name_ilike',
      },
    }
  }

  return { rows: [], searchMeta: productMeta }
}

export async function upsertCallLog(input: {
  organizationId: string
  vapiCallId?: string | null
  phone: string
  customerName?: string | null
  intent?: string | null
  callType?: string | null
  validationStatus?: ValidationStatus
  classification?: CallClassification
  spamScore?: number
  transferRequested?: boolean
  transferCompleted?: boolean
  result?: string | null
  owner?: string | null
  followUpDate?: string | null
  transcript?: string | null
  summary?: string | null
  structuredExtraction?: StructuredExtraction
  nextAction?: string | null
  ended?: boolean
  vapiStartedAtIso?: string | null
  vapiEndedAtIso?: string | null
}) {
  const supabase = createServiceRoleClient()
  const phone = normalizePhone(input.phone)
  if (!phone) throw new Error('Telefono invalido')

  const spam = Math.max(0, Math.min(100, input.spamScore || 0))
  const incomingStructured =
    input.structuredExtraction &&
    typeof input.structuredExtraction === 'object' &&
    !Array.isArray(input.structuredExtraction)
      ? (input.structuredExtraction as Record<string, unknown>)
      : {}

  const startedAt =
    typeof input.vapiStartedAtIso === 'string' && input.vapiStartedAtIso.trim()
      ? input.vapiStartedAtIso.trim()
      : null
  const endedAt =
    input.ended &&
    typeof input.vapiEndedAtIso === 'string' &&
    input.vapiEndedAtIso.trim()
      ? input.vapiEndedAtIso.trim()
      : input.ended
        ? new Date().toISOString()
        : null

  const endedPatch =
    input.ended && endedAt ? { ended_at: endedAt } : ({} as Record<string, unknown>)
  const startedPatch = startedAt ? { started_at: startedAt } : ({} as Record<string, unknown>)

  const legacyPayload = {
    organization_id: input.organizationId,
    vapi_call_id: input.vapiCallId || null,
    phone,
    customer_name: input.customerName || null,
    intent: input.intent || null,
    call_type: input.callType || null,
    validation_status: input.validationStatus || 'pending',
    classification: input.classification || null,
    spam_score: spam,
    transfer_requested: input.transferRequested === true,
    transfer_completed: input.transferCompleted === true,
    result: input.result || null,
    owner: input.owner || null,
    follow_up_date: input.followUpDate || null,
    transcript: input.transcript || null,
    summary: input.summary || null,
    structured_extraction: incomingStructured,
    next_action: input.nextAction || null,
    updated_at: new Date().toISOString(),
    ...endedPatch,
    ...startedPatch,
  }

  const minimalPayload = {
    organization_id: input.organizationId,
    vapi_call_id: input.vapiCallId || null,
    phone,
    intent: input.intent || null,
    validation_status: input.validationStatus || 'pending',
    spam_score: spam,
    transfer_requested: input.transferRequested === true,
    transfer_completed: input.transferCompleted === true,
    outcome: input.result || null,
    assigned_to: input.owner || null,
    follow_up_date: input.followUpDate || null,
    transcript: input.transcript || null,
    summary: input.summary || null,
    structured_extraction: incomingStructured,
    next_action: input.nextAction || null,
    updated_at: new Date().toISOString(),
    ...endedPatch,
    ...startedPatch,
  }

  if (input.vapiCallId) {
    const { data: existingRows, error: exErr } = await supabase
      .from('call_logs')
      .select('id, structured_extraction')
      .eq('organization_id', input.organizationId)
      .eq('vapi_call_id', input.vapiCallId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (exErr) throw exErr
    const existing = existingRows?.[0]

    if (existing) {
      const prevStructured =
        existing.structured_extraction &&
        typeof existing.structured_extraction === 'object' &&
        !Array.isArray(existing.structured_extraction)
          ? (existing.structured_extraction as Record<string, unknown>)
          : {}
      const mergedStructured = { ...prevStructured, ...incomingStructured }
      const minimalUpdate = { ...minimalPayload, structured_extraction: mergedStructured }
      const legacyUpdate = { ...legacyPayload, structured_extraction: mergedStructured }
      let { data, error } = await supabase
        .from('call_logs')
        .update(minimalUpdate)
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) {
        const retry = await supabase
          .from('call_logs')
          .update(legacyUpdate)
          .eq('id', existing.id)
          .select('*')
          .single()
        if (retry.error) throw retry.error
        data = retry.data
      }
      return data
    }
  }

  let { data, error } = await supabase
    .from('call_logs')
    .insert({
      ...minimalPayload,
      started_at: startedAt || new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) {
    const retry = await supabase
      .from('call_logs')
      .insert({
        ...legacyPayload,
        started_at: startedAt || new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single()
    if (retry.error) throw retry.error
    data = retry.data
  }
  return data
}

export async function insertCallClassification(input: {
  organizationId: string
  callLogId: string
  classification: CallClassification
  confidence?: number
  reason?: string | null
}) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('call_classifications')
    .insert({
      organization_id: input.organizationId,
      call_log_id: input.callLogId,
      classification: input.classification,
      confidence: input.confidence || 0,
      reason: input.reason || null,
    })
    .select('*')
    .single()
  if (error?.code === 'PGRST205') return null
  if (error) throw error
  return data
}

export async function createFollowUp(input: {
  organizationId: string
  callLogId?: string | null
  customerId?: string | null
  title: string
  notes?: string | null
  owner?: string | null
  dueAt?: string | null
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  callbackRequired?: boolean
}) {
  const supabase = createServiceRoleClient()
  const notesBody = [input.title, input.notes].filter(Boolean).join('\n')

  const minimalRow = {
    organization_id: input.organizationId,
    call_log_id: input.callLogId || null,
    customer_id: input.customerId || null,
    notes: notesBody || null,
    owner: input.owner || null,
    due_at: input.dueAt || null,
    status: 'pending',
  }

  const legacyRow = {
    organization_id: input.organizationId,
    call_log_id: input.callLogId || null,
    customer_id: input.customerId || null,
    title: input.title,
    notes: input.notes || null,
    owner: input.owner || null,
    due_at: input.dueAt || null,
    priority: input.priority || 'normal',
    callback_required: input.callbackRequired === true,
    status: 'pending',
  }

  let { data, error } = await supabase.from('follow_ups').insert(minimalRow).select('*').single()
  if (error) {
    const retry = await supabase.from('follow_ups').insert(legacyRow).select('*').single()
    if (retry.error) throw retry.error
    data = retry.data
  }
  return data
}

export async function followUpCountForCallLog(callLogId: string): Promise<number> {
  const supabase = createServiceRoleClient()
  const { count, error } = await supabase
    .from('follow_ups')
    .select('id', { count: 'exact', head: true })
    .eq('call_log_id', callLogId)
  if (error) return 0
  return count ?? 0
}

export async function createTransferRecord(input: {
  organizationId: string
  callLogId: string
  requested: boolean
  completed: boolean
  targetName?: string | null
  targetPhone?: string | null
  reason?: string | null
}) {
  const supabase = createServiceRoleClient()
  const status = input.completed ? 'completed' : input.requested ? 'requested' : 'pending'

  const minimalRow = {
    organization_id: input.organizationId,
    call_log_id: input.callLogId,
    requested_to: input.targetName || null,
    transfer_number: input.targetPhone || null,
    status,
    reason: input.reason || null,
  }

  const legacyRow = {
    organization_id: input.organizationId,
    call_log_id: input.callLogId,
    requested: input.requested,
    completed: input.completed,
    target_name: input.targetName || null,
    target_phone: input.targetPhone || null,
    reason: input.reason || null,
    completed_at: input.completed ? new Date().toISOString() : null,
  }

  let { data, error } = await supabase.from('transfers').insert(minimalRow).select('*').single()
  if (error) {
    const retry = await supabase.from('transfers').insert(legacyRow).select('*').single()
    if (retry.error) throw retry.error
    data = retry.data
  }
  return data
}

export async function createNotification(input: {
  organizationId: string
  callLogId?: string | null
  followUpId?: string | null
  type: string
  title: string
  message?: string | null
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}) {
  const supabase = createServiceRoleClient()
  const minimalRow = {
    organization_id: input.organizationId,
    call_log_id: input.callLogId || null,
    channel: 'voice',
    template_code: input.type,
    payload: {
      title: input.title,
      message: input.message || null,
      priority: input.priority || 'normal',
      follow_up_id: input.followUpId || null,
    },
    status: 'pending',
  }

  const legacyRow = {
    organization_id: input.organizationId,
    call_log_id: input.callLogId || null,
    follow_up_id: input.followUpId || null,
    type: input.type,
    title: input.title,
    message: input.message || null,
    priority: input.priority || 'normal',
    status: 'pending',
  }

  let { data, error } = await supabase.from('notifications').insert(minimalRow).select('*').single()
  if (error) {
    const retry = await supabase.from('notifications').insert(legacyRow).select('*').single()
    if (retry.error) throw retry.error
    data = retry.data
  }
  return data
}

export async function upsertCallLogTransferRequested(input: {
  organizationId: string
  vapiCallId: string
  phone: string
}): Promise<void> {
  const supabase = createServiceRoleClient()
  const phone = normalizePhone(input.phone)
  if (!phone || !input.vapiCallId) return

  const { data: exRows, error: findErr } = await supabase
    .from('call_logs')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('vapi_call_id', input.vapiCallId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (findErr?.code === 'PGRST205') return
  if (findErr) throw findErr
  const ex = exRows?.[0]

  if (ex) {
    const { error } = await supabase
      .from('call_logs')
      .update({
        transfer_requested: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ex.id)
    if (error) throw error
    return
  }

  const minimalInsert = {
    organization_id: input.organizationId,
    vapi_call_id: input.vapiCallId,
    phone,
    transfer_requested: true,
    validation_status: 'pending',
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
  let { error: insErr } = await supabase.from('call_logs').insert(minimalInsert)
  if (insErr) {
    const legacyInsert = {
      ...minimalInsert,
      spam_score: 0,
    }
    const retry = await supabase.from('call_logs').insert(legacyInsert)
    if (retry.error) throw retry.error
  }
}

export async function getCallLogIdByVapiCallId(
  organizationId: string,
  vapiCallId: string,
): Promise<string | null> {
  if (!vapiCallId) return null
  const supabase = createServiceRoleClient()
  const { data: rows, error } = await supabase
    .from('call_logs')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('vapi_call_id', vapiCallId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error?.code === 'PGRST205') return null
  if (error) throw error
  return (rows?.[0]?.id as string) || null
}

export async function patchCallLogTransferState(input: {
  organizationId: string
  vapiCallId: string
  transferRequested?: boolean
  transferCompleted?: boolean
}): Promise<boolean> {
  if (!input.vapiCallId) return false
  const supabase = createServiceRoleClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.transferRequested !== undefined) patch.transfer_requested = input.transferRequested
  if (input.transferCompleted !== undefined) patch.transfer_completed = input.transferCompleted

  const { data: rows, error: findErr } = await supabase
    .from('call_logs')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('vapi_call_id', input.vapiCallId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (findErr?.code === 'PGRST205') return false
  if (findErr) throw findErr
  const row = rows?.[0]
  if (!row) return false

  const { error } = await supabase.from('call_logs').update(patch).eq('id', row.id)
  if (error) throw error
  return true
}

export async function insertTransferEvent(input: {
  organizationId: string
  callLogId: string | null
  requestedTo: string | null
  transferNumber: string | null
  status: string
  reason?: string | null
}) {
  const supabase = createServiceRoleClient()
  const minimalRow = {
    organization_id: input.organizationId,
    call_log_id: input.callLogId,
    requested_to: input.requestedTo,
    transfer_number: input.transferNumber,
    status: input.status,
    reason: input.reason || null,
  }
  const legacyRow = {
    organization_id: input.organizationId,
    call_log_id: input.callLogId,
    requested: input.status === 'completed' || input.status === 'requested',
    completed: input.status === 'completed',
    target_name: input.requestedTo,
    target_phone: input.transferNumber,
    reason: input.reason || `status:${input.status}`,
  }

  let { data, error } = await supabase.from('transfers').insert(minimalRow).select('*').single()
  if (error) {
    const retry = await supabase.from('transfers').insert(legacyRow).select('*').single()
    if (retry.error) throw retry.error
    data = retry.data
  }
  return data
}

/** Fragmento JSON bajo structured_extraction.operator_handoff (sin tipar aquí para evitar ciclos). */
export async function getCallLogOperatorHandoffJson(
  organizationId: string,
  vapiCallId: string,
): Promise<Record<string, unknown> | null> {
  if (!vapiCallId) return null
  const supabase = createServiceRoleClient()
  const { data: rows, error } = await supabase
    .from('call_logs')
    .select('structured_extraction')
    .eq('organization_id', organizationId)
    .eq('vapi_call_id', vapiCallId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error?.code === 'PGRST205') return null
  if (error) throw error
  const data = rows?.[0]
  const ex = data?.structured_extraction as Record<string, unknown> | null
  const h = ex?.operator_handoff
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null
  return h as Record<string, unknown>
}

export async function upsertCallLogOperatorHandoffJson(input: {
  organizationId: string
  vapiCallId: string
  phone: string
  handoff: Record<string, unknown>
}) {
  const supabase = createServiceRoleClient()
  const phone = normalizePhone(input.phone)
  if (!phone) throw new Error('Telefono invalido')

  const { data: exRows, error: findErr } = await supabase
    .from('call_logs')
    .select('id, structured_extraction')
    .eq('organization_id', input.organizationId)
    .eq('vapi_call_id', input.vapiCallId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (findErr?.code === 'PGRST205') return
  if (findErr) throw findErr
  const ex = exRows?.[0]

  const prevEx =
    ex?.structured_extraction &&
    typeof ex.structured_extraction === 'object' &&
    !Array.isArray(ex.structured_extraction)
      ? (ex.structured_extraction as Record<string, unknown>)
      : {}
  const mergedEx = { ...prevEx, operator_handoff: input.handoff }

  if (ex) {
    const { error } = await supabase
      .from('call_logs')
      .update({
        structured_extraction: mergedEx,
        phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ex.id)
    if (error) throw error
    return
  }

  const minimalInsert = {
    organization_id: input.organizationId,
    vapi_call_id: input.vapiCallId,
    phone,
    structured_extraction: mergedEx,
    validation_status: 'pending',
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
  let { error: insErr } = await supabase.from('call_logs').insert(minimalInsert)
  if (insErr) {
    const retry = await supabase.from('call_logs').insert({ ...minimalInsert, spam_score: 0 })
    if (retry.error) throw retry.error
  }
}
