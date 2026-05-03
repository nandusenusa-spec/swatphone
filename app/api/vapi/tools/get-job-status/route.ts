import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { normalizePhone } from '@/lib/phone'
import { GetJobStatusSchema } from '@/lib/voice-platform/validation'
import { runGetJobStatus } from '@/lib/voice-platform/service'
import {
  asRecord,
  resolveOrganizationIdForVapiTools,
  type JobStatusOrgSource,
  type JsonRecord,
} from '@/lib/vapi/vapi-org-resolution'
import { resolvePhoneForVapiTool } from '@/lib/vapi/vapi-caller-phone'
import { logVapiToolCallReceived } from '@/lib/vapi/tool-call-logging'

export type { JobStatusOrgSource } from '@/lib/vapi/vapi-org-resolution'

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

type JobStatusRunDebugStatus = 'found' | 'not_found' | 'skipped' | 'error'

function vapiGetJobStatusDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.DEBUG_VAPI_TOOLS?.trim().toLowerCase() === 'true'
  )
}

function maskPhoneE164ForDebug(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 2) return '****'
  return `…${digits.slice(-4)}`
}

function buildGetJobStatusDebug(input: {
  toolCallId: string
  assistantIdDetected: string | null
  organization_id_final: string | null
  orgSource: JobStatusOrgSource
  phoneSource: string
  phone: string
  hasJobNumber: boolean
  hasOrderNumber: boolean
  runGetJobStatus_status: JobStatusRunDebugStatus
}): Record<string, unknown> | null {
  if (!vapiGetJobStatusDebugEnabled()) return null
  const hasPhone = Boolean(input.phone?.trim())
  const row: Record<string, unknown> = {
    toolCallId: input.toolCallId,
    assistantIdDetected: input.assistantIdDetected,
    organization_id_final: input.organization_id_final,
    orgSource: input.orgSource,
    phoneSource: input.phoneSource,
    hasPhone,
    hasJobNumber: input.hasJobNumber,
    hasOrderNumber: input.hasOrderNumber,
    runGetJobStatus_status: input.runGetJobStatus_status,
  }
  if (hasPhone) {
    row.phone_e164_masked = maskPhoneE164ForDebug(input.phone)
  }
  return row
}

function withDebug<T extends Record<string, unknown>>(base: T, debug: Record<string, unknown> | null): T {
  if (!debug) return base
  return { ...base, debug }
}

function stringifyToolResult(base: Record<string, unknown>, debug: Record<string, unknown> | null): string {
  return JSON.stringify(withDebug(base, debug))
}

function safeArgsKeys(args: JsonRecord): string[] {
  try {
    return Object.keys(args).slice(0, 32)
  } catch {
    return []
  }
}

async function executeGetJobStatusForTool(input: {
  request: NextRequest | null
  args: JsonRecord
  flat: JsonRecord
  rawBody: JsonRecord
  toolCallId: string
  name: string
}) {
  const { request, toolCallId, name, args, flat, rawBody } = input

  const {
    organizationId,
    orgSource,
    assistantIdDetected,
    mappingDetail,
  } = await resolveOrganizationIdForVapiTools({
    args,
    flat,
    rawBody,
    request,
    toolCallId,
    logPrefix: '[vapi/tools/get-job-status]',
  })
  const { phone, phoneSource } = resolvePhoneForVapiTool({
    args,
    flat,
    rawBody,
    toolCallId,
    tool: 'get_job_status',
    allowDemoFallback: true,
    logPrefix: '[vapi/tools/get-job-status]',
  })

  const jn = typeof args.job_number === 'string' ? args.job_number.trim() : ''
  const on = typeof args.order_number === 'string' ? args.order_number.trim() : ''
  const jobNumRaw = jn || on || undefined

  console.info('[vapi/tools/get-job-status] resolution', {
    toolCallId,
    assistantIdDetected,
    organization_id_final: organizationId,
    orgSource,
    org_mapping_detail: mappingDetail,
    argKeys: safeArgsKeys(args),
    phoneSource,
    runGetJobStatus_preview: organizationId ? 'pending' : 'skipped',
  })

  if (!organizationId) {
    const dbg = buildGetJobStatusDebug({
      toolCallId,
      assistantIdDetected,
      organization_id_final: organizationId,
      orgSource,
      phoneSource,
      phone,
      hasJobNumber: Boolean(jn),
      hasOrderNumber: Boolean(on),
      runGetJobStatus_status: 'skipped',
    })
    const payload = toolErrorResult({
      error: 'missing_organization_id',
      primary_message_for_caller:
        'No pudimos consultar el estado en este momento. Te comunicamos con un asesor.',
    })
    return { toolCallId, name, result: stringifyToolResult(payload as Record<string, unknown>, dbg) }
  }

  if (!phone && !jobNumRaw) {
    const dbg = buildGetJobStatusDebug({
      toolCallId,
      assistantIdDetected,
      organization_id_final: organizationId,
      orgSource,
      phoneSource,
      phone,
      hasJobNumber: Boolean(jn),
      hasOrderNumber: Boolean(on),
      runGetJobStatus_status: 'skipped',
    })
    const payload = toolErrorResult({
      error: 'missing_or_invalid_caller_phone',
      primary_message_for_caller:
        'No pudimos identificar tu número para buscar el pedido. Te comunicamos con un asesor.',
    })
    console.error('[vapi/tools/get-job-status] missing_or_invalid_caller_phone', {
      toolCallId,
      phoneSource,
      hasJobNumber: false,
    })
    return { toolCallId, name, result: stringifyToolResult(payload as Record<string, unknown>, dbg) }
  }

  const parsed = GetJobStatusSchema.safeParse({
    organization_id: organizationId,
    job_number: jobNumRaw,
    phone,
  })

  if (!parsed.success) {
    const dbg = buildGetJobStatusDebug({
      toolCallId,
      assistantIdDetected,
      organization_id_final: organizationId,
      orgSource,
      phoneSource,
      phone,
      hasJobNumber: Boolean(jn),
      hasOrderNumber: Boolean(on),
      runGetJobStatus_status: 'error',
    })
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
    return { toolCallId, name, result: stringifyToolResult(payload as Record<string, unknown>, dbg) }
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
      runGetJobStatus_status: out.found ? 'found' : 'not_found',
      orgSource,
      phoneSource,
    })
    const dbg = buildGetJobStatusDebug({
      toolCallId,
      assistantIdDetected,
      organization_id_final: organizationId,
      orgSource,
      phoneSource,
      phone,
      hasJobNumber: Boolean(jn),
      hasOrderNumber: Boolean(on),
      runGetJobStatus_status: out.found ? 'found' : 'not_found',
    })
    return {
      toolCallId,
      name,
      result: stringifyToolResult({ ...(out as Record<string, unknown>) }, dbg),
    }
  } catch (err) {
    console.error('[vapi/tools/get-job-status] runGetJobStatus_failed', {
      toolCallId,
      message: err instanceof Error ? err.message : String(err),
    })
    const dbg = buildGetJobStatusDebug({
      toolCallId,
      assistantIdDetected,
      organization_id_final: organizationId,
      orgSource,
      phoneSource,
      phone,
      hasJobNumber: Boolean(jn),
      hasOrderNumber: Boolean(on),
      runGetJobStatus_status: 'error',
    })
    const payload = toolErrorResult({
      error: 'internal_error',
      primary_message_for_caller:
        'Hubo un problema al consultar tu pedido. Te contactamos en breve.',
    })
    return { toolCallId, name, result: stringifyToolResult(payload as Record<string, unknown>, dbg) }
  }
}

async function handleVapiToolCalls(
  request: NextRequest,
  rawBody: JsonRecord,
  flat: JsonRecord,
  requestUrl: string,
) {
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

      logVapiToolCallReceived({
        requestUrl,
        toolCallId,
        toolName: name,
        argKeys: Object.keys(args),
        source: 'get-job-status',
      })

      if (name !== 'get_job_status') {
        return {
          toolCallId,
          name: name || 'unknown',
          result: JSON.stringify({
            ok: false,
            error: 'unknown_tool',
            toolName: name || 'unknown',
            hint: 'This endpoint only handles get_job_status; price/lead/follow-up use /api/voice/events',
          }),
        }
      }

      return executeGetJobStatusForTool({
        request,
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
      return handleVapiToolCalls(request, body, flat, request.url)
    }

    const toolCallId = 'flat_json'
    logVapiToolCallReceived({
      requestUrl: request.url,
      toolCallId,
      toolName: 'get_job_status',
      argKeys: safeArgsKeys(body),
      source: 'get-job-status-flat',
    })
    console.info('[vapi/tools/get-job-status] flat_body_keys', {
      toolCallId,
      keys: safeArgsKeys(body),
    })

    const {
      organizationId,
      orgSource,
      assistantIdDetected,
      mappingDetail,
    } = await resolveOrganizationIdForVapiTools({
      args: body,
      flat,
      rawBody: body,
      request,
      toolCallId,
      logPrefix: '[vapi/tools/get-job-status]',
    })
    const { phone, phoneSource } = resolvePhoneForVapiTool({
      args: body,
      flat,
      rawBody: body,
      toolCallId,
      tool: 'get_job_status',
      allowDemoFallback: true,
      logPrefix: '[vapi/tools/get-job-status]',
    })

    const jf = typeof body.job_number === 'string' ? body.job_number.trim() : ''
    const of = typeof body.order_number === 'string' ? body.order_number.trim() : ''
    const jobNumFlat = jf || of || undefined

    console.info('[vapi/tools/get-job-status] resolution', {
      toolCallId,
      assistantIdDetected,
      organization_id_final: organizationId,
      orgSource,
      org_mapping_detail: mappingDetail,
      argKeys: safeArgsKeys(body),
      phoneSource,
    })

    if (!organizationId) {
      const dbg = buildGetJobStatusDebug({
        toolCallId,
        assistantIdDetected,
        organization_id_final: organizationId,
        orgSource,
        phoneSource,
        phone,
        hasJobNumber: Boolean(jf),
        hasOrderNumber: Boolean(of),
        runGetJobStatus_status: 'skipped',
      })
      return NextResponse.json(
        withDebug(
          toolErrorResult({
            error: 'missing_organization_id',
            primary_message_for_caller:
              'No pudimos consultar el estado en este momento. Te comunicamos con un asesor.',
          }) as Record<string, unknown>,
          dbg,
        ),
        { status: 200 },
      )
    }

    if (!phone && !jobNumFlat) {
      console.error('[vapi/tools/get-job-status] missing_or_invalid_caller_phone', {
        toolCallId,
        phoneSource,
        hasJobNumber: false,
      })
      const dbg = buildGetJobStatusDebug({
        toolCallId,
        assistantIdDetected,
        organization_id_final: organizationId,
        orgSource,
        phoneSource,
        phone,
        hasJobNumber: Boolean(jf),
        hasOrderNumber: Boolean(of),
        runGetJobStatus_status: 'skipped',
      })
      return NextResponse.json(
        withDebug(
          toolErrorResult({
            error: 'missing_or_invalid_caller_phone',
            primary_message_for_caller:
              'No pudimos identificar tu número para buscar el pedido. Te comunicamos con un asesor.',
          }) as Record<string, unknown>,
          dbg,
        ),
        { status: 200 },
      )
    }

    const parsed = GetJobStatusSchema.safeParse({
      organization_id: organizationId,
      job_number: jobNumFlat,
      phone,
    })

    if (!parsed.success) {
      const dbg = buildGetJobStatusDebug({
        toolCallId,
        assistantIdDetected,
        organization_id_final: organizationId,
        orgSource,
        phoneSource,
        phone,
        hasJobNumber: Boolean(jf),
        hasOrderNumber: Boolean(of),
        runGetJobStatus_status: 'error',
      })
      return NextResponse.json(
        withDebug(
          toolErrorResult({
            error: 'invalid_payload',
            primary_message_for_caller:
              'No pudimos validar la consulta. Pedí hablar con un asesor o intentá de nuevo.',
            details: parsed.error.flatten(),
          }) as Record<string, unknown>,
          dbg,
        ),
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
        runGetJobStatus_status: result.found ? 'found' : 'not_found',
        orgSource,
        phoneSource,
      })
      const dbg = buildGetJobStatusDebug({
        toolCallId,
        assistantIdDetected,
        organization_id_final: organizationId,
        orgSource,
        phoneSource,
        phone,
        hasJobNumber: Boolean(jf),
        hasOrderNumber: Boolean(of),
        runGetJobStatus_status: result.found ? 'found' : 'not_found',
      })
      return NextResponse.json(withDebug({ ...(result as Record<string, unknown>) }, dbg), { status: 200 })
    } catch (err) {
      console.error('[vapi/tools/get-job-status] runGetJobStatus_failed', {
        toolCallId,
        message: err instanceof Error ? err.message : String(err),
      })
      const dbg = buildGetJobStatusDebug({
        toolCallId,
        assistantIdDetected,
        organization_id_final: organizationId,
        orgSource,
        phoneSource,
        phone,
        hasJobNumber: Boolean(jf),
        hasOrderNumber: Boolean(of),
        runGetJobStatus_status: 'error',
      })
      return NextResponse.json(
        withDebug(
          toolErrorResult({
            error: 'internal_error',
            primary_message_for_caller:
              'Hubo un problema al consultar tu pedido. Te contactamos en breve.',
          }) as Record<string, unknown>,
          dbg,
        ),
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
