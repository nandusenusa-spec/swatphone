import { loadPlanBMigrationStatements, summarizeStatement } from '@/lib/admin/plan-b-migration-sql'

export type MigrationStatementResult = {
  index: number
  ok: boolean
  summary: string
  error?: string
  /** Postgres error code when available (e.g. 42P07). */
  code?: string
}

export async function executePlanBMigrationWithPg(
  connectionString: string,
): Promise<{ ok: boolean; statementsRun: number; results: MigrationStatementResult[] }> {
  const { Client } = await import('pg')
  const statements = loadPlanBMigrationStatements()
  const results: MigrationStatementResult[] = []
  const client = new Client({ connectionString })
  await client.connect()

  try {
    for (let i = 0; i < statements.length; i++) {
      const sql = statements[i]!
      try {
        await client.query(sql)
        results.push({ index: i, ok: true, summary: summarizeStatement(sql) })
      } catch (e: unknown) {
        const err = e as { message?: string; code?: string }
        const msg = typeof err.message === 'string' ? err.message : 'query_failed'
        results.push({
          index: i,
          ok: false,
          summary: summarizeStatement(sql),
          error: msg,
          code: err.code,
        })
        return { ok: false, statementsRun: i + 1, results }
      }
    }
    return { ok: true, statementsRun: statements.length, results }
  } finally {
    await client.end().catch(() => {})
  }
}
