/**
 * Prueba mínima: Supabase (org + cliente + work_order) + POST get-job-status + primary_message_for_caller.
 *
 * Requisitos:
 * - .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 * - App corriendo: npm run dev (por defecto http://localhost:3000)
 *
 * Por defecto usa el seed demo 008 (org 1111…, Juan +18135551001, WO 33333333-1111…).
 * Opcional: SMOKE_ORG_ID, SMOKE_PHONE, SMOKE_WORK_ORDER_ID, SMOKE_APP_URL
 *
 * Uso: npx tsx scripts/smoke-get-job-status.ts
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'
import { workOrderStatusForVoice } from '@/lib/voice-platform/work-order-voice'

const DEMO_ORG = '11111111-1111-1111-1111-111111111111'
const DEMO_PHONE = '+18135551001'
const DEMO_WORK_ORDER = '33333333-1111-1111-1111-111111111111'

const STATUSES = [
  'pending',
  'in_production',
  'installation',
  'ready_for_pickup',
  'completed',
  'cancelled',
] as const

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

function fail(msg: string): never {
  console.error('[smoke-get-job-status]', msg)
  process.exit(1)
}

async function main() {
  loadEnvLocal()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    fail('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (.env.local)')
  }

  const orgId = (process.env.SMOKE_ORG_ID || DEMO_ORG).trim()
  const phoneRaw = (process.env.SMOKE_PHONE || DEMO_PHONE).trim()
  const woId = (process.env.SMOKE_WORK_ORDER_ID || DEMO_WORK_ORDER).trim()
  const appUrl = (process.env.SMOKE_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

  const phone = normalizePhone(phoneRaw)
  if (!phone) fail('Teléfono inválido tras normalizar')

  const supabase = createClient(url, key)

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle()
  if (orgErr) fail(String(orgErr.message))
  if (!org) fail(`No existe organización id=${orgId} (¿ejecutaste scripts/008_seed_voice_platform_demo_org.sql?)`)
  console.log('[1] Organización:', org.name, org.id)

  const { data: customers, error: cErr } = await supabase
    .from('customers')
    .select('id, name, phone, organization_id')
    .eq('organization_id', orgId)
    .eq('phone', phone)
  if (cErr) fail(String(cErr.message))
  if (!customers?.length) {
    fail(
      `No hay cliente con phone=${phone} en org=${orgId}. Usá SMOKE_PHONE o cargá datos en Supabase.`,
    )
  }
  if (customers.length > 1) {
    fail('Varios clientes con el mismo teléfono en la org; usá una org/teléfono sin ambigüedad.')
  }
  const customer = customers[0]
  console.log('[2] Cliente:', customer.name, customer.phone)

  const { data: wo, error: woErr } = await supabase
    .from('work_orders')
    .select('id, work_order_number, customer_id, status, organization_id')
    .eq('id', woId)
    .maybeSingle()
  if (woErr) fail(String(woErr.message))
  if (!wo) {
    fail(`No existe work_order id=${woId}`)
  }
  if (String(wo.organization_id) !== orgId) {
    fail('work_order.organization_id no coincide con SMOKE_ORG_ID')
  }
  if (String(wo.customer_id) !== String(customer.id)) {
    fail('work_order no está asociada al cliente del teléfono indicado (revisá SMOKE_WORK_ORDER_ID)')
  }
  console.log('[3] Work order:', wo.work_order_number, 'status actual:', wo.status)

  console.log('[4–7] Rotar status vía Supabase (mismo efecto que guardar en Admin) y llamar POST get-job-status…')

  for (const status of STATUSES) {
    const { error: upErr } = await supabase
      .from('work_orders')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', woId)
    if (upErr) fail(`Update status=${status}: ${upErr.message}`)

    const res = await fetch(`${appUrl}/api/vapi/tools/get-job-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: orgId, phone }),
    })

    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok) {
      console.error(json)
      fail(`HTTP ${res.status} en get-job-status para status=${status}`)
    }

    const primary = json.primary_message_for_caller
    if (typeof primary !== 'string' || !primary.trim()) {
      console.error(json)
      fail(`Respuesta sin primary_message_for_caller (status DB=${status})`)
    }

    const expected = workOrderStatusForVoice({ status }).client_message_es
    if (primary !== expected) {
      console.error({ status, primary, expected, json })
      fail(`Mensaje no coincide para status=${status}`)
    }

    console.log(`  OK status=${status} → primary_message_for_caller exacto (${primary.length} chars)`)
  }

  console.log('\n[smoke-get-job-status] Todo OK: los 6 estados devuelven primary_message_for_caller esperado.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
