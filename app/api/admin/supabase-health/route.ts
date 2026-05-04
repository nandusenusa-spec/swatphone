import { NextResponse } from 'next/server'
import { verifyXAdminSecret } from '@/lib/admin/admin-secret-auth'
import { assertAllowedSupabaseProject, getResolvedSupabaseUrl } from '@/lib/admin/resolve-supabase-env'
import { runSupabaseHealthCheck } from '@/lib/admin/supabase-health-check'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function GET(request: Request) {
  if (!verifyXAdminSecret(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ADMIN_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: 'ADMIN_SECRET is not configured' }, { status: 503 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' }, { status: 503 })
  }

  const url = getResolvedSupabaseUrl()
  if (!url) {
    return NextResponse.json(
      { ok: false, error: 'SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not configured' },
      { status: 503 },
    )
  }

  const refOk = assertAllowedSupabaseProject(url)
  if (!refOk.ok) {
    return NextResponse.json({ ok: false, error: 'url_not_allowed', reason: refOk.reason }, { status: 403 })
  }

  try {
    const supabase = createServiceRoleClient()
    const health = await runSupabaseHealthCheck(supabase)
    return NextResponse.json({
      supabaseUrl: health.supabaseUrl,
      projectRef: health.projectRef,
      canConnect: health.canConnect,
      tables: health.tables,
      missingTables: health.missingTables,
      missingColumns: health.missingColumns,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'health_check_failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
