import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { disconnectGoogleCalendar } from '@/lib/integrations/google-calendar'

export async function POST() {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await disconnectGoogleCalendar(organizationId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[google-calendar/disconnect] failed', error)
    return NextResponse.json({ ok: false, error: 'disconnect_failed' }, { status: 500 })
  }
}
