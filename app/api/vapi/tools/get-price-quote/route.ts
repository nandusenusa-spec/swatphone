import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { GetPriceQuoteSchema } from '@/lib/voice-platform/validation'
import { runGetPriceQuote } from '@/lib/voice-platform/service'

export async function POST(request: NextRequest) {
  try {
    const payload = GetPriceQuoteSchema.parse(await request.json())
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
