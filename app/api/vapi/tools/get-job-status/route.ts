import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getCallerPhoneFromPayload } from '@/lib/vapi/payload'
import { normalizePhone } from '@/lib/phone'
import { GetJobStatusSchema } from '@/lib/voice-platform/validation'
import { runGetJobStatus } from '@/lib/voice-platform/service'

type JsonRecord = Record<string, unknown>

/** Fallback temporal demo si Vapi no envía caller phone en el envelope (quitar cuando producción estable). */
const DEMO_PHONE_FALLBACK = '+17868673165'

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

/**
 * Orden: args.phone → payload flatten (call / message.call / customer) → body crudo.
 * Normaliza a E.164; si sigue vacío, log técnico + fallback demo.
 */
function resolvePhoneForJobStatusTool(input: {
  args: JsonRecord
  flat: JsonRecord
  rawBody: JsonRecord
  toolCallId: string
}): string {
  const argRaw = typeof input.args.phone === 'string' ? input.args.phone.trim() : ''
  const fromFlat = getCallerPhoneFromPayload(input.flat) || ''
  const fromBody = getCallerPhoneFromPayload(input.rawBody) || ''
  const raw = argRaw || fromFlat || fromBody || ''
  let normalized = normalizePhone(raw)

  if (!normalized) {
    const call = asRecord(input.flat.call)
    console.error('[vapi/tools/get-job-status] missing_or_invalid_caller_phone', {
      tool: 'get_job_status',
      toolCallId: input.toolCallId || null,
      hadArgPhone: Boolean(argRaw),
      hadFlatCall: Boolean(call),
      flatCallKeys: call ? Object.keys(call).slice(0, 24) : [],
      hadRawBodyMessage: Boolean(asRecord(input.rawBody.message)),
    })
    normalized = normalizePhone(DEMO_PHONE_FALLBACK)
    console.warn('[vapi/tools/get-job-status] using_demo_phone_fallback', {
      toolCallId: input.toolCallId,
      fallback: DEMO_PHONE_FALLBACK,
    })
  }

  return normalized
}

async function handleVapiToolCalls(rawBody: JsonRecord, flat: JsonRecord) {
  const list = flat.toolCallList as JsonRecord[]

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

      const phone = resolvePhoneForJobStatusTool({
        args,
        flat,
        rawBody,
        toolCallId,
      })

      const orgArg = typeof args.organization_id === 'string' ? args.organization_id.trim() : ''

      const parsed = GetJobStatusSchema.safeParse({
        organization_id: orgArg,
        job_number: typeof args.job_number === 'string' ? args.job_number : undefined,
        phone,
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
      return handleVapiToolCalls(body, flat)
    }

    const phone = resolvePhoneForJobStatusTool({
      args: body,
      flat,
      rawBody: body,
      toolCallId: 'flat_json',
    })

    const payload = GetJobStatusSchema.parse({
      ...body,
      phone,
    })
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
