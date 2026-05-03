import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { CreateAppointmentSchema } from '@/lib/voice-platform/validation'
import { runCreateAppointment } from '@/lib/voice-platform/service'

export async function POST(request: NextRequest) {
  try {
    const payload = CreateAppointmentSchema.parse(await request.json())
    const result = await runCreateAppointment({
      organizationId: payload.organization_id,
      phone: payload.phone,
      customerName: payload.customer_name,
      appointmentAt: payload.appointment_at,
      notes: payload.notes,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[vapi/tools/create-appointment] failed', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
