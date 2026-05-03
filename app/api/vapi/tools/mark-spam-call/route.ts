import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { MarkSpamCallSchema } from '@/lib/voice-platform/validation'
import { runMarkSpamCall } from '@/lib/voice-platform/service'

export async function POST(request: NextRequest) {
  try {
    const payload = MarkSpamCallSchema.parse(await request.json())
    const result = await runMarkSpamCall({
      organizationId: payload.organization_id,
      vapiCallId: payload.vapi_call_id,
      phone: payload.phone,
      reason: payload.reason,
      spamScore: payload.spam_score,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[vapi/tools/mark-spam-call] failed', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
