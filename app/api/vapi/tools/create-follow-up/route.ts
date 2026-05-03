import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { CreateFollowUpSchema } from '@/lib/voice-platform/validation'
import { runCreateFollowUp } from '@/lib/voice-platform/service'

export async function POST(request: NextRequest) {
  try {
    const payload = CreateFollowUpSchema.parse(await request.json())
    const result = await runCreateFollowUp({
      organizationId: payload.organization_id,
      callLogId: payload.call_log_id,
      phone: payload.phone,
      customerId: payload.customer_id,
      title: payload.title,
      notes: payload.notes,
      owner: payload.owner,
      dueAt: payload.due_at,
      priority: payload.priority,
      callbackRequired: payload.callback_required,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[vapi/tools/create-follow-up] failed', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
