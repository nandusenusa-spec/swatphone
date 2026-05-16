import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import twilio from 'twilio'

export type TwilioParamsReadResult =
  | { ok: true; params: Record<string, string> }
  | { ok: false; response: NextResponse }

/** Lee body application/x-www-form-urlencoded y valida firma Twilio si hay TWILIO_AUTH_TOKEN. */
export async function readValidatedTwilioParams(
  request: NextRequest,
  pathname: string,
): Promise<TwilioParamsReadResult> {
  const bodyText = await request.text()
  const params: Record<string, string> = {}
  new URLSearchParams(bodyText).forEach((value, key) => {
    params[key] = value
  })

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  if (!authToken) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[twilio] TWILIO_AUTH_TOKEN not set — rejecting request in production')
      return { ok: false, response: new NextResponse('Service Unavailable', { status: 503 }) }
    }
    console.warn('[twilio] TWILIO_AUTH_TOKEN not set — skipping signature validation in dev')
  } else {
    const signature = request.headers.get('X-Twilio-Signature') || ''
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')
    const url = `${appBase}${pathname}${request.nextUrl.search}`
    const valid = twilio.validateRequest(authToken, signature, url, params)
    if (!valid) {
      return { ok: false, response: new NextResponse('Forbidden', { status: 403 }) }
    }
  }

  return { ok: true, params }
}

export function twilioParam(params: Record<string, string>, key: string): string {
  const value = params[key]
  return typeof value === 'string' ? value.trim() : ''
}
