import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: callLogId } = await context.params
    if (!callLogId || !/^[0-9a-f-]{36}$/i.test(callLogId)) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
    }

    const svc = createServiceRoleClient()
    const { data: row, error: findErr } = await svc
      .from('call_logs')
      .select('id')
      .eq('id', callLogId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (findErr) {
      console.error('[api/dashboard/calls/delete]', findErr)
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const { error: delErr } = await svc.from('call_logs').delete().eq('id', callLogId).eq('organization_id', organizationId)

    if (delErr) {
      console.error('[api/dashboard/calls/delete]', delErr)
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/dashboard/calls/delete]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
