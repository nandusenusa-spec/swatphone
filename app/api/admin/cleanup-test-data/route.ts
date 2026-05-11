import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

type AdminTokenPayload = { adminId: string; username: string; exp: number }

type CleanupBody = {
  organizationId?: string
  confirm?: string
  dryRun?: boolean
  recentHours?: number
  deleteCallLogs?: boolean
  deleteLeads?: boolean
  deleteFollowUps?: boolean
  deleteRecentVapiData?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONFIRM_TEXT = 'DELETE_TEST_DATA'

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
  if (!payloadEncoded || !signature || !verifyTokenSignature(payloadEncoded, signature)) return null
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
    const token = authHeader.split(' ')[1]?.trim()
    if (token) return token
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
  return Boolean(data?.length)
}

function isMissingTableOrColumn(error: unknown): boolean {
  const rec = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const code = typeof rec.code === 'string' ? rec.code : ''
  const message = typeof rec.message === 'string' ? rec.message.toLowerCase() : ''
  return (
    code === 'PGRST205' ||
    message.includes('could not find') ||
    message.includes('schema cache') ||
    (message.includes('column') && message.includes('does not exist'))
  )
}

function safeError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error)
  const rec = error as Record<string, unknown>
  return String(rec.message || rec.code || 'unknown_error').slice(0, 300)
}

async function countRows(input: {
  table: string
  organizationId: string
  dateColumn?: string
  sinceIso?: string | null
}): Promise<{ count: number | null; error: string | null }> {
  const supabase = createServiceRoleClient()
  let query = supabase
    .from(input.table)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', input.organizationId)
  if (input.sinceIso && input.dateColumn) {
    query = query.gte(input.dateColumn, input.sinceIso)
  }
  const { count, error } = await query
  if (error) {
    if (isMissingTableOrColumn(error)) return { count: null, error: safeError(error) }
    throw error
  }
  return { count: count ?? 0, error: null }
}

async function deleteRows(input: {
  table: string
  organizationId: string
  dateColumn?: string
  sinceIso?: string | null
}): Promise<{ deleted: number | null; error: string | null }> {
  const before = await countRows(input)
  if (before.error) return { deleted: null, error: before.error }

  const supabase = createServiceRoleClient()
  let query = supabase.from(input.table).delete().eq('organization_id', input.organizationId)
  if (input.sinceIso && input.dateColumn) {
    query = query.gte(input.dateColumn, input.sinceIso)
  }
  const { error } = await query
  if (error) {
    if (isMissingTableOrColumn(error)) return { deleted: null, error: safeError(error) }
    throw error
  }
  return { deleted: before.count, error: null }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminToken(request))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: CleanupBody
  try {
    body = (await request.json()) as CleanupBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const organizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : ''
  if (!UUID_RE.test(organizationId)) {
    return NextResponse.json({ ok: false, error: 'organizationId must be a valid UUID' }, { status: 400 })
  }
  if (body.confirm !== CONFIRM_TEXT) {
    return NextResponse.json(
      { ok: false, error: `confirm must be ${CONFIRM_TEXT}` },
      { status: 400 },
    )
  }

  const recentHoursRaw = Number(body.recentHours ?? 72)
  const recentHours = Number.isFinite(recentHoursRaw)
    ? Math.max(1, Math.min(24 * 30, Math.floor(recentHoursRaw)))
    : 72
  const sinceIso = new Date(Date.now() - recentHours * 60 * 60 * 1000).toISOString()
  const dryRun = body.dryRun === true

  const deleteCallLogs = body.deleteCallLogs !== false
  const deleteLeads = body.deleteLeads !== false
  const deleteFollowUps = body.deleteFollowUps !== false
  const deleteRecentVapiData = body.deleteRecentVapiData !== false

  const plan = [
    ...(deleteFollowUps ? [{ key: 'notifications', table: 'notifications', dateColumn: 'created_at', recentOnly: false }] : []),
    ...(deleteFollowUps ? [{ key: 'followUps', table: 'follow_ups', dateColumn: 'created_at', recentOnly: false }] : []),
    ...(deleteCallLogs ? [{ key: 'callClassifications', table: 'call_classifications', dateColumn: 'created_at', recentOnly: false }] : []),
    ...(deleteCallLogs ? [{ key: 'callLogs', table: 'call_logs', dateColumn: 'created_at', recentOnly: false }] : []),
    ...(deleteLeads ? [{ key: 'leads', table: 'leads', dateColumn: 'created_at', recentOnly: false }] : []),
    ...(deleteRecentVapiData
      ? [{ key: 'recentVapiRawEvents', table: 'vapi_call_events_raw', dateColumn: 'received_at', recentOnly: true }]
      : []),
  ]

  const results: Record<string, { count?: number | null; deleted?: number | null; error: string | null }> = {}
  try {
    for (const item of plan) {
      const since = item.recentOnly ? sinceIso : null
      if (dryRun) {
        const counted = await countRows({
          table: item.table,
          organizationId,
          dateColumn: item.dateColumn,
          sinceIso: since,
        })
        results[item.key] = { count: counted.count, error: counted.error }
      } else {
        const deleted = await deleteRows({
          table: item.table,
          organizationId,
          dateColumn: item.dateColumn,
          sinceIso: since,
        })
        results[item.key] = { deleted: deleted.deleted, error: deleted.error }
      }
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'cleanup_failed', message: safeError(error), results },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    organizationId,
    recentHours,
    recentSince: sinceIso,
    protectedTables: ['products', 'team_members', 'profiles/users', 'organizations/config', 'pricing', 'routing/transfers'],
    results,
  })
}
