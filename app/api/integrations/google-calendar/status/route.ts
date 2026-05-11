import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { getGoogleCalendarStatus } from '@/lib/integrations/google-calendar'

export async function GET() {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(await getGoogleCalendarStatus(organizationId))
  } catch (error) {
    console.error('[google-calendar/status] failed', error)
    return NextResponse.json(
      { connected: false, error: 'status_failed' },
      { status: 500 },
    )
  }
}
