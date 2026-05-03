import { randomUUID } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
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
  if (incomingName && (!existing.name || String(existing.name).trim().toLowerCase() === 'cliente')) {
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
        score: 0,
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
  if (Object.keys(patch).length <= 1) return existing

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

type QuoteRow = {
  service_name: string
  unit_price: unknown
  currency: string | null
  description: string | null
  source: 'products' | 'organization_catalog' | 'price_catalog'
}

function catalogRowActive(r: Record<string, unknown>): boolean {
  if (r.active === false || r.is_active === false) return false
  return true
}

export async function getPriceQuote(input: { organizationId: string; serviceName: string }) {
  const supabase = createServiceRoleClient()
  const term = input.serviceName.trim()
  if (!term) return []

  // 1) Fuente principal: products (cargada desde /dashboard/products)
  const fromProducts = await supabase
    .from('products')
    .select('name, price, currency, description, is_active')
    .eq('organization_id', input.organizationId)
    .eq('is_active', true)
    .ilike('name', `%${term}%`)
    .limit(8)

  if (fromProducts.error && fromProducts.error.code !== 'PGRST205') {
    throw fromProducts.error
  }
  if (!fromProducts.error && fromProducts.data?.length) {
    return (fromProducts.data || []).map(
      (r: Record<string, unknown>): QuoteRow => ({
        service_name: String(r.name || ''),
        unit_price: r.price,
        currency: (r.currency as string) || 'USD',
        description: (r.description as string) || null,
        source: 'products',
      }),
    )
  }

  // 2) organization_catalog (sync/admin legacy; columnas active / is_active según migraciones)
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
    return catFiltered.slice(0, 8).map(
      (r: Record<string, unknown>): QuoteRow => ({
        service_name: String(r.service_name || ''),
        unit_price: r.public_price ?? r.unit_price ?? r.price,
        currency: (r.currency as string) || 'USD',
        description: (r.description as string) || null,
        source: 'organization_catalog',
      }),
    )
  }

  // 3) price_catalog (schema 006 legacy)
  const { data, error } = await supabase
    .from('price_catalog')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('is_active', true)
    .ilike('service_name', `%${term}%`)
    .limit(8)
  if (error?.code === 'PGRST205') return []
  if (error) throw error
  return (data || []).map(
    (r: Record<string, unknown>): QuoteRow => ({
      service_name: String(r.service_name || ''),
      unit_price: r.unit_price,
      currency: (r.currency as string) || 'USD',
      description: (r.description as string) || null,
      source: 'price_catalog',
    }),
  )
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
    ended_at: input.ended ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
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
    ended_at: input.ended ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
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
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) {
    const retry = await supabase
      .from('call_logs')
      .insert({
        ...legacyPayload,
        started_at: new Date().toISOString(),
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
