/**
 * Verificación rápida del esquema esperado por la app (service role).
 *
 * Uso:
 *   npx tsx scripts/check-supabase-schema.ts
 *
 * Variables (como en Vercel / .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const REQUIRED_TABLES = [
  'organizations',
  'profiles',
  'assistant_configs',
  'products',
  'team_members',
  'leads',
  'faqs',
  'calls',
  'customers',
  'price_catalog',
  'work_orders',
  'appointments',
  'call_logs',
  'call_classifications',
  'follow_ups',
  'transfers',
  'notifications',
  'organization_voice_settings',
  'organization_ai_config',
  'organization_routing',
  'organization_catalog',
  'organization_business_hours',
  'vapi_call_events_raw',
  'phone_screening',
  'admin_credentials',
] as const

async function tableReachable(
  supabase: ReturnType<typeof createClient>,
  table: string,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from(table).select('id').limit(1)
  if (!error) return { ok: true }
  const msg = error.message || ''
  if (msg.includes('schema cache') || msg.includes('does not exist')) {
    return { ok: false, message: msg }
  }
  return { ok: true }
}

async function main() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  if (!url || !key) {
    console.error('[check-supabase-schema] Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const missing: string[] = []
  const errors: Record<string, string> = {}

  for (const t of REQUIRED_TABLES) {
    const r = await tableReachable(supabase, t)
    if (!r.ok) {
      missing.push(t)
      if (r.message) errors[t] = r.message
    }
  }

  let rpcOk = false
  try {
    const { data, error } = await supabase.rpc('verify_admin_password', {
      input_username: '__nonexistent__',
      input_password: 'x',
    })
    rpcOk = !error && data === false
    if (error) {
      errors['rpc:verify_admin_password'] = error.message
    }
  } catch (e) {
    errors['rpc:verify_admin_password'] = e instanceof Error ? e.message : String(e)
  }

  console.info('[check-supabase-schema]', {
    urlHost: (() => {
      try {
        return new URL(url).host
      } catch {
        return null
      }
    })(),
    tables_ok: REQUIRED_TABLES.length - missing.length,
    tables_total: REQUIRED_TABLES.length,
    missing_tables: missing,
    verify_admin_password_ok: rpcOk,
  })

  if (missing.length) {
    const detail = missing.map((t) => `${t}: ${errors[t] || 'unreachable'}`).join('\n')
    console.error('[check-supabase-schema] Falta ejecutar scripts/000_rebuild_supabase_schema.sql o revisar errores:\n' + detail)
    process.exit(1)
  }

  if (!rpcOk) {
    console.error(
      '[check-supabase-schema] RPC verify_admin_password no responde como se espera:',
      errors['rpc:verify_admin_password'] || 'unknown',
    )
    process.exit(1)
  }

  console.info('[check-supabase-schema] OK')
}

main().catch((e) => {
  console.error('[check-supabase-schema]', e)
  process.exit(1)
})
