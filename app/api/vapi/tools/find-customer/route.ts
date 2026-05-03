import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { FindCustomerSchema } from '@/lib/voice-platform/validation'
import { runFindCustomer } from '@/lib/voice-platform/service'

export async function POST(request: NextRequest) {
  try {
    const payload = FindCustomerSchema.parse(await request.json())
    const result = await runFindCustomer({
      organizationId: payload.organization_id,
      phone: payload.phone,
      name: payload.name,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[vapi/tools/find-customer] failed', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
