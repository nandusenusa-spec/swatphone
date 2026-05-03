import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone } from '@/lib/phone'

function fromForm(form: FormData, key: string): string {
  const val = form.get(key)
  return typeof val === 'string' ? val.trim() : ''
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const callSid = fromForm(form, 'CallSid')
    const callStatus = fromForm(form, 'CallStatus') || 'completed'
    const from = normalizePhone(fromForm(form, 'From'))
    const durationRaw = fromForm(form, 'CallDuration')
    const duration = Number.isFinite(Number(durationRaw)) ? Number(durationRaw) : 0
    const recordingUrl = fromForm(form, 'RecordingUrl') || null
    const organizationId = request.nextUrl.searchParams.get('organization_id')

    if (!callSid || !from) {
      return NextResponse.json({ error: 'CallSid and From are required' }, { status: 400 })
    }

    const startedAt = new Date().toISOString()
    const endedAt = duration > 0 ? new Date(Date.now() + duration * 1000).toISOString() : null

    const supabase = createServiceRoleClient()
    const payload = {
      vapi_call_id: callSid,
      organization_id: organizationId || null,
      phone_number: from,
      telefono_entrante: from,
      status: callStatus,
      direction: 'inbound',
      duration_seconds: duration,
      recording_url: recordingUrl,
      started_at: startedAt,
      ended_at: endedAt,
      resultado: callStatus,
      metadata: {
        source: 'twilio_status',
      },
    }

    const { data, error } = await supabase
      .from('calls')
      .upsert(payload, { onConflict: 'vapi_call_id' })
      .select('id, vapi_call_id, status')
      .single()

    if (error) {
      console.error('[twilio/voice/status] failed', error)
      return NextResponse.json({ error: 'failed to store status' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, call: data })
  } catch (error) {
    console.error('[twilio/voice/status] unexpected error', error)
    return NextResponse.json({ error: 'unexpected error' }, { status: 500 })
  }
}
