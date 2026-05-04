import { NextResponse } from 'next/server'
import { adminMigrationsAllowed, verifyXAdminSecret } from '@/lib/admin/admin-secret-auth'
import {
  assertAllowedSupabaseProject,
  getPostgresConnectionString,
  getResolvedSupabaseUrl,
} from '@/lib/admin/resolve-supabase-env'
import { executePlanBMigrationWithPg } from '@/lib/admin/run-plan-b-migration-exec'
import { loadPlanBMigrationStatements, summarizeStatement } from '@/lib/admin/plan-b-migration-sql'

function validateEnvForMigration(): { ok: true } | { ok: false; status: number; body: Record<string, unknown> } {
  if (!process.env.ADMIN_SECRET?.trim()) {
    return {
      ok: false,
      status: 503,
      body: { ok: false, error: 'ADMIN_SECRET is not configured' },
    }
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return {
      ok: false,
      status: 503,
      body: { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' },
    }
  }
  const url = getResolvedSupabaseUrl()
  if (!url) {
    return {
      ok: false,
      status: 503,
      body: { ok: false, error: 'SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not configured' },
    }
  }
  const refOk = assertAllowedSupabaseProject(url)
  if (!refOk.ok) {
    return {
      ok: false,
      status: 403,
      body: { ok: false, error: 'url_not_allowed', reason: refOk.reason },
    }
  }
  return { ok: true }
}

export async function POST(request: Request) {
  if (!verifyXAdminSecret(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const env = validateEnvForMigration()
  if (!env.ok) {
    return NextResponse.json(env.body, { status: env.status })
  }

  if (!adminMigrationsAllowed()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'migrations_disabled',
        hint: 'Set ALLOW_ADMIN_MIGRATIONS=true once to run, then remove or set false.',
      },
      { status: 403 },
    )
  }

  const pgUrl = getPostgresConnectionString()
  if (!pgUrl) {
    const statements = loadPlanBMigrationStatements()
    return NextResponse.json(
      {
        ok: false,
        error: 'missing_postgres_connection',
        statementsRun: 0,
        results: statements.map((sql, index) => ({
          index,
          ok: false,
          summary: summarizeStatement(sql),
          error: 'skipped_no_database_url',
        })),
        hint:
          'Supabase JS cannot execute DDL. Add DATABASE_URL or POSTGRES_URL (Session pooler or direct) from Supabase → Database settings, then redeploy or set the env in Vercel.',
      },
      { status: 422 },
    )
  }

  try {
    const out = await executePlanBMigrationWithPg(pgUrl)
    return NextResponse.json({
      ok: out.ok,
      statementsRun: out.statementsRun,
      results: out.results,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'migration_failed'
    return NextResponse.json(
      {
        ok: false,
        statementsRun: 0,
        results: [],
        error: 'execution_error',
        message,
      },
      { status: 500 },
    )
  }
}
