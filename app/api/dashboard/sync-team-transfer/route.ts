import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { syncOrganizationRoutingFromTeam } from '@/lib/dashboard/sync-team-transfer-routing'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()
    if (pErr) throw pErr
    const organizationId = profile?.organization_id
    if (!organizationId) {
      return NextResponse.json({ error: 'No organization' }, { status: 400 })
    }

    const svc = createServiceRoleClient()
    const result = await syncOrganizationRoutingFromTeam(svc, organizationId)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('[api/dashboard/sync-team-transfer]', e)
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 })
  }
}
