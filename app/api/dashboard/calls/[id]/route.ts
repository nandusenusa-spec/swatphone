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

    const params = await context.params
    const id = String(params.id || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const { data: callRow, error: callFindError } = await supabase
      .from('call_logs')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle()
    if (callFindError) throw callFindError
    if (!callRow) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // Keep delete stable even when FK restrictions exist.
    await supabase
      .from('notifications')
      .delete()
      .eq('organization_id', organizationId)
      .eq('call_log_id', id)
    await supabase
      .from('follow_ups')
      .delete()
      .eq('organization_id', organizationId)
      .eq('call_log_id', id)
    await supabase
      .from('call_classifications')
      .delete()
      .eq('organization_id', organizationId)
      .eq('call_log_id', id)

    const { error: callDeleteError } = await supabase
      .from('call_logs')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id)
    if (callDeleteError) throw callDeleteError

    return NextResponse.json({ ok: true, deleted: 'call_log', id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'delete_call_failed'
    return NextResponse.json({ error: 'delete_call_failed', message }, { status: 500 })
  }
}
