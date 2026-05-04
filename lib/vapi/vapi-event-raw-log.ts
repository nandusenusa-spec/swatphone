import {
  getMessagesFromPayload,
  getRecordingUrlFromPayload,
  getSummaryFromPayload,
  getTranscriptFromPayload,
} from '@/lib/vapi/payload'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function str(obj: JsonRecord | null, key: string): string {
  if (!obj) return ''
  const v = obj[key]
  return typeof v === 'string' ? v : ''
}

function topKeys(obj: Record<string, unknown>, max = 40): string[] {
  return Object.keys(obj).slice(0, max)
}

/**
 * Log estructurado al inicio del POST de /api/voice/events (y puede reutilizarse en webhook).
 */
export function logVapiEventRaw(input: {
  requestUrl: string
  organizationId: string | null
  raw: Record<string, unknown>
  flat: Record<string, unknown>
}) {
  const msg = asRecord(input.raw.message)
  const call = asRecord(input.flat.call) || asRecord(msg?.call)
  const toolCalls = Array.isArray(input.flat.toolCallList)
    ? input.flat.toolCallList
    : Array.isArray(input.flat.toolCalls)
      ? input.flat.toolCalls
      : null

  const messageType =
    str(input.flat, 'type') ||
    str(asRecord(input.raw.message), 'type') ||
    str(input.raw, 'type')
  const event = str(input.flat, 'event') || str(input.raw, 'event')

  const compositeForPayload = input.raw as Record<string, unknown>
  const hasTranscript = Boolean(getTranscriptFromPayload(compositeForPayload)?.trim())
  const hasMessages = Boolean(getMessagesFromPayload(compositeForPayload)?.length)
  const hasRecordingUrl = Boolean(getRecordingUrlFromPayload(compositeForPayload))
  const hasSummary = Boolean(getSummaryFromPayload(compositeForPayload)?.trim())

  const known = new Set([
    'tool-calls',
    'end-of-call-report',
    'status-update',
    'call-ended',
    'hang',
    'hang-up',
    'transcript',
    'conversation-update',
    'assistant-request',
    'transfer-update',
    'transfer-destination-request',
    'speech-update',
    'voice-input',
  ])
  const isKnown = known.has(messageType)

  console.log('[vapi/event/raw]', {
    requestUrl: input.requestUrl,
    organization_id: input.organizationId,
    topLevelKeys: topKeys(input.raw),
    messageType,
    type: str(input.raw, 'type'),
    event,
    callId: str(call, 'id') || str(input.flat, 'callId') || str(input.flat, 'call_id') || '',
    assistantId:
      str(call, 'assistantId') ||
      str(call, 'assistant_id') ||
      str(input.flat, 'assistantId') ||
      str(input.flat, 'assistant_id') ||
      '',
    hasMessage: Boolean(msg),
    hasCall: Boolean(call),
    hasTranscript,
    hasMessages,
    hasRecordingUrl,
    hasSummary,
    hasToolCalls: Boolean(toolCalls && toolCalls.length > 0),
  })

  if (messageType === 'tool-calls') {
    console.log('[vapi/event/detected]', { kind: 'tool-calls', count: toolCalls?.length ?? 0 })
  } else if (messageType === 'end-of-call-report') {
    console.log('[vapi/event/detected]', { kind: 'end-of-call-report' })
  } else if (messageType === 'call-ended') {
    console.log('[vapi/event/detected]', { kind: 'call-ended' })
  } else if (messageType === 'status-update') {
    console.log('[vapi/event/detected]', { kind: 'status-update' })
  } else if (messageType === 'transcript') {
    console.log('[vapi/event/detected]', { kind: 'transcript' })
  } else if (messageType === 'conversation-update') {
    console.log('[vapi/event/detected]', { kind: 'conversation-update' })
  } else if (messageType === 'hang' || messageType === 'hang-up') {
    console.log('[vapi/event/detected]', { kind: 'hang', messageType })
  } else if (!isKnown && messageType) {
    console.warn('[vapi/event/unknown]', {
      keys: topKeys(input.flat, 60),
      messageType,
      type: str(input.raw, 'type'),
    })
  }
}
