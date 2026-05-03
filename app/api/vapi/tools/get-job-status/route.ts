import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { GetJobStatusSchema } from '@/lib/voice-platform/validation'
import { runGetJobStatus } from '@/lib/voice-platform/service'

export async function POST(request: NextRequest) {
  try {
    const payload = GetJobStatusSchema.parse(await request.json())
    const result = await runGetJobStatus({
      organizationId: payload.organization_id,
      jobNumber: payload.job_number,
      phone: payload.phone,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[vapi/tools/get-job-status] failed', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
