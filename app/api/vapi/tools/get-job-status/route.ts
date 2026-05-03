import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getCallerPhoneFromPayload } from '@/lib/vapi/payload'
import { normalizePhone } from '@/lib/phone'
import { GetJobStatusSchema } from '@/lib/voice-platform/validation'
import { runGetJobStatus } from '@/lib/voice-platform/service'

type JsonRecord = Record<string, unknown>

/** Fallback temporal si no hay Caller ID en el envelope (quitar cuando producción estable). */
const DEMO_PHONE_FALLBACK = '+17868673165'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function defaultOrgIdForJobStatusTool(): string {
  return (
    process.env.DEFAULT_GET_JOB_STATUS_ORGANIZATION_ID?.trim() ||
    process.env.VAPI_DEFAULT_ORGANIZATION_ID?.trim() ||
    ''
  )
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

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

/** Respuesta estable para el assistant: siempre found + primary_message_for_caller cuando aplique. */
function toolErrorResult(input: {
  error: string
  primary_message_for_caller: string
  details?: unknown
}) {
  return {
    found: false as const,
    primary_message_for_caller: input.primary_message_for_caller,
    error: input.error,
    ...(input.details !== undefined ? { details: input.details } : {}),
  }
}

function resolvePhoneForJobStatusTool(input: {
  args: JsonRecord
  flat: JsonRecord
  rawBody: JsonRecord
  toolCallId: string
}): { phone: string; usedDemoFallback: boolean; phoneSource: 'args' | 'payload' | 'demo_fallback' } {
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
    return { phone: normalized, usedDemoFallback: true, phoneSource: 'demo_fallback' }
  }

  const phoneSource: 'args' | 'payload' = argRaw ? 'args' : 'payload'
  return { phone: normalized, usedDemoFallback: false, phoneSource }
}

function resolveOrganizationIdForTool(
  args: JsonRecord,
  toolCallId: string,
): { organizationId: string | null; orgSource: 'args' | 'env' } {
  let raw = typeof args.organization_id === 'string' ? args.organization_id.trim() : ''
  if (raw && !UUID_RE.test(raw)) {
    console.warn('[vapi/tools/get-job-status] invalid_organization_id_arg_ignored', {
      toolCallId,
      preview: raw.slice(0, 24),
    })
    raw = ''
  }
  if (raw) return { organizationId: raw, orgSource: 'args' }

  const fromEnv = defaultOrgIdForJobStatusTool()
  if (fromEnv && UUID_RE.test(fromEnv)) {
    return { organizationId: fromEnv, orgSource: 'env' }
  }
  if (fromEnv) {
    console.error('[vapi/tools/get-job-status] invalid_default_org_env', {
      preview: fromEnv.slice(0, 24),
    })
  }
  console.error('[vapi/tools/get-job-status] missing_organization_id', { toolCallId })
  return { organizationId: null, orgSource: 'env' }
}

function safeArgsKeys(args: JsonRecord): string[] {
  try {
    return Object.keys(args).slice(0, 32)
  } catch {
    return []
  }
}

async function executeGetJobStatusForTool(input: {
  args: JsonRecord
  flat: JsonRecord
  rawBody: JsonRecord
  toolCallId: string
  name: string
}) {
  const { toolCallId, name, args, flat, rawBody } = input

  console.info('[vapi/tools/get-job-status] tool_call_args', {
    toolCallId,
    argKeys: safeArgsKeys(args),
  })

  const { organizationId, orgSource } = resolveOrganizationIdForTool(args, toolCallId)
  const { phone, usedDemoFallback, phoneSource } = resolvePhoneForJobStatusTool({
    args,
    flat,
    rawBody,
    toolCallId,
  })

  console.info('[vapi/tools/get-job-status] resolution', {
    toolCallId,
    orgSource,
    hasOrganizationId: Boolean(organizationId),
    phoneSource,
    usedDemoFallback,
    runGetJobStatus_preview: organizationId ? 'pending' : 'skipped',
  })

  if (!organizationId) {
    const payload = toolErrorResult({
      error: 'missing_organization_id',
      primary_message_for_caller:
        'No pudimos consultar el estado en este momento. Te comunicamos con un asesor.',
    })
    return { toolCallId, name, result: JSON.stringify(payload) }
  }

  const jn = typeof args.job_number === 'string' ? args.job_number.trim() : ''
  const on = typeof args.order_number === 'string' ? args.order_number.trim() : ''
  const jobNumRaw = jn || on || undefined

  const parsed = GetJobStatusSchema.safeParse({
    organization_id: organizationId,
    job_number: jobNumRaw,
    phone,
  })

  if (!parsed.success) {
    const payload = toolErrorResult({
      error: 'invalid_payload',
      primary_message_for_caller:
        'No pudimos validar la consulta. Pedí hablar con un asesor o intentá de nuevo.',
      details: parsed.error.flatten(),
    })
    console.warn('[vapi/tools/get-job-status] zod_invalid_payload', {
      toolCallId,
      issues: parsed.error.flatten(),
    })
    return { toolCallId, name, result: JSON.stringify(payload) }
  }

  try {
    const out = await runGetJobStatus({
      organizationId: parsed.data.organization_id,
      jobNumber: parsed.data.job_number,
      phone: parsed.data.phone,
    })
    console.info('[vapi/tools/get-job-status] runGetJobStatus_ok', {
      toolCallId,
      found: out.found,
      orgSource,
      phoneSource,
    })
    return { toolCallId, name, result: JSON.stringify(out) }
  } catch (err) {
    console.error('[vapi/tools/get-job-status] runGetJobStatus_failed', {
      toolCallId,
      message: err instanceof Error ? err.message : String(err),
    })
    const payload = toolErrorResult({
      error: 'internal_error',
      primary_message_for_caller:
        'Hubo un problema al consultar tu pedido. Te contactamos en breve.',
    })
    return { toolCallId, name, result: JSON.stringify(payload) }
  }
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

      return executeGetJobStatusForTool({
        args,
        flat,
        rawBody,
        toolCallId,
        name,
      })
    }),
  )

  return NextResponse.json({ results }, { status: 200 })
}

export async function POST(request: NextRequest) {
  let body: JsonRecord
  try {
    body = (await request.json()) as JsonRecord
  } catch {
    return NextResponse.json(
      toolErrorResult({
        error: 'invalid_json',
        primary_message_for_caller:
          'No pudimos procesar la consulta. Intentá de nuevo o pedí un asesor.',
      }),
      { status: 200 },
    )
  }

  try {
    const flat = flattenVapiBody(body)

    if (isVapiToolCallsPayload(flat)) {
      return handleVapiToolCalls(body, flat)
    }

    const toolCallId = 'flat_json'
    console.info('[vapi/tools/get-job-status] flat_body_keys', {
      toolCallId,
      keys: safeArgsKeys(body),
    })

    const { organizationId, orgSource } = resolveOrganizationIdForTool(body, toolCallId)
    const { phone, phoneSource, usedDemoFallback } = resolvePhoneForJobStatusTool({
      args: body,
      flat,
      rawBody: body,
      toolCallId,
    })

    console.info('[vapi/tools/get-job-status] resolution', {
      toolCallId,
      orgSource,
      hasOrganizationId: Boolean(organizationId),
      phoneSource,
      usedDemoFallback,
    })

    if (!organizationId) {
      return NextResponse.json(
        toolErrorResult({
          error: 'missing_organization_id',
          primary_message_for_caller:
            'No pudimos consultar el estado en este momento. Te comunicamos con un asesor.',
        }),
        { status: 200 },
      )
    }

    const jf = typeof body.job_number === 'string' ? body.job_number.trim() : ''
    const of = typeof body.order_number === 'string' ? body.order_number.trim() : ''
    const jobNumFlat = jf || of || undefined

    const parsed = GetJobStatusSchema.safeParse({
      organization_id: organizationId,
      job_number: jobNumFlat,
      phone,
    })

    if (!parsed.success) {
      return NextResponse.json(
        toolErrorResult({
          error: 'invalid_payload',
          primary_message_for_caller:
            'No pudimos validar la consulta. Pedí hablar con un asesor o intentá de nuevo.',
          details: parsed.error.flatten(),
        }),
        { status: 200 },
      )
    }

    try {
      const result = await runGetJobStatus({
        organizationId: parsed.data.organization_id,
        jobNumber: parsed.data.job_number,
        phone: parsed.data.phone,
      })
      console.info('[vapi/tools/get-job-status] runGetJobStatus_ok', {
        toolCallId,
        found: result.found,
        orgSource,
        phoneSource,
      })
      return NextResponse.json(result, { status: 200 })
    } catch (err) {
      console.error('[vapi/tools/get-job-status] runGetJobStatus_failed', {
        toolCallId,
        message: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json(
        toolErrorResult({
          error: 'internal_error',
          primary_message_for_caller:
            'Hubo un problema al consultar tu pedido. Te contactamos en breve.',
        }),
        { status: 200 },
      )
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        toolErrorResult({
          error: 'invalid_payload',
          primary_message_for_caller:
            'No pudimos validar la consulta. Pedí hablar con un asesor o intentá de nuevo.',
          details: error.flatten(),
        }),
        { status: 200 },
      )
    }
    console.error('[vapi/tools/get-job-status] failed', error)
    return NextResponse.json(
      toolErrorResult({
        error: 'internal_error',
        primary_message_for_caller:
          'Hubo un problema al consultar tu pedido. Te contactamos en breve.',
      }),
      { status: 200 },
    )
  }
}
