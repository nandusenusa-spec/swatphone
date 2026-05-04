import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getPostgresConnectionString,
  getProjectRefFromSupabaseUrl,
  getResolvedSupabaseUrl,
} from '@/lib/admin/resolve-supabase-env'

const TABLES_CHECK = [
  'call_logs',
  'follow_ups',
  'vapi_call_events_raw',
  'leads',
  'customers',
  'team_members',
  'products',
  'faqs',
] as const

/** Columns we care about for Plan B / dashboards (subset). */
const EXPECTED_COLUMNS: Record<string, string[]> = {
  call_logs: [
    'id',
    'organization_id',
    'phone',
    'status',
    'created_at',
    'duration',
    'transcript',
    'summary',
    'metadata',
  ],
  follow_ups: [
    'id',
    'organization_id',
    'lead_id',
    'customer_id',
    'call_log_id',
    'title',
    'notes',
    'due_at',
    'status',
    'priority',
    'category',
    'callback_required',
    'metadata',
    'created_at',
  ],
  vapi_call_events_raw: [
    'id',
    'organization_id',
    'vapi_call_id',
    'message_type',
    'event_type',
    'payload',
    'received_at',
  ],
  leads: ['id', 'organization_id', 'phone', 'name'],
  customers: ['id', 'organization_id'],
  team_members: ['id', 'organization_id'],
  products: ['id', 'organization_id'],
  faqs: ['id', 'organization_id'],
}

export type TablePresenceMap = Record<(typeof TABLES_CHECK)[number], boolean>

async function tableExistsRest(supabase: SupabaseClient, table: string): Promise<boolean> {
  const { error } = await supabase.from(table).select('id').limit(1)
  if (!error) return true
  const code = (error as { code?: string }).code
  if (code === 'PGRST205') return false
  const msg = (error.message || '').toLowerCase()
  const details = (error as { details?: string }).details?.toLowerCase() || ''
  if (
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    details.includes('does not exist')
  ) {
    return false
  }
  // Otro error (p. ej. columna id): asumimos que la tabla existe.
  return true
}

async function missingColumnsRest(
  supabase: SupabaseClient,
  table: string,
  columns: string[],
): Promise<string[]> {
  const missing: string[] = []
  for (const col of columns) {
    const { error } = await supabase.from(table).select(col).limit(1)
    if (error) {
      const m = (error.message || '').toLowerCase()
      if (m.includes(col.toLowerCase()) || m.includes('column') || m.includes('schema cache')) {
        missing.push(col)
      }
    }
  }
  return missing
}

async function healthViaPg(): Promise<{
  tables: TablePresenceMap
  missingTables: string[]
  missingColumns: Record<string, string[]>
} | null> {
  const cs = getPostgresConnectionString()
  if (!cs) return null

  const { Client } = await import('pg')
  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    const tables: TablePresenceMap = {
      call_logs: false,
      follow_ups: false,
      vapi_call_events_raw: false,
      leads: false,
      customers: false,
      team_members: false,
      products: false,
      faqs: false,
    }
    const missingTables: string[] = []
    const missingColumns: Record<string, string[]> = {}

    for (const t of TABLES_CHECK) {
      const r = await client.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) AS ex`,
        [t],
      )
      const ex = r.rows[0]?.ex === true
      tables[t] = ex
      if (!ex) {
        missingTables.push(t)
        continue
      }
      const expected = EXPECTED_COLUMNS[t]
      if (!expected?.length) continue
      const cr = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [t],
      )
      const have = new Set(
        (cr.rows as { column_name: string }[]).map((row) => row.column_name),
      )
      const miss = expected.filter((c) => !have.has(c))
      if (miss.length) missingColumns[t] = miss
    }

    return { tables, missingTables, missingColumns }
  } finally {
    await client.end().catch(() => {})
  }
}

export async function runSupabaseHealthCheck(supabase: SupabaseClient): Promise<{
  supabaseUrl: string
  projectRef: string | null
  canConnect: boolean
  tables: TablePresenceMap
  missingTables: string[]
  missingColumns: Record<string, string[]>
}> {
  const supabaseUrl = getResolvedSupabaseUrl() || ''
  const projectRef = supabaseUrl ? getProjectRefFromSupabaseUrl(supabaseUrl) : null

  const { error: pingErr } = await supabase.from('call_logs').select('id').limit(1)
  const msg = (pingErr?.message || '').toLowerCase()
  const canConnect =
    !pingErr ||
    (!msg.includes('invalid api key') &&
      !msg.includes('jwt') &&
      !msg.includes('econnrefused') &&
      !msg.includes('fetch failed'))

  const viaPg = await healthViaPg()
  if (viaPg) {
    return {
      supabaseUrl,
      projectRef,
      canConnect,
      tables: viaPg.tables,
      missingTables: viaPg.missingTables,
      missingColumns: viaPg.missingColumns,
    }
  }

  const tables: TablePresenceMap = {
    call_logs: false,
    follow_ups: false,
    vapi_call_events_raw: false,
    leads: false,
    customers: false,
    team_members: false,
    products: false,
    faqs: false,
  }
  const missingTables: string[] = []
  const missingColumns: Record<string, string[]> = {}

  for (const t of TABLES_CHECK) {
    const exists = await tableExistsRest(supabase, t)
    tables[t] = exists
    if (!exists) {
      missingTables.push(t)
      continue
    }
    const expected = EXPECTED_COLUMNS[t]
    if (expected?.length) {
      const miss = await missingColumnsRest(supabase, t, expected)
      if (miss.length) missingColumns[t] = miss
    }
  }

  return {
    supabaseUrl,
    projectRef,
    canConnect,
    tables,
    missingTables,
    missingColumns,
  }
}
