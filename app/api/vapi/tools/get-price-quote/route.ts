import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { GetPriceQuoteSchema } from '@/lib/voice-platform/validation'
import { runGetPriceQuote } from '@/lib/voice-platform/service'

export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json()) as Record<string, unknown>
    console.info('[vapi/tool-call] received', {
      requestUrl: request.url,
      toolCallId: 'get-price-quote-http',
      toolName: 'get_price_quote',
      argKeys: Object.keys(raw || {}).slice(0, 32),
      source: 'get-price-quote-route',
    })
    const payload = GetPriceQuoteSchema.parse(raw)
    const result = await runGetPriceQuote({
      organizationId: payload.organization_id,
      serviceName: payload.service_name,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[vapi/tools/get-price-quote] failed', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
