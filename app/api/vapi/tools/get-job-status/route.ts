import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getCallerPhoneFromPayload } from '@/lib/vapi/payload'
import { GetJobStatusSchema } from '@/lib/voice-platform/validation'
import { runGetJobStatus } from '@/lib/voice-platform/service'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

/** Misma forma que en /api/vapi/webhook para leer message.* al nivel raíz. */
function flattenVapiBody(body: JsonRecord): JsonRecord {
  const msg = body.message
  if (!msg || typeof msg !== 'object') return body
  const m = msg as JsonRecord
  return { ...body, ...m }
}

function parseToolCallArgs(item: JsonRecord): JsonRecord {
  const fn = asRecord(item.function)
  const raw = fn?.arguments ?? item.arguments
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as JsonRecord
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as JsonRecord)
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

function isVapiToolCallsPayload(flat: JsonRecord): boolean {
  return flat.type === 'tool-calls' && Array.isArray(flat.toolCallList)
}

async function handleVapiToolCalls(flat: JsonRecord) {
  const list = flat.toolCallList as JsonRecord[]
  const phoneFromCall = getCallerPhoneFromPayload(flat)

  const results = await Promise.all(
    list.map(async (item) => {
      const toolCallId =
        (typeof item.toolCallId === 'string' && item.toolCallId) ||
        (typeof item.id === 'string' && item.id) ||
        ''
      const fn = asRecord(item.function)
      const name =
        typeof fn?.name === 'string' ? fn.name : typeof item.name === 'string' ? item.name : ''
      const args = parseToolCallArgs(item)

      if (name !== 'get_job_status') {
        return {
          toolCallId,
          name: name || 'unknown',
          result: JSON.stringify({
            error: 'unsupported_tool',
            expected: 'get_job_status',
          }),
        }
      }

      const phoneArg = typeof args.phone === 'string' ? args.phone.trim() : ''
      const phone = phoneArg || (phoneFromCall?.trim() ?? '')
      const orgArg = typeof args.organization_id === 'string' ? args.organization_id.trim() : ''

      const parsed = GetJobStatusSchema.safeParse({
        organization_id: orgArg,
        job_number: typeof args.job_number === 'string' ? args.job_number : undefined,
        phone: phone || undefined,
      })

      if (!parsed.success) {
        return {
          toolCallId,
          name,
          result: JSON.stringify({
            error: 'invalid_payload',
            details: parsed.error.flatten(),
          }),
        }
      }

      const out = await runGetJobStatus({
        organizationId: parsed.data.organization_id,
        jobNumber: parsed.data.job_number,
        phone: parsed.data.phone,
      })
      return { toolCallId, name, result: JSON.stringify(out) }
    }),
  )

  return NextResponse.json({ results })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as JsonRecord
    const flat = flattenVapiBody(body)

    if (isVapiToolCallsPayload(flat)) {
      return handleVapiToolCalls(flat)
    }

    const payload = GetJobStatusSchema.parse(body)
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
