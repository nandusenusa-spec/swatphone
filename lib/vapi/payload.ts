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

export function getTranscriptFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)

  return (
    readString(data, 'transcript') ||
    readString(call, 'transcript') ||
    buildTranscript(data.messages) ||
    buildTranscript(call?.messages) ||
    null
  )
}

export function getRecordingUrlFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const monitor = asRecord(data.monitor)

  return (
    readString(data, 'recordingUrl') ||
    readString(data, 'recording_url') ||
    readString(call, 'recordingUrl') ||
    readString(call, 'recording_url') ||
    readString(monitor, 'recordingUrl') ||
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
  return readString(call, 'id') || readString(data, 'callId') || readString(data, 'call_id') || null
}

export function getCallerPhoneFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const customer = asRecord(call?.customer)
  const phoneNumber = asRecord(call?.phoneNumber)
  const fromObj = asRecord(call?.from)

  const fromDirect =
    typeof call?.from === 'string' && call.from.trim() ? call.from.trim() : null

  return (
    fromDirect ||
    readString(fromObj, 'number') ||
    readString(fromObj, 'phoneNumber') ||
    readString(customer, 'number') ||
    readString(phoneNumber, 'number') ||
    readString(call, 'customerNumber') ||
    readString(call, 'phoneNumber') ||
    readString(data, 'phoneNumber') ||
    null
  )
}

export function getSummaryFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const analysis = asRecord(data.analysis)

  return (
    readString(call, 'summary') ||
    readString(data, 'summary') ||
    readString(analysis, 'summary') ||
    null
  )
}

export function getDurationSecondsFromPayload(payload: unknown): number | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const analysis = asRecord(data.analysis)
  const duration = readNumber(call, 'duration') || readNumber(data, 'duration') || readNumber(analysis, 'durationSeconds')
  if (duration === null) return null
  return duration < 0 ? 0 : Math.round(duration)
}
