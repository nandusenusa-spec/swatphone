import { readFileSync } from 'fs'
import { join } from 'path'

/** Strip `--` line comments; keeps migration file executable as single script. */
export function stripSqlLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--')
      return idx === -1 ? line : line.slice(0, idx)
    })
    .join('\n')
}

export function splitSqlStatements(sql: string): string[] {
  const cleaned = stripSqlLineComments(sql)
  const parts = cleaned.split(';')
  const out: string[] = []
  for (const p of parts) {
    const s = p.trim()
    if (s) out.push(s)
  }
  return out
}

export function loadPlanBMigrationStatements(): string[] {
  const path = join(process.cwd(), 'scripts', '019_plan_b_vapi_raw_events.sql')
  const raw = readFileSync(path, 'utf8')
  return splitSqlStatements(raw)
}

export function summarizeStatement(sql: string): string {
  const one = sql.replace(/\s+/g, ' ').trim().slice(0, 96)
  return one.length < sql.length ? `${one}…` : one
}
