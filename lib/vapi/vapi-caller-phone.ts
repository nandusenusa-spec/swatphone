import { getCallerPhoneFromPayload } from '@/lib/vapi/payload'
import { normalizePhone } from '@/lib/phone'
import type { JsonRecord } from '@/lib/vapi/vapi-org-resolution'

/** Temporal: mismo fallback que get-job-status si no hay Caller ID (quitar cuando producción estable). */
export const DEMO_PHONE_FALLBACK = '+17868673165'

function localAsRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

export type VapiCallerPhoneSource = 'args' | 'flat' | 'rawBody' | 'demo' | 'missing'

/**
 * Resuelve teléfono E.164 para tools Vapi: args.phone, luego payload (flat/raw), opcional demo.
 */
export function resolvePhoneForVapiTool(input: {
  args: JsonRecord
  flat: JsonRecord
  rawBody: JsonRecord
  toolCallId: string
  tool?: string
  allowDemoFallback?: boolean
  logPrefix?: string
}): { phone: string; phoneSource: VapiCallerPhoneSource } {
  const logPrefix = input.logPrefix ?? '[vapi/caller-phone]'
  const tool = input.tool ?? 'tool'
  const allowDemo = input.allowDemoFallback === true

  const argRaw = typeof input.args.phone === 'string' ? input.args.phone.trim() : ''
  const nArg = argRaw ? normalizePhone(argRaw) : ''
  if (nArg) return { phone: nArg, phoneSource: 'args' }

  const fromFlat = getCallerPhoneFromPayload(input.flat) || ''
  const nFlat = fromFlat ? normalizePhone(fromFlat) : ''
  if (nFlat) return { phone: nFlat, phoneSource: 'flat' }

  const fromRaw = getCallerPhoneFromPayload(input.rawBody) || ''
  const nRaw = fromRaw ? normalizePhone(fromRaw) : ''
  if (nRaw) return { phone: nRaw, phoneSource: 'rawBody' }

  const call = localAsRecord(input.flat.call)
  console.error(`${logPrefix} missing_or_invalid_caller_phone`, {
    tool,
    toolCallId: input.toolCallId || null,
    stage: 'before_demo_fallback',
    allow_demo_fallback: allowDemo,
    hadArgPhone: Boolean(argRaw),
    hadFlatCall: Boolean(call),
    flatCallKeys: call ? Object.keys(call).slice(0, 24) : [],
    hadRawBodyMessage: Boolean(localAsRecord(input.rawBody.message)),
  })

  if (allowDemo) {
    const demo = normalizePhone(DEMO_PHONE_FALLBACK)
    if (demo) {
      console.warn(`${logPrefix} using_demo_phone_fallback`, {
        tool,
        toolCallId: input.toolCallId,
        fallback: DEMO_PHONE_FALLBACK,
      })
      return { phone: demo, phoneSource: 'demo' }
    }
  }

  console.error(`${logPrefix} missing_or_invalid_caller_phone`, {
    tool,
    toolCallId: input.toolCallId || null,
    stage: 'final_missing',
  })
  return { phone: '', phoneSource: 'missing' }
}
