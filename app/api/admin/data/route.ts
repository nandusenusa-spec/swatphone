import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { syncTeamMembersFromTransferDestinations } from '@/lib/dashboard/sync-team-transfer-routing'
import { NextRequest, NextResponse } from 'next/server'
import { normalizePhone } from '@/lib/phone'
import { isValidJobStatus } from '@/lib/print-shop/service'
import {
  isAllowedWorkOrderStatus,
  WORK_ORDER_STATUS_WHITELIST,
} from '@/lib/admin/work-order-status'
import { createHmac, timingSafeEqual } from 'crypto'

function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function pgErr(e: unknown): { code: string; message: string; details: string } | null {
  if (!e || typeof e !== 'object') return null
  const o = e as Record<string, unknown>
  const code = typeof o.code === 'string' ? o.code : ''
  const message = typeof o.message === 'string' ? o.message : ''
  const details = typeof o.details === 'string' ? o.details : ''
  if (!code && !message) return null
  return { code, message, details }
}

function isPostgrestMissingRelation(err: unknown): boolean {
  const p = pgErr(err)
  const m = (p?.message || '').toLowerCase()
  return p?.code === 'PGRST205' || m.includes('could not find the table')
}

function isUnknownColumnError(err: unknown): boolean {
  const m = (pgErr(err)?.message || '').toLowerCase()
  return m.includes('column') && (m.includes('does not exist') || m.includes('schema cache'))
}

/** Mensajes claros para duplicados y conflictos frecuentes en el panel admin. */
function friendlyAdminMutationError(e: unknown): {
  message: string
  status: number
  error_code?: string
} {
  const fromErr = e instanceof Error ? e.message : ''
  const pg = pgErr(e)
  const msg = (pg?.message || fromErr || '').trim()
  const details = (pg?.details || '').trim()
  const combined = `${msg} ${details}`.toLowerCase()
  const code = pg?.code || ''

  if (
    combined.includes('already been registered') ||
    combined.includes('user already registered') ||
    combined.includes('email already exists') ||
    (combined.includes('email') &&
      combined.includes('already') &&
      (combined.includes('user') || combined.includes('registered')))
  ) {
    return {
      message:
        'Ese correo del owner ya está registrado (cuenta duplicada en acceso). Opciones: usá otro email; o en Supabase → Authentication → Users eliminá el usuario con ese correo y volvé a intentar el alta.',
      status: 409,
      error_code: 'duplicate_owner_email',
    }
  }

  if (
    code === '23505' ||
    combined.includes('duplicate key') ||
    combined.includes('unique constraint') ||
    combined.includes('already exists')
  ) {
    if (combined.includes('slug') || combined.includes('organizations_slug')) {
      return {
        message:
          'Ya existe una empresa con ese identificador (nombre/slug repetido). Cambiá el nombre de la empresa o revisá clientes existentes.',
        status: 409,
        error_code: 'duplicate_organization_slug',
      }
    }
    if (combined.includes('profiles') && combined.includes('email')) {
      return {
        message:
          'Ese email ya figura en perfiles (duplicado). El owner podría existir de un intento anterior: revisá en Authentication → Users o usá otro correo.',
        status: 409,
        error_code: 'duplicate_profile_email',
      }
    }
    if (
      combined.includes('team_members') ||
      (combined.includes('phone') && combined.includes('team')) ||
      /\(organization_id.*phone\)|\(phone.*organization_id\)/i.test(combined)
    ) {
      return {
        message:
          'No se pudo sincronizar Equipo: otro miembro del equipo ya usa ese E.164, o hay filas viejas en Equipo que chocan al actualizar. En Super Admin volvé a guardar tras recargar; si sigue igual, en Supabase ejecutá scripts/015_team_members_allow_duplicate_phone.sql o revisá la tabla Equipo por duplicados de teléfono.',
        status: 409,
        error_code: 'duplicate_team_phone',
      }
    }
    if (combined.includes('organization_routing') && combined.includes('organization_id')) {
      return {
        message:
          'Conflicto al guardar destinos de transferencia (clave duplicada por empresa). Recargá la página y guardá de nuevo; si persiste, revisá la fila en organization_routing para esa organización.',
        status: 409,
        error_code: 'duplicate_organization_routing',
      }
    }
    return {
      message:
        'Ese dato ya existe en la base y no puede repetirse. Revisá email, nombre de empresa, internos duplicados u otros campos únicos.',
      status: 409,
      error_code: 'duplicate',
    }
  }

  if (code === '23503' || combined.includes('foreign key')) {
    return {
      message:
        'No se pudo guardar: falta un dato relacionado (referencia inválida). Revisá que la empresa o el usuario existan.',
      status: 400,
      error_code: 'foreign_key',
    }
  }

  if (
    combined.includes('does not exist') ||
    combined.includes('schema cache') ||
    combined.includes('column') && combined.includes('assistant_configs')
  ) {
    if (combined.includes('first_message') || combined.includes('greeting_message')) {
      return {
        message:
          'assistant_configs: la API aún no ve first_message/greeting_message. 1) En Supabase → SQL Editor ejecutá scripts/016_assistant_configs_vapi_columns.sql (incluye NOTIFY al final). 2) Si ya lo hiciste: ejecutá solo `NOTIFY pgrst, \'reload schema\';` o en Dashboard API buscá recargar esquema. 3) Confirmá que .env usa el mismo proyecto Supabase.',
        status: 500,
        error_code: 'assistant_configs_schema',
      }
    }
  }

  if (msg) {
    return { message: msg, status: code ? 500 : 400 }
  }
  return {
    message: 'No se pudo completar la operación. Revisá los datos o intentá de nuevo.',
    status: 500,
  }
}

// Middleware para verificar admin token
type AdminTokenPayload = {
  adminId: string
  username: string
  exp: number
}

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
  if (!payloadEncoded || !signature || !verifyTokenSignature(payloadEncoded, signature)) {
    return null
  }

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
    const fromHeader = authHeader.split(' ')[1]?.trim()
    if (fromHeader) return fromHeader
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

export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const id = searchParams.get('id')

  // Usar service role para bypass RLS
  const supabase = createServiceRoleClient()

  try {
    switch (type) {
      case 'organizations': {
        const { data: orgs, error: orgsError } = await supabase
          .from('organizations')
          .select('*')
          .order('created_at', { ascending: false })

        if (orgsError) throw orgsError
        const list = orgs || []
        const ids = list.map((o: { id: string }) => o.id).filter(Boolean)
        let credentialStoreAvailable = true
        const credByOrg: Record<
          string,
          { owner_email: string; password_plaintext: string; updated_at: string | null }
        > = {}

        if (ids.length > 0) {
          const { data: creds, error: credErr } = await supabase
            .from('organization_owner_credential_store')
            .select('organization_id, owner_email, password_plaintext, updated_at')
            .in('organization_id', ids)

          if (credErr) {
            const code = (credErr as { code?: string }).code
            if (code === 'PGRST205') {
              credentialStoreAvailable = false
            } else {
              throw credErr
            }
          } else {
            for (const row of creds || []) {
              const oid = row.organization_id as string
              if (!oid) continue
              credByOrg[oid] = {
                owner_email: String(row.owner_email || ''),
                password_plaintext: String(row.password_plaintext || ''),
                updated_at: row.updated_at ? String(row.updated_at) : null,
              }
            }
          }
        }

        let ownerProfiles: Array<{ organization_id?: string; email?: string | null }> = []
        if (ids.length > 0) {
          const prof = await supabase
            .from('profiles')
            .select('organization_id, email')
            .eq('role', 'owner')
            .in('organization_id', ids)
          if (prof.error && isUnknownColumnError(prof.error)) {
            const slim = await supabase
              .from('profiles')
              .select('organization_id')
              .eq('role', 'owner')
              .in('organization_id', ids)
            if (slim.error) throw slim.error
            ownerProfiles = (slim.data || []).map((r) => ({ ...r, email: null }))
          } else if (prof.error) {
            throw prof.error
          } else {
            ownerProfiles = prof.data || []
          }
        }
        const ownerEmailByOrg: Record<string, string> = {}
        for (const p of ownerProfiles || []) {
          const oid = p.organization_id as string
          const em = typeof p.email === 'string' ? p.email : ''
          if (oid && em && !ownerEmailByOrg[oid]) ownerEmailByOrg[oid] = em
        }

        const data = list.map((o: Record<string, unknown>) => {
          const id = String(o.id || '')
          const stored = credByOrg[id]
          const fallbackEmail = ownerEmailByOrg[id] || ''
          return {
            ...o,
            owner_credential: stored
              ? {
                  owner_email: stored.owner_email || fallbackEmail,
                  password_plaintext: stored.password_plaintext,
                  updated_at: stored.updated_at,
                }
              : fallbackEmail
                ? {
                    owner_email: fallbackEmail,
                    password_plaintext: null as string | null,
                    updated_at: null as string | null,
                  }
                : null,
          }
        })

        return NextResponse.json({
          data,
          credential_store_available: credentialStoreAvailable,
        })
      }

      case 'organization':
        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
        
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', id)
          .single()
        
        if (orgError) throw orgError
        return NextResponse.json({ data: org })

      case 'products':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('*')
          .eq('organization_id', id)
          .order('name')
        
        if (productsError) throw productsError
        return NextResponse.json({ data: products })

      case 'faqs':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        
        const { data: faqs, error: faqsError } = await supabase
          .from('faqs')
          .select('*')
          .eq('organization_id', id)
        
        if (faqsError) throw faqsError
        return NextResponse.json({ data: faqs })

      case 'team':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        
        const { data: team, error: teamError } = await supabase
          .from('team_members')
          .select('*')
          .eq('organization_id', id)
        
        if (teamError) throw teamError
        return NextResponse.json({ data: team })

      case 'work_orders':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        const { data: workOrders, error: woErr } = await supabase
          .from('work_orders')
          .select('*, customers(name, phone, email)')
          .eq('organization_id', id)
          .order('updated_at', { ascending: false })
          .limit(200)
        if (woErr?.code === 'PGRST205') {
          return NextResponse.json({ data: [], note: 'work_orders table missing' })
        }
        if (woErr) throw woErr
        return NextResponse.json({ data: workOrders || [] })

      case 'calls':
        const callsQuery = supabase
          .from('calls')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100)

        if (id) callsQuery.eq('organization_id', id)

        const { data: calls, error: callsError } = await callsQuery
        if (callsError) {
          if (!isPostgrestMissingRelation(callsError)) throw callsError
        } else if (calls && calls.length > 0) {
          const shaped = (calls as Record<string, unknown>[]).map((r) => ({
            ...r,
            organizations: null,
          }))
          return NextResponse.json({ data: shaped })
        }

        const callLogsBase = supabase
          .from('call_logs')
          .select(
            'id, organization_id, phone, transcript, summary, result, started_at, created_at, ended_at, outcome',
          )
          .order('created_at', { ascending: false })
          .limit(100)
        if (id) callLogsBase.eq('organization_id', id)
        const { data: callLogs, error: callLogsError } = await callLogsBase
        if (callLogsError) {
          if (isPostgrestMissingRelation(callLogsError)) {
            return NextResponse.json({ data: [] })
          }
          throw callLogsError
        }

        const normalizedCalls = (callLogs || []).map((r: Record<string, unknown>) => {
          const startedAt = typeof r.started_at === 'string' ? r.started_at : null
          const endedAt = typeof r.ended_at === 'string' ? r.ended_at : null
          let durationSeconds = 0
          if (startedAt && endedAt) {
            const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
            durationSeconds = Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : 0
          }
          const status = typeof r.result === 'string' ? r.result : typeof r.outcome === 'string' ? r.outcome : 'completed'
          return {
            id: String(r.id || ''),
            phone_number: String(r.phone || ''),
            direction: 'inbound',
            status,
            duration_seconds: durationSeconds,
            transcript: typeof r.transcript === 'string' ? r.transcript : null,
            summary: typeof r.summary === 'string' ? r.summary : null,
            sentiment: null,
            recording_url: null,
            created_at: String(r.created_at || new Date().toISOString()),
            organizations: null,
          }
        })
        return NextResponse.json({ data: normalizedCalls })

      case 'leads':
        const leadsQuery = supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100)

        if (id) leadsQuery.eq('organization_id', id)

        const { data: leads, error: leadsError } = await leadsQuery
        if (leadsError) {
          if (!isPostgrestMissingRelation(leadsError)) throw leadsError
        } else if (leads && leads.length > 0) {
          const withOrg = (leads as Record<string, unknown>[]).map((r) => ({
            ...r,
            organizations: null,
          }))
          return NextResponse.json({ data: withOrg })
        }

        const customersQuery = supabase
          .from('customers')
          .select('id, organization_id, name, phone, email, company, created_at')
          .order('created_at', { ascending: false })
          .limit(100)
        if (id) customersQuery.eq('organization_id', id)
        const { data: customers, error: customersError } = await customersQuery
        if (customersError) {
          if (isPostgrestMissingRelation(customersError)) {
            return NextResponse.json({ data: [] })
          }
          throw customersError
        }

        const normalizedLeads = (customers || []).map((r: Record<string, unknown>) => ({
          id: String(r.id || ''),
          name: typeof r.name === 'string' ? r.name : null,
          phone: String(r.phone || ''),
          email: typeof r.email === 'string' ? r.email : null,
          company: typeof r.company === 'string' ? r.company : null,
          status: 'new',
          score: 0,
          created_at: String(r.created_at || new Date().toISOString()),
          organizations: null,
        }))
        return NextResponse.json({ data: normalizedLeads })

      case 'assistant_config':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })

        const { data: cfgRows, error: configError } = await supabase
          .from('assistant_configs')
          .select('*')
          .eq('organization_id', id)
          .order('updated_at', { ascending: false })
          .limit(1)

        if (configError && configError.code !== 'PGRST116') throw configError
        const rawCfg = cfgRows?.[0] || null
        const config = rawCfg
          ? {
              ...rawCfg,
              first_message:
                (rawCfg as Record<string, unknown>).first_message ??
                (rawCfg as Record<string, unknown>).greeting_message ??
                null,
            }
          : null
        return NextResponse.json({ data: config })

      case 'owner_credential':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        const { data: ownerCred, error: ownerCredErr } = await supabase
          .from('organization_owner_credential_store')
          .select('owner_email, owner_user_id, password_plaintext, note, updated_at')
          .eq('organization_id', id)
          .maybeSingle()
        if (ownerCredErr) {
          if (isPostgrestMissingRelation(ownerCredErr)) {
            return NextResponse.json({ data: null })
          }
          throw ownerCredErr
        }
        return NextResponse.json({ data: ownerCred })

      case 'phone_screening':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        try {
          const { listPhoneScreening } = await import('@/lib/vapi/phone-screening')
          const rows = await listPhoneScreening(id)
          return NextResponse.json({ data: rows })
        } catch (e) {
          if (isPostgrestMissingRelation(e)) return NextResponse.json({ data: [] })
          throw e
        }

      case 'voice_runtime_config':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        const [routing, ai] = await Promise.all([
          supabase
            .from('organization_routing')
            .select('*')
            .eq('organization_id', id)
            .maybeSingle(),
          supabase
            .from('organization_ai_config')
            .select('*')
            .eq('organization_id', id)
            .maybeSingle(),
        ])
        if (routing.error && !isPostgrestMissingRelation(routing.error)) throw routing.error
        if (ai.error && !isPostgrestMissingRelation(ai.error)) throw ai.error
        return NextResponse.json({
          data: {
            routing: routing.error ? null : routing.data || null,
            ai: ai.error ? null : ai.data || null,
          },
        })

      case 'stats': {
        const [orgsCount, legacyCallsCount, leadsCount, callLogsCount] = await Promise.all([
          supabase.from('organizations').select('id', { count: 'exact', head: true }),
          supabase.from('calls').select('id', { count: 'exact', head: true }),
          supabase.from('leads').select('id', { count: 'exact', head: true }),
          supabase.from('call_logs').select('id', { count: 'exact', head: true }),
        ])
        const safeCount = (r: { count: number | null; error: unknown }) =>
          r.error && !isPostgrestMissingRelation(r.error) ? null : r.count || 0
        const orgN = safeCount(orgsCount)
        const legacyN = safeCount(legacyCallsCount)
        const leadsN = safeCount(leadsCount)
        const logsN = safeCount(callLogsCount)
        if (orgN === null || legacyN === null || leadsN === null || logsN === null) {
          const firstErr = [orgsCount, legacyCallsCount, leadsCount, callLogsCount].find((x) => x.error)
          throw firstErr?.error || new Error('stats count failed')
        }
        const voiceCalls = logsN
        const legacyCalls = legacyN
        return NextResponse.json({
          data: {
            organizations: orgN,
            calls: voiceCalls + legacyCalls,
            call_logs: voiceCalls,
            legacy_calls: legacyCalls,
            leads: leadsN,
          },
        })
      }

      case 'print_clients':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        const { data: printClients, error: pcErr } = await supabase
          .from('clients')
          .select('*')
          .eq('organization_id', id)
          .order('created_at', { ascending: false })
        if (pcErr) {
          if (isPostgrestMissingRelation(pcErr)) return NextResponse.json({ data: [] })
          throw pcErr
        }
        return NextResponse.json({ data: printClients })

      case 'print_jobs':
        if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        const { data: orgClients, error: ocErr } = await supabase
          .from('clients')
          .select('id')
          .eq('organization_id', id)
        if (ocErr) {
          if (isPostgrestMissingRelation(ocErr)) return NextResponse.json({ data: [] })
          throw ocErr
        }
        const cids = (orgClients || []).map((c) => c.id)
        if (cids.length === 0) {
          return NextResponse.json({ data: [] })
        }
        const { data: printJobs, error: pjErr } = await supabase
          .from('jobs')
          .select('*')
          .in('client_id', cids)
          .order('created_at', { ascending: false })
        if (pjErr) {
          if (isPostgrestMissingRelation(pjErr)) return NextResponse.json({ data: [] })
          throw pjErr
        }
        return NextResponse.json({ data: printJobs })

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
  } catch (error) {
    console.error('Admin data error:', error)
    const friendly = friendlyAdminMutationError(error)
    return NextResponse.json(
      { error: friendly.message, error_code: friendly.error_code },
      { status: friendly.status },
    )
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminToken(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { type, id, data } = body

  const supabase = createServiceRoleClient()

  try {
    switch (type) {
      case 'update_organization':
        const { error: updateOrgError } = await supabase
          .from('organizations')
          .update(data)
          .eq('id', id)
        
        if (updateOrgError) throw updateOrgError
        return NextResponse.json({ success: true })

      case 'update_assistant_config': {
        const orgId = id as string
        if (!orgId) {
          return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
        }
        const payload = (data || {}) as Record<string, unknown>
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        }
        if (typeof payload.system_prompt === 'string') patch.system_prompt = payload.system_prompt
        if (typeof payload.first_message === 'string') {
          patch.first_message = payload.first_message
          patch.greeting_message = payload.first_message
        }
        for (const k of ['name', 'language', 'voice_id', 'max_tokens', 'temperature', 'voice_provider'] as const) {
          if (Object.prototype.hasOwnProperty.call(payload, k) && payload[k] !== undefined) {
            patch[k] = payload[k]
          }
        }

        const { data: activeCfg, error: activeErr } = await supabase
          .from('assistant_configs')
          .select('id')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (activeErr) throw activeErr

        let targetId = activeCfg?.id as string | undefined
        if (!targetId) {
          const { data: anyCfg, error: anyErr } = await supabase
            .from('assistant_configs')
            .select('id')
            .eq('organization_id', orgId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (anyErr) throw anyErr
          targetId = anyCfg?.id as string | undefined
        }

        const applyPatch = async (p: Record<string, unknown>) => {
          if (targetId) {
            return supabase.from('assistant_configs').update(p).eq('id', targetId)
          }
          return supabase.from('assistant_configs').insert({
            organization_id: orgId,
            is_active: true,
            name: 'Virtual Assistant',
            ...p,
          })
        }

        let { error: cfgUpdErr } = await applyPatch(patch)
        const errMsg = cfgUpdErr?.message || ''
        if (
          cfgUpdErr &&
          /first_message|greeting_message/i.test(errMsg) &&
          /column|schema cache/i.test(errMsg)
        ) {
          const { first_message: _drop, ...noFirst } = patch
          ;({ error: cfgUpdErr } = await applyPatch(noFirst))
        }
        if (cfgUpdErr) throw cfgUpdErr

        if (typeof payload.system_prompt === 'string') {
          const { error: aiErr } = await supabase.from('organization_ai_config').upsert(
            { organization_id: orgId, system_prompt: payload.system_prompt },
            { onConflict: 'organization_id' },
          )
          if (aiErr && aiErr.code !== 'PGRST205') {
            console.warn('[update_assistant_config] organization_ai_config sync skipped:', aiErr.message)
          }
        }

        return NextResponse.json({ success: true })
      }

      case 'create_organization_with_owner': {
        const companyName = typeof data?.name === 'string' ? data.name.trim() : ''
        const ownerEmail = typeof data?.owner_email === 'string' ? data.owner_email.trim().toLowerCase() : ''
        const ownerPassword = typeof data?.owner_password === 'string' ? data.owner_password : ''
        const timezone = typeof data?.timezone === 'string' ? data.timezone.trim() || 'America/New_York' : 'America/New_York'
        const assistantId = typeof data?.vapi_assistant_id === 'string' ? data.vapi_assistant_id.trim() || null : null
        const transferNumber = typeof data?.ramon_transfer_number === 'string' ? data.ramon_transfer_number.trim() || null : null
        if (!companyName || !ownerEmail || ownerPassword.length < 8) {
          return NextResponse.json(
            { error: 'name, owner_email and owner_password(min 8) are required' },
            { status: 400 },
          )
        }
        const baseSlug = slugifyName(
          typeof data?.slug === 'string' && data.slug.trim() ? data.slug : companyName,
        )
        if (!baseSlug) return NextResponse.json({ error: 'invalid slug/name' }, { status: 400 })

        let slug = baseSlug
        for (let n = 0; n < 100; n++) {
          const trySlug = n === 0 ? slug : `${baseSlug}-${n}`
          const { data: ex, error: exErr } = await supabase
            .from('organizations')
            .select('id')
            .eq('slug', trySlug)
            .maybeSingle()
          if (exErr) throw exErr
          if (!ex) {
            slug = trySlug
            break
          }
        }

        const { data: createdOrg, error: orgErr } = await supabase
          .from('organizations')
          .insert({
            name: companyName,
            slug,
            timezone,
            vapi_assistant_id: assistantId,
            settings: {},
          })
          .select('*')
          .single()
        if (orgErr) throw orgErr

        const owner = await supabase.auth.admin.createUser({
          email: ownerEmail,
          password: ownerPassword,
          email_confirm: true,
          user_metadata: { full_name: companyName, organization_id: createdOrg.id },
        })
        if (owner.error || !owner.data.user) {
          await supabase.from('organizations').delete().eq('id', createdOrg.id)
          const raw = owner.error?.message || 'failed_to_create_owner_user'
          const friendly = friendlyAdminMutationError(new Error(raw))
          return NextResponse.json(
            { error: friendly.message, error_code: friendly.error_code },
            { status: friendly.status },
          )
        }

        const { error: profileErr } = await supabase.from('profiles').upsert({
          id: owner.data.user.id,
          organization_id: createdOrg.id,
          email: ownerEmail,
          role: 'owner',
          full_name: companyName,
          updated_at: new Date().toISOString(),
        })
        if (profileErr) {
          await supabase.auth.admin.deleteUser(owner.data.user.id)
          await supabase.from('organizations').delete().eq('id', createdOrg.id)
          throw profileErr
        }

        await supabase
          .from('organization_ai_config')
          .upsert(
            {
              organization_id: createdOrg.id,
              welcome_message: `Hola, gracias por llamar a ${companyName}. ¿En qué puedo ayudarte hoy?`,
              fallback_message: 'En este momento no pude validar los datos. Te contactaremos.',
              allowed_tools: [
                'find_customer',
                'get_job_status',
                'create_appointment',
                'create_work_order',
                'get_price_quote',
                'prepare_warm_transfer',
                'transfer_to_ramon',
                'save_call_outcome',
                'mark_spam_call',
                'create_follow_up',
              ],
            },
            { onConflict: 'organization_id' },
          )

        await supabase
          .from('organization_routing')
          .upsert(
            {
              organization_id: createdOrg.id,
              allow_live_transfer: true,
              callback_default_owner: 'Ramon',
              ramon_transfer_number: transferNumber,
            },
            { onConflict: 'organization_id' },
          )

        const { error: credStoreErr } = await supabase.from('organization_owner_credential_store').upsert(
          {
            organization_id: createdOrg.id,
            owner_user_id: owner.data.user.id,
            owner_email: ownerEmail,
            password_plaintext: ownerPassword,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id' },
        )
        if (credStoreErr) {
          console.error('organization_owner_credential_store upsert:', credStoreErr)
          await supabase.auth.admin.deleteUser(owner.data.user.id)
          await supabase.from('organizations').delete().eq('id', createdOrg.id)
          const rawMsg = (credStoreErr as { message?: string }).message || String(credStoreErr)
          const code = (credStoreErr as { code?: string }).code
          const missingTable =
            code === 'PGRST205' ||
            rawMsg.toLowerCase().includes('organization_owner_credential_store')
          const friendly = friendlyAdminMutationError(credStoreErr)
          return NextResponse.json(
            {
              error: missingTable
                ? 'Falta la tabla organization_owner_credential_store en Supabase. Ejecutá scripts/011_organization_owner_credential_store.sql en el SQL Editor y volvé a crear el cliente.'
                : friendly.message,
              error_code: missingTable ? 'credential_store_table_missing' : friendly.error_code,
            },
            { status: missingTable ? 500 : friendly.status },
          )
        }

        return NextResponse.json({
          success: true,
          data: {
            organization_id: createdOrg.id,
            organization_slug: slug,
            owner_email: ownerEmail,
            owner_password: ownerPassword,
            login_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/auth/login`,
          },
        })
      }

      case 'save_owner_credential': {
        const orgId = (id || data?.organization_id) as string | undefined
        const newPass =
          typeof data?.password_plaintext === 'string' ? data.password_plaintext : ''
        const note = typeof data?.note === 'string' ? data.note.trim() || null : null
        if (!orgId || newPass.length < 8) {
          return NextResponse.json(
            { error: 'organization_id and password_plaintext (min 8) required' },
            { status: 400 },
          )
        }

        const { data: existing, error: exErr } = await supabase
          .from('organization_owner_credential_store')
          .select('owner_user_id, owner_email')
          .eq('organization_id', orgId)
          .maybeSingle()
        if (exErr) throw exErr

        let ownerUserId = existing?.owner_user_id as string | undefined
        let ownerEmail = (existing?.owner_email as string | undefined) || ''

        if (!ownerUserId) {
          const { data: prof, error: pErr } = await supabase
            .from('profiles')
            .select('id')
            .eq('organization_id', orgId)
            .eq('role', 'owner')
            .limit(1)
            .maybeSingle()
          if (pErr) throw pErr
          if (!prof?.id) {
            return NextResponse.json({ error: 'no_owner_profile_for_org' }, { status: 404 })
          }
          ownerUserId = prof.id as string
          const u = await supabase.auth.admin.getUserById(ownerUserId)
          ownerEmail = u.data.user?.email || ownerEmail
        }

        const updAuth = await supabase.auth.admin.updateUserById(ownerUserId, { password: newPass })
        if (updAuth.error) {
          return NextResponse.json({ error: updAuth.error.message }, { status: 400 })
        }

        const { error: upErr } = await supabase.from('organization_owner_credential_store').upsert(
          {
            organization_id: orgId,
            owner_user_id: ownerUserId,
            owner_email: ownerEmail || (updAuth.data.user?.email ?? ''),
            password_plaintext: newPass,
            note,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id' },
        )
        if (upErr) throw upErr
        return NextResponse.json({ success: true })
      }

      case 'reset_owner_password': {
        const orgId = (id || data?.organization_id) as string | undefined
        if (!orgId) {
          return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
        }
        const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVW23456789'
        const newPass = Array.from({ length: 14 }, () =>
          chars.charAt(Math.floor(Math.random() * chars.length)),
        ).join('')

        const { data: existing, error: exErr } = await supabase
          .from('organization_owner_credential_store')
          .select('owner_user_id, owner_email')
          .eq('organization_id', orgId)
          .maybeSingle()
        if (exErr) throw exErr

        let ownerUserId = existing?.owner_user_id as string | undefined
        let ownerEmail = (existing?.owner_email as string | undefined) || ''

        if (!ownerUserId) {
          const { data: prof, error: pErr } = await supabase
            .from('profiles')
            .select('id')
            .eq('organization_id', orgId)
            .eq('role', 'owner')
            .limit(1)
            .maybeSingle()
          if (pErr) throw pErr
          if (!prof?.id) {
            return NextResponse.json({ error: 'no_owner_profile_for_org' }, { status: 404 })
          }
          ownerUserId = prof.id as string
          const u = await supabase.auth.admin.getUserById(ownerUserId)
          ownerEmail = u.data.user?.email || ownerEmail
        }

        const updAuth = await supabase.auth.admin.updateUserById(ownerUserId, { password: newPass })
        if (updAuth.error) {
          return NextResponse.json({ error: updAuth.error.message }, { status: 400 })
        }

        const { error: upErr } = await supabase.from('organization_owner_credential_store').upsert(
          {
            organization_id: orgId,
            owner_user_id: ownerUserId,
            owner_email: ownerEmail || (updAuth.data.user?.email ?? ''),
            password_plaintext: newPass,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id' },
        )
        if (upErr) throw upErr
        return NextResponse.json({ success: true, data: { password_plaintext: newPass } })
      }

      case 'update_voice_runtime': {
        const orgId = id || data?.organization_id
        if (!orgId) return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
        const routingPatch: Record<string, unknown> = { organization_id: orgId }
        const aiPatch: Record<string, unknown> = { organization_id: orgId }
        const setIf = (obj: Record<string, unknown>, key: string, val: unknown) => {
          if (val !== undefined) obj[key] = val
        }
        setIf(routingPatch, 'allow_live_transfer', data?.allow_live_transfer)
        setIf(routingPatch, 'ramon_transfer_number', data?.ramon_transfer_number || null)
        setIf(routingPatch, 'default_transfer_number', data?.default_transfer_number || null)
        setIf(routingPatch, 'urgent_transfer_number', data?.urgent_transfer_number || null)
        setIf(routingPatch, 'callback_default_owner', data?.callback_default_owner || null)

        if (data?.transfer_destinations !== undefined) {
          const raw = data.transfer_destinations
          if (!Array.isArray(raw)) {
            routingPatch.transfer_destinations = []
          } else {
            routingPatch.transfer_destinations = raw
              .map((row: Record<string, unknown>) => ({
                extension:
                  typeof row.extension === 'string'
                    ? row.extension.trim()
                    : typeof row.internal === 'string'
                      ? row.internal.trim()
                      : '',
                name:
                  typeof row.name === 'string'
                    ? row.name.trim()
                    : typeof row.label === 'string'
                      ? row.label.trim()
                      : '',
                phone_e164:
                  typeof row.phone_e164 === 'string'
                    ? row.phone_e164.trim()
                    : typeof row.phone === 'string'
                      ? row.phone.trim()
                      : '',
              }))
              .filter((r: { name: string; phone_e164: string }) => r.name && r.phone_e164)
          }
        }

        if (Array.isArray(data?.allowed_tools)) {
          aiPatch.allowed_tools = data.allowed_tools
        }

        const [routingUpsert, aiUpsert] = await Promise.all([
          supabase.from('organization_routing').upsert(routingPatch, { onConflict: 'organization_id' }),
          Object.keys(aiPatch).length > 1
            ? supabase.from('organization_ai_config').upsert(aiPatch, { onConflict: 'organization_id' })
            : Promise.resolve({ error: null } as { error: null }),
        ])
        if (routingUpsert.error) throw routingUpsert.error
        if (aiUpsert.error) throw aiUpsert.error

        let team_sync_warning: string | null = null
        if (data?.transfer_destinations !== undefined) {
          const td = routingPatch.transfer_destinations
          try {
            await syncTeamMembersFromTransferDestinations(
              supabase,
              orgId,
              Array.isArray(td)
                ? (td as { extension: string; name: string; phone_e164: string }[])
                : [],
            )
          } catch (syncErr) {
            const friendly = friendlyAdminMutationError(syncErr)
            team_sync_warning =
              friendly.message ||
              (syncErr instanceof Error ? syncErr.message : 'No se pudo sincronizar Equipo (team_members).')
            console.error('[update_voice_runtime] team sync failed', syncErr)
          }
        }

        return NextResponse.json({ success: true, team_sync_warning })
      }

      case 'update_phone_screening': {
        const orgId = (id || (data as Record<string, unknown>)?.organization_id) as string | undefined
        if (!orgId) {
          return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
        }
        const phone = typeof (data as Record<string, unknown>)?.phone === 'string'
          ? (data as Record<string, unknown>).phone.trim()
          : ''
        if (!phone) {
          return NextResponse.json({ error: 'phone required' }, { status: 400 })
        }
        const blocked = Boolean((data as Record<string, unknown>)?.blocked)
        const manual = (data as Record<string, unknown>)?.manual !== false
        const reasonRaw = (data as Record<string, unknown>)?.reason
        const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() || undefined : undefined
        try {
          const { adminSetPhoneBlock } = await import('@/lib/vapi/phone-screening')
          await adminSetPhoneBlock({
            organizationId: orgId,
            phone,
            blocked,
            manual: blocked ? manual : false,
            reason,
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (msg.includes('invalid_phone')) {
            return NextResponse.json({ error: 'Número inválido' }, { status: 400 })
          }
          throw e
        }
        return NextResponse.json({ success: true })
      }

      case 'create_print_client': {
        const orgId = id || data?.organization_id
        const name = data?.name as string
        const phoneRaw = data?.phone as string
        const company = (data?.company as string) || null
        if (!orgId || !name?.trim() || !phoneRaw?.trim()) {
          return NextResponse.json({ error: 'organization_id, name, phone required' }, { status: 400 })
        }
        const phone = normalizePhone(phoneRaw)
        if (!phone) {
          return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
        }
        const { data: row, error: insErr } = await supabase
          .from('clients')
          .insert({
            organization_id: orgId,
            name: name.trim(),
            phone,
            company,
            updated_at: new Date().toISOString(),
          })
          .select('*')
          .single()
        if (insErr) throw insErr
        return NextResponse.json({ success: true, data: row })
      }

      case 'update_print_client': {
        const clientId = id
        if (!clientId) return NextResponse.json({ error: 'client id required' }, { status: 400 })
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (typeof data?.name === 'string') patch.name = data.name.trim()
        if (typeof data?.company === 'string') patch.company = data.company
        if (typeof data?.phone === 'string') {
          const p = normalizePhone(data.phone)
          if (!p) return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
          patch.phone = p
        }
        const { error: uErr } = await supabase.from('clients').update(patch).eq('id', clientId)
        if (uErr) throw uErr
        return NextResponse.json({ success: true })
      }

      case 'create_print_job': {
        const clientId = data?.client_id as string
        if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
        const status = (data?.status as string) || 'received'
        if (!isValidJobStatus(status)) {
          return NextResponse.json({ error: 'invalid job status' }, { status: 400 })
        }
        const isActive = data?.is_active !== false
        const row = {
          client_id: clientId,
          title: (data?.title as string)?.trim() || 'Pedido',
          description: (data?.description as string) || null,
          requirements: (data?.requirements as string) || null,
          status,
          estimated_ready_at: (data?.estimated_ready_at as string) || null,
          pickup_instructions: (data?.pickup_instructions as string) || null,
          customer_message: (data?.customer_message as string) || null,
          internal_notes: (data?.internal_notes as string) || null,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        }
        const { data: jobRow, error: cjErr } = await supabase.from('jobs').insert(row).select('*').single()
        if (cjErr) throw cjErr
        if (isActive && jobRow?.id) {
          await supabase
            .from('jobs')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('client_id', clientId)
            .neq('id', jobRow.id)
        }
        return NextResponse.json({ success: true, data: jobRow })
      }

      case 'update_work_order': {
        const workOrderId = (id || data?.work_order_id) as string | undefined
        const orgId = typeof data?.organization_id === 'string' ? data.organization_id.trim() : ''
        if (!workOrderId || !orgId) {
          return NextResponse.json(
            { error: 'work order id and data.organization_id required' },
            { status: 400 },
          )
        }

        const { data: woRow, error: woFindErr } = await supabase
          .from('work_orders')
          .select('id, organization_id')
          .eq('id', workOrderId)
          .single()
        if (woFindErr?.code === 'PGRST116') {
          return NextResponse.json({ error: 'work order not found' }, { status: 404 })
        }
        if (woFindErr) throw woFindErr
        if (String(woRow?.organization_id) !== orgId) {
          return NextResponse.json({ error: 'organization mismatch' }, { status: 403 })
        }

        const parseTs = (
          v: unknown,
        ): { ok: true; value: string | null } | { ok: false } | { ok: 'omit' } => {
          if (v === undefined) return { ok: 'omit' }
          if (v === null) return { ok: true, value: null }
          if (typeof v !== 'string') return { ok: 'omit' }
          const t = v.trim()
          if (!t) return { ok: true, value: null }
          const d = new Date(t)
          if (Number.isNaN(d.getTime())) return { ok: false }
          return { ok: true, value: d.toISOString() }
        }

        const patch: Record<string, unknown> = {}

        if (data && Object.prototype.hasOwnProperty.call(data, 'status')) {
          const st = typeof data.status === 'string' ? data.status.trim().toLowerCase() : ''
          if (!st) {
            return NextResponse.json({ error: 'status cannot be empty' }, { status: 400 })
          }
          if (!isAllowedWorkOrderStatus(st)) {
            return NextResponse.json(
              {
                error: 'invalid work order status',
                allowed: [...WORK_ORDER_STATUS_WHITELIST],
              },
              { status: 400 },
            )
          }
          patch.status = st
        }

        const strFields = ['title', 'issue_description', 'owner'] as const
        for (const f of strFields) {
          if (data && Object.prototype.hasOwnProperty.call(data, f)) {
            const val = (data as Record<string, unknown>)[f]
            patch[f] = typeof val === 'string' ? val : val == null ? null : String(val)
          }
        }

        const tsFields = [
          'promised_date',
          'pickup_ready_at',
          'completed_at',
          'estimated_delivery_at',
          'confirmed_delivery_at',
        ] as const
        for (const f of tsFields) {
          if (data && Object.prototype.hasOwnProperty.call(data, f)) {
            const parsed = parseTs((data as Record<string, unknown>)[f])
            if (parsed.ok === false) {
              return NextResponse.json({ error: `invalid timestamp: ${f}` }, { status: 400 })
            }
            if (parsed.ok === true) {
              patch[f] = parsed.value
            }
          }
        }

        const numericFields = ['quoted_price', 'confirmed_price'] as const
        for (const f of numericFields) {
          if (data && Object.prototype.hasOwnProperty.call(data, f)) {
            const val = (data as Record<string, unknown>)[f]
            if (val === null || val === '') {
              patch[f] = null
            } else {
              const n = Number(val)
              if (!Number.isFinite(n)) {
                return NextResponse.json({ error: `invalid number: ${f}` }, { status: 400 })
              }
              patch[f] = n
            }
          }
        }

        if (Object.keys(patch).length === 0) {
          return NextResponse.json({ error: 'no updatable fields provided' }, { status: 400 })
        }

        patch.updated_at = new Date().toISOString()

        const { data: updated, error: woUpdErr } = await supabase
          .from('work_orders')
          .update(patch)
          .eq('id', workOrderId)
          .select('*')
          .single()
        if (woUpdErr) throw woUpdErr
        return NextResponse.json({ success: true, data: updated })
      }

      case 'update_print_job': {
        const jobId = id
        if (!jobId) return NextResponse.json({ error: 'job id required' }, { status: 400 })
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        const fields = [
          'title',
          'description',
          'requirements',
          'status',
          'estimated_ready_at',
          'pickup_instructions',
          'customer_message',
          'internal_notes',
          'is_active',
        ] as const
        for (const f of fields) {
          if (data && Object.prototype.hasOwnProperty.call(data, f)) {
            ;(patch as Record<string, unknown>)[f] = (data as Record<string, unknown>)[f]
          }
        }
        if (typeof patch.status === 'string' && !isValidJobStatus(patch.status as string)) {
          return NextResponse.json({ error: 'invalid job status' }, { status: 400 })
        }
        const { data: existingJob, error: exErr } = await supabase
          .from('jobs')
          .select('client_id')
          .eq('id', jobId)
          .single()
        if (exErr) throw exErr
        const { error: ujErr } = await supabase.from('jobs').update(patch).eq('id', jobId)
        if (ujErr) throw ujErr
        if (patch.is_active === true && existingJob?.client_id) {
          await supabase
            .from('jobs')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('client_id', existingJob.client_id)
            .neq('id', jobId)
        }
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
  } catch (error) {
    console.error('Admin update error:', error)
    const friendly = friendlyAdminMutationError(error)
    return NextResponse.json(
      { error: friendly.message, error_code: friendly.error_code },
      { status: friendly.status },
    )
  }
}
