import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { buildGoogleCalendarAuthUrl } from '@/lib/integrations/google-calendar'

export async function GET(request: NextRequest) {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const state = crypto.randomBytes(24).toString('base64url')
    const url = buildGoogleCalendarAuthUrl({
      organizationId,
      state,
      requestUrl: request.url,
    })
    const res = NextResponse.redirect(url)
    res.cookies.set(
      'google_calendar_oauth_state',
      JSON.stringify({ state, organizationId }),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 10 * 60,
      },
    )
    return res
  } catch (error) {
    console.error('[google-calendar/connect] failed', error)
    return NextResponse.redirect(
      new URL('/dashboard/integrations?google_calendar=connect_error', request.url),
    )
  }
}
