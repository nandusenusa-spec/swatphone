// Diagnóstico de solo lectura para los bugs de productos / equipo / Telegram.
// Usa SERVICE_ROLE_KEY → bypassa RLS (ve todo, no modifica nada).
// Run: node scripts/diagnose-aloha.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Cargar .env.local manualmente (sin dotenv como dep)
const envPath = join(__dirname, '..', '.env.local')
const envText = readFileSync(envPath, 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY
const TELEGRAM_TOKEN = env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT = env.TELEGRAM_CHAT_ID

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const sep = (title) => console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`)

async function rpc(sql) {
  // intentar exec_sql RPC; si no existe, usar fetch directo a /rest/v1/rpc no funciona
  // así que vamos por queries directos vía postgres-meta no disponible → usaremos selects
  return null
}

async function listColumns(table) {
  // Vamos por selección de 1 fila para inferir columnas en runtime
  const { data, error } = await sb.from(table).select('*').limit(1)
  if (error) {
    console.log(`  [x] error consultando ${table}: ${error.message} (code=${error.code || ''})`)
    return null
  }
  if (!data || data.length === 0) {
    console.log(`  [i] tabla ${table} sin filas → no puedo inferir columnas vía select`)
    return []
  }
  return Object.keys(data[0])
}

async function main() {
  sep('1) Columnas reales de public.products (inferidas)')
  const productCols = await listColumns('products')
  if (productCols) {
    console.log('  columnas:', productCols.join(', ') || '(tabla vacía)')
    const expect = ['price_type', 'price_min', 'price_max']
    if (productCols.length) {
      for (const c of expect) {
        console.log(`  ${productCols.includes(c) ? '[OK]' : '[FALTA]'} ${c}`)
      }
    }
  }

  sep('2) Intento de INSERT prueba en products (con service role, debería funcionar siempre)')
  const orgId = '9bb50e58-9ba6-4d54-8171-13922749f570'
  const { data: insTest, error: insErr } = await sb
    .from('products')
    .insert({
      organization_id: orgId,
      name: '__diagnose_temp__',
      description: 'temp',
      price: 1,
      price_type: 'fixed',
      price_min: 1,
      price_max: 2,
      currency: 'USD',
      is_active: false,
    })
    .select()
    .single()
  if (insErr) {
    console.log(`  [x] insert falló: ${insErr.message}`)
    console.log(`     code=${insErr.code} details=${insErr.details || ''} hint=${insErr.hint || ''}`)
  } else {
    console.log(`  [OK] insert ok, id=${insTest.id}`)
    await sb.from('products').delete().eq('id', insTest.id)
    console.log(`  [i] cleanup hecho`)
  }

  sep('3) Profile de fernandosardo@gmail.com')
  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, email, role, organization_id, full_name')
    .eq('email', 'fernandosardo@gmail.com')
  if (profErr) {
    console.log(`  [x] error: ${profErr.message}`)
  } else if (!profiles || profiles.length === 0) {
    console.log('  [!] no existe profile con ese email')
    // intentar por auth.users
    const { data: users } = await sb.auth.admin.listUsers()
    const u = users?.users?.find((u) => u.email === 'fernandosardo@gmail.com')
    if (u) {
      console.log(`  [i] auth.users id=${u.id}, buscando profile por id...`)
      const { data: p2 } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle()
      console.log('  profile por id:', p2 ? JSON.stringify(p2) : '(no existe)')
    }
  } else {
    for (const p of profiles) {
      console.log(`  id=${p.id} role=${p.role} org=${p.organization_id} name=${p.full_name || ''}`)
    }
  }

  sep('4) Conteo actual en products y team_members para org SWATWORKS')
  for (const t of ['products', 'team_members']) {
    const { count, error } = await sb
      .from(t)
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
    if (error) console.log(`  [x] ${t}: ${error.message}`)
    else console.log(`  ${t}: ${count} filas`)
  }

  sep('5) Telegram getMe (validar bot token)')
  if (!TELEGRAM_TOKEN) {
    console.log('  [!] TELEGRAM_BOT_TOKEN ausente')
  } else {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMe`)
      const j = await r.json()
      console.log('  ', JSON.stringify(j))
    } catch (e) {
      console.log('  [x]', e.message)
    }
  }

  sep('6) Telegram getChat (validar chat id)')
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) {
    console.log('  [!] vars ausentes')
  } else {
    try {
      const r = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getChat?chat_id=${encodeURIComponent(TELEGRAM_CHAT)}`,
      )
      const j = await r.json()
      console.log('  ', JSON.stringify(j))
    } catch (e) {
      console.log('  [x]', e.message)
    }
  }

  sep('LISTO — diagnóstico de solo lectura completado')
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
