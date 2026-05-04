type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' ? (value as AnyRecord) : null
}

function readString(source: AnyRecord | null, key: string): string | null {
  if (!source) return null
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(source: AnyRecord | null, key: string): number | null {
  if (!source) return null
  const value = source[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function buildTranscript(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null
  const lines = messages
    .map((message) => {
      const m = asRecord(message)
      if (!m) return null
      const role = readString(m, 'role') || 'unknown'
      const content = readString(m, 'content') || ''
      return content ? `${role}: ${content}` : null
    })
    .filter((line): line is string => !!line)
  return lines.length > 0 ? lines.join('\n') : null
}

/** `artifact` puede venir en raíz o dentro de `message` (end-of-call-report). */
export function getArtifactFromPayload(payload: unknown): AnyRecord | null {
  const data = asRecord(payload)
  if (!data) return null
  const root = asRecord(data.artifact)
  if (root) return root
  const msg = asRecord(data.message)
  const nested = msg ? asRecord(msg.artifact) : null
  return nested || null
}

export function getTranscriptFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const art = getArtifactFromPayload(data)
  const artCall = art ? asRecord(art.call) : null

  return (
    readString(data, 'transcript') ||
    readString(call, 'transcript') ||
    readString(art, 'transcript') ||
    readString(art, 'combinedTranscript') ||
    buildTranscript(data.messages) ||
    buildTranscript(call?.messages) ||
    buildTranscript(art?.messages) ||
    buildTranscript(artCall?.messages) ||
    null
  )
}

export function getRecordingUrlFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const monitor = asRecord(data.monitor)
  const art = getArtifactFromPayload(data)
  const artCall = art ? asRecord(art.call) : null

  return (
    readString(data, 'recordingUrl') ||
    readString(data, 'recording_url') ||
    readString(call, 'recordingUrl') ||
    readString(call, 'recording_url') ||
    readString(monitor, 'recordingUrl') ||
    readString(art, 'recordingUrl') ||
    readString(art, 'recording_url') ||
    readString(artCall, 'recordingUrl') ||
    readString(artCall, 'recording_url') ||
    null
  )
}

export function getAssistantIdFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const assistant = asRecord(data.assistant)
  return (
    readString(call, 'assistantId') ||
    readString(call, 'assistant_id') ||
    readString(data, 'assistantId') ||
    readString(data, 'assistant_id') ||
    readString(assistant, 'id') ||
    null
  )
}

export function getCallIdFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const art = getArtifactFromPayload(data)
  const artCall = art ? asRecord(art.call) : null
  return (
    readString(call, 'id') ||
    readString(artCall, 'id') ||
    readString(data, 'callId') ||
    readString(data, 'call_id') ||
    readString(art, 'callId') ||
    null
  )
}

/** Lee número del llamante desde un objeto tipo `call` de Vapi (inbound, tool-calls, etc.). */
export function getCallerPhoneFromCallLike(call: unknown): string | null {
  const c = asRecord(call)
  if (!c) return null
  const customer = asRecord(c.customer)
  const phoneNumber = asRecord(c.phoneNumber)
  const fromObj = asRecord(c.from)

  const fromDirect =
    typeof c.from === 'string' && c.from.trim() ? c.from.trim() : null

  return (
    fromDirect ||
    readString(fromObj, 'number') ||
    readString(fromObj, 'phoneNumber') ||
    readString(customer, 'number') ||
    readString(customer, 'phone') ||
    readString(phoneNumber, 'number') ||
    readString(c, 'customerNumber') ||
    readString(c, 'phoneNumber') ||
    readString(c, 'phone') ||
    null
  )
}

/**
 * Teléfono del llamante desde payloads Vapi (webhook, tool-calls, assistant-request).
 * Cubre: call.from (string u objeto), call.customer.number, message.call.*, customer a nivel raíz.
 */
export function getCallerPhoneFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null

  const fromTopCall = getCallerPhoneFromCallLike(data.call)
  if (fromTopCall) return fromTopCall

  const message = asRecord(data.message)
  const fromMessageCall = getCallerPhoneFromCallLike(message?.call)
  if (fromMessageCall) return fromMessageCall

  const customerRoot = asRecord(data.customer)
  const fromCustomerRoot =
    readString(customerRoot, 'number') || readString(customerRoot, 'phone')
  if (fromCustomerRoot) return fromCustomerRoot

  const art = getArtifactFromPayload(data)
  const fromArtCall = getCallerPhoneFromCallLike(art ? asRecord(art.call) : null)
  if (fromArtCall) return fromArtCall

  return readString(data, 'phoneNumber') || readString(data, 'phone') || null
}

export function getSummaryFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const analysis = asRecord(data.analysis)
  const art = getArtifactFromPayload(data)
  const artAnalysis = art ? asRecord(art.analysis) : null
  const artCall = art ? asRecord(art.call) : null

  return (
    readString(call, 'summary') ||
    readString(artCall, 'summary') ||
    readString(data, 'summary') ||
    readString(analysis, 'summary') ||
    readString(artAnalysis, 'summary') ||
    readString(art, 'summary') ||
    null
  )
}

export function getTopicFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const analysis = asRecord(data.analysis)
  const art = getArtifactFromPayload(data)
  const artAnalysis = art ? asRecord(art.analysis) : null
  return readString(analysis, 'topic') || readString(artAnalysis, 'topic') || readString(data, 'topic')
}

export function getSentimentFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const analysis = asRecord(data.analysis)
  const art = getArtifactFromPayload(data)
  const artAnalysis = art ? asRecord(art.analysis) : null
  return (
    readString(analysis, 'sentiment') ||
    readString(artAnalysis, 'sentiment') ||
    readString(data, 'sentiment') ||
    null
  )
}

export function getEndedReasonFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const art = getArtifactFromPayload(data)
  const artCall = art ? asRecord(art.call) : null
  return (
    readString(data, 'endedReason') ||
    readString(call, 'endedReason') ||
    readString(artCall, 'endedReason') ||
    readString(art, 'endedReason') ||
    null
  )
}

export function getDurationSecondsFromPayload(payload: unknown): number | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const analysis = asRecord(data.analysis)
  const art = getArtifactFromPayload(data)
  const artCall = art ? asRecord(art.call) : null
  const artAnalysis = art ? asRecord(art.analysis) : null
  const duration =
    readNumber(call, 'duration') ||
    readNumber(artCall, 'duration') ||
    readNumber(data, 'duration') ||
    readNumber(analysis, 'durationSeconds') ||
    readNumber(artAnalysis, 'durationSeconds')
  if (duration === null) return null
  return duration < 0 ? 0 : Math.round(duration)
}
