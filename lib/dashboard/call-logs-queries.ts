import type { SupabaseClient } from '@supabase/supabase-js'

/** Column sets probados en orden (schemas legacy vs minimal bootstrap). */
const CALL_LOG_SELECT_ATTEMPTS = [
  'id, organization_id, phone, customer_name, vapi_call_id, transcript, summary, structured_extraction, started_at, ended_at, created_at, intent, result, outcome, next_action, validation_status, classification, spam_score',
  'id, organization_id, phone, customer_name, vapi_call_id, transcript, summary, structured_extraction, started_at, ended_at, created_at, intent, outcome, next_action',
  'id, organization_id, phone, vapi_call_id, transcript, summary, structured_extraction, started_at, ended_at, created_at, intent, outcome',
  'id, organization_id, phone, transcript, summary, structured_extraction, created_at, started_at, ended_at, vapi_call_id',
] as const

export type DashboardCallLogRow = Record<string, unknown>

function logCallsQueryError(
  prefix: 'dashboard/calls-query',
  err: { code?: string; message?: string },
  filtersUsed: Record<string, unknown>,
) {
  console.error(`[${prefix}]`, {
    status: 'error',
    code: err.code ?? null,
    message: err.message ?? null,
    details: null,
    hint: null,
    table: 'call_logs',
    filtersUsed,
  })
}

export async function fetchDashboardCallLogs(
  service: SupabaseClient,
  organizationId: string,
  limit = 100,
): Promise<{ rows: DashboardCallLogRow[]; columnsUsed: string | null }> {
  const filtersUsed = { organization_id: organizationId, limit, order: 'created_at desc' }

  for (const cols of CALL_LOG_SELECT_ATTEMPTS) {
    const res = await service
      .from('call_logs')
      .select(cols)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!res.error && res.data) {
      return { rows: res.data as DashboardCallLogRow[], columnsUsed: cols }
    }
    if (res.error) {
      logCallsQueryError('dashboard/calls-query', res.error, { ...filtersUsed, attempted_select: cols })
    }
  }

  return { rows: [], columnsUsed: null }
}

export async function countCallLogsTotal(
  service: SupabaseClient,
  organizationId: string,
): Promise<number> {
  const res = await service
    .from('call_logs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)

  if (res.error) {
    console.error('[dashboard/calls-query]', {
      status: 'error',
      code: res.error.code,
      message: res.error.message,
      details: (res.error as { details?: string }).details ?? null,
      hint: (res.error as { hint?: string }).hint ?? null,
      table: 'call_logs',
      filtersUsed: { organization_id: organizationId, query: 'count_head' },
    })
    return 0
  }
  return res.count ?? 0
}

/** Intenta contar "perdidas" con outcome o result según exista en el esquema. */
export async function countCallLogsMissedBucket(
  service: SupabaseClient,
  organizationId: string,
): Promise<number> {
  const outcomeOr = 'outcome.ilike.%miss%,outcome.ilike.%fail%,outcome.ilike.%no-answer%,outcome.ilike.%hang%,outcome.eq.spam_rejected'
  const resultOr =
    'result.ilike.%miss%,result.ilike.%fail%,result.ilike.%no-answer%,result.ilike.%hang%,result.eq.spam_rejected'

  const tryCount = async (orClause: string) => {
    const res = await service
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .or(orClause)
    return res
  }

  let res = await tryCount(outcomeOr)
  if (!res.error && res.count != null) return res.count

  console.error('[dashboard/calls-query]', {
    status: 'error',
    code: res.error?.code ?? null,
    message: res.error?.message ?? null,
    details: (res.error as { details?: string } | undefined)?.details ?? null,
    hint: (res.error as { hint?: string } | undefined)?.hint ?? null,
    table: 'call_logs',
    filtersUsed: { organization_id: organizationId, bucket: 'missed', column_try: 'outcome' },
  })

  res = await tryCount(resultOr)
  if (!res.error && res.count != null) return res.count

  if (res.error) {
    console.error('[dashboard/calls-query]', {
      status: 'error',
      code: res.error.code,
      message: res.error.message,
      details: (res.error as { details?: string }).details ?? null,
      hint: (res.error as { hint?: string }).hint ?? null,
      table: 'call_logs',
      filtersUsed: { organization_id: organizationId, bucket: 'missed', column_try: 'result' },
    })
  }

  return 0
}
