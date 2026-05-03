import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { VapiEventInputSchema } from '@/lib/schemas/vapi'
import { dispatchVapiEvent } from '@/lib/vapi/dispatcher'
import { resolveOrganizationIdForVapiTools } from '@/lib/vapi/vapi-org-resolution'

function flattenVapiEnvelope(body: Record<string, unknown>): Record<string, unknown> {
  const msg = body.message
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return body
  const m = msg as Record<string, unknown>
  const out: Record<string, unknown> = { ...body, ...m }
  if (m.call) out.call = m.call
  return out
}

export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json()) as Record<string, unknown>
    const body = flattenVapiEnvelope(raw)
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
