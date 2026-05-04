/**
 * Vapi server URL / webhook (assistant.serverUrl) debe apuntar aquí, p. ej.:
 * https://swatvoiceia.vercel.app/api/voice/events?organization_id=<ORG_UUID>
 * (alias: /api/vapi/events). En Vapi: habilitar recording, transcript y eventos
 * end-of-call-report según documentación del panel.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { VapiEventInputSchema } from '@/lib/schemas/vapi'
import { dispatchVapiEvent } from '@/lib/vapi/dispatcher'
import { resolveOrganizationIdForVapiTools } from '@/lib/vapi/vapi-org-resolution'
import { flattenVapiServerEvent } from '@/lib/vapi/vapi-event-flatten'
import { logVapiEventRaw } from '@/lib/vapi/vapi-event-raw-log'

export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json()) as Record<string, unknown>
    const body = flattenVapiServerEvent(raw as Record<string, unknown>)
    const parsed = VapiEventInputSchema.parse(body)
    const messageType = typeof parsed.type === 'string' ? parsed.type : 'unknown'
    let organizationId =
      parsed.organization_id ||
      request.nextUrl.searchParams.get('organization_id') ||
      ''

    if (!organizationId) {
      const orgRes = await resolveOrganizationIdForVapiTools({
        args: {},
        flat: body as Record<string, unknown>,
        rawBody: raw,
        request,
        toolCallId: 'vapi-events',
        logPrefix: '[vapi/events]',
      })
      organizationId = orgRes.organizationId || ''
      if (!organizationId) {
        console.warn('[vapi/events] organization unresolved after full_chain', {
          message_type: messageType,
          assistantIdDetected: orgRes.assistantIdDetected,
          orgSource: orgRes.orgSource,
        })
      }
    }

    logVapiEventRaw({
      requestUrl: request.url,
      organizationId: organizationId || null,
      raw,
      flat: body,
    })

    console.log('[vapi/events] request received', {
      url: request.url,
      path: request.nextUrl.pathname,
      organization_id: organizationId || null,
      message_type: messageType,
    })

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }
    const out = await dispatchVapiEvent({
      body: parsed as unknown as Record<string, unknown>,
      organizationId,
      requestUrl: request.url,
    })
    return NextResponse.json(out)
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('[vapi/events] invalid_payload', error.flatten())
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[vapi/events] failed', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
