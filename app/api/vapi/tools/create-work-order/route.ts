import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { CreateWorkOrderSchema } from '@/lib/voice-platform/validation'
import { runCreateWorkOrder } from '@/lib/voice-platform/service'

export async function POST(request: NextRequest) {
  try {
    const payload = CreateWorkOrderSchema.parse(await request.json())
    const result = await runCreateWorkOrder({
      organizationId: payload.organization_id,
      phone: payload.phone,
      customerName: payload.customer_name,
      title: payload.title,
      issueDescription: payload.issue_description,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[vapi/tools/create-work-order] failed', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
