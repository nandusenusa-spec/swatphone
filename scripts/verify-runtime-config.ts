/**
 * Verifica que getOrganizationRuntimeConfig devuelva datos coherentes tras ejecutar 008_seed.
 * Uso: npx tsx scripts/verify-runtime-config.ts
 * Requiere .env.local con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o variables que use createServiceRoleClient).
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'

const DEMO_ORG = '11111111-1111-1111-1111-111111111111'

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

async function main() {
  loadEnvLocal()
  const cfg = await getOrganizationRuntimeConfig(DEMO_ORG)

  const errs: string[] = []
  if (!cfg.prompt || cfg.prompt.length < 20) errs.push('prompt vacío o demasiado corto')
  if (!cfg.welcomeMessage) errs.push('welcomeMessage faltante')
  if (!cfg.toolsEnabled.includes('find_customer')) errs.push('find_customer no está en toolsEnabled')
  if (cfg.catalog.length < 4) errs.push(`se esperaban 4 ítems en catalog, hay ${cfg.catalog.length}`)
  if (cfg.businessHours.length < 7) {
    errs.push(`se esperaban 7 filas de horarios, hay ${cfg.businessHours.length}`)
  }
  if (!cfg.transferPolicy.defaultTransferNumber) errs.push('defaultTransferNumber faltante')
  if (cfg.spamPolicy.threshold !== 70) {
    errs.push(`spamPolicy.threshold esperado 70, obtuvo ${cfg.spamPolicy.threshold}`)
  }

  if (errs.length) {
    console.error('[verify-runtime-config] Falló:', errs.join('; '))
    console.error(JSON.stringify(cfg, null, 2))
    process.exit(1)
  }

  console.log('[verify-runtime-config] OK')
  console.log(
    JSON.stringify(
      {
        organizationId: cfg.organizationId,
        toolsCount: cfg.toolsEnabled.length,
        catalogCount: cfg.catalog.length,
        hoursCount: cfg.businessHours.length,
        transfer: cfg.transferPolicy,
        spamPolicy: cfg.spamPolicy,
      },
      null,
      2,
    ),
  )
}

main().catch((e: { code?: string; message?: string } | unknown) => {
  const err = e as { code?: string; message?: string }
  if (err?.code === 'PGRST205') {
    console.error(
      '[verify-runtime-config] Tablas de runtime no encontradas. Ejecutá en Supabase scripts/007_runtime_config_tables.sql y luego 008_seed_voice_platform_demo_org.sql.',
    )
    console.error(err.message || e)
    process.exit(1)
  }
  console.error(e)
  process.exit(1)
})
