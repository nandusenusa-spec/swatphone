import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeGoogleCalendarCode,
  saveGoogleCalendarConnection,
} from '@/lib/integrations/google-calendar'

function parseStateCookie(raw?: string) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: string; organizationId?: string }
    if (!parsed.state || !parsed.organizationId) return null
    return parsed
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const redirectUrl = new URL('/dashboard/integrations', request.url)
  try {
    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    const error = request.nextUrl.searchParams.get('error')
    const expected = parseStateCookie(request.cookies.get('google_calendar_oauth_state')?.value)
    if (error) {
      redirectUrl.searchParams.set('google_calendar', error)
      return NextResponse.redirect(redirectUrl)
    }
    if (!code || !state || !expected || expected.state !== state) {
      redirectUrl.searchParams.set('google_calendar', 'invalid_state')
      return NextResponse.redirect(redirectUrl)
    }
    const token = await exchangeGoogleCalendarCode(code, request.url)
    await saveGoogleCalendarConnection({
      organizationId: expected.organizationId,
      token,
      requestUrl: request.url,
    })
    redirectUrl.searchParams.set('google_calendar', 'connected')
    const res = NextResponse.redirect(redirectUrl)
    res.cookies.delete('google_calendar_oauth_state')
    return res
  } catch (error) {
    console.error('[google-calendar/callback] failed', error)
    redirectUrl.searchParams.set('google_calendar', 'callback_error')
    const res = NextResponse.redirect(redirectUrl)
    res.cookies.delete('google_calendar_oauth_state')
    return res
  }
}
