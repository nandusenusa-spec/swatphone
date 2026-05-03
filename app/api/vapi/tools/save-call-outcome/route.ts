import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { SaveCallOutcomeSchema } from '@/lib/voice-platform/validation'
import type { StructuredExtraction } from '@/lib/voice-platform/types'
import { runSaveCallOutcome } from '@/lib/voice-platform/service'

export async function POST(request: NextRequest) {
  try {
    const payload = SaveCallOutcomeSchema.parse(await request.json())
    const baseExtraction = (payload.structured_extraction || {}) as Record<string, unknown>
    if (payload.callback_required === true) {
      baseExtraction.callback_required = true
    }
    const result = await runSaveCallOutcome({
      organizationId: payload.organization_id,
      vapiCallId: payload.vapi_call_id,
      phone: payload.phone,
      intent: payload.intent,
      callType: payload.call_type,
      validationStatus: payload.validation_status,
      transcript: payload.transcript,
      summary: payload.summary,
      result: payload.result,
      owner: payload.owner,
      followUpDate: payload.follow_up_date,
      transferRequested: payload.transfer_requested,
      transferCompleted: payload.transfer_completed,
      spamScore: payload.spam_score,
      nextAction: payload.next_action,
      structuredExtraction:
        Object.keys(baseExtraction).length > 0 ? (baseExtraction as StructuredExtraction) : undefined,
      ended: true,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[vapi/tools/save-call-outcome] failed', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
