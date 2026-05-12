import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

type RouteContext = { params: Promise<{ id: string }> }

async function assertFollowUpInOrg(svc: ReturnType<typeof createServiceRoleClient>, orgId: string, id: string) {
  const { data, error } = await svc
    .from('follow_ups')
    .select('id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await context.params
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const svc = createServiceRoleClient()
    const ok = await assertFollowUpInOrg(svc, organizationId, id)
    if (!ok) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (typeof body.status === 'string' && body.status.trim()) {
      patch.status = body.status.trim()
    }
    if (body.notes !== undefined) {
      patch.notes = typeof body.notes === 'string' ? body.notes : null
    }
    if (body.due_at !== undefined) {
      if (body.due_at === null || body.due_at === '') {
        patch.due_at = null
      } else if (typeof body.due_at === 'string') {
        const d = new Date(body.due_at)
        patch.due_at = Number.isNaN(d.getTime()) ? null : d.toISOString()
      }
    }

    const { error: upErr } = await svc.from('follow_ups').update(patch).eq('id', id).eq('organization_id', organizationId)
    if (upErr) {
      console.error('[api/dashboard/follow-ups/patch]', upErr)
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/dashboard/follow-ups/patch]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await context.params
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
    }
    const svc = createServiceRoleClient()
    const ok = await assertFollowUpInOrg(svc, organizationId, id)
    if (!ok) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const { error: delErr } = await svc.from('follow_ups').delete().eq('id', id).eq('organization_id', organizationId)
    if (delErr) {
      console.error('[api/dashboard/follow-ups/delete]', delErr)
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/dashboard/follow-ups/delete]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
