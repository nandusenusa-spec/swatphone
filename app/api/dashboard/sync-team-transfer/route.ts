import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { syncOrganizationRoutingFromTeam } from '@/lib/dashboard/sync-team-transfer-routing'

export async function POST() {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const svc = createServiceRoleClient()
    const result = await syncOrganizationRoutingFromTeam(svc, organizationId)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('[api/dashboard/sync-team-transfer]', e)
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 })
  }
}
