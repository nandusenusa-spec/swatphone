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
    const { data: followUpRow, error: findError } = await supabase
      .from('follow_ups')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle()
    if (findError) throw findError
    if (!followUpRow) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    await supabase
      .from('notifications')
      .delete()
      .eq('organization_id', organizationId)
      .eq('follow_up_id', id)

    const { error: deleteError } = await supabase
      .from('follow_ups')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id)
    if (deleteError) throw deleteError

    return NextResponse.json({ ok: true, deleted: 'follow_up', id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'delete_follow_up_failed'
    return NextResponse.json({ error: 'delete_follow_up_failed', message }, { status: 500 })
  }
}
