import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { TransferToRamonSchema } from '@/lib/voice-platform/validation'
import { runTransferToRamon } from '@/lib/voice-platform/service'

export async function POST(request: NextRequest) {
  try {
    const payload = TransferToRamonSchema.parse(await request.json())
    const result = await runTransferToRamon({
      organizationId: payload.organization_id,
      callLogId: payload.call_log_id,
      reason: payload.reason,
      urgent: payload.urgent,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[vapi/tools/transfer-to-ramon] failed', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
