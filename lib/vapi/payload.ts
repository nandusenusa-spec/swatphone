type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' ? (value as AnyRecord) : null
}

/**
 * Une el cuerpo JSON original (tras flatten) con el parseado por el handler para no perder
 * transcript/messages/recording que Vapi anida en message.* o artifact.*.
 */
export function mergeVapiWebhookBodiesForExtraction(
  flatFromRawRequest: unknown,
  flatParsed: unknown,
): Record<string, unknown> {
  const r = asRecord(flatFromRawRequest)
  const p = asRecord(flatParsed)
  const base: AnyRecord = { ...(r || {}), ...(p || {}) }
  const rc = asRecord(r?.call)
  const pc = asRecord(p?.call)
  if (rc || pc) {
    base.call = { ...(rc || {}), ...(pc || {}) }
  }
  const ra = asRecord(r?.artifact)
  const pa = asRecord(p?.artifact)
  const rmsg = asRecord(r?.message)
  const pmsg = asRecord(p?.message)
  const rmsgArt = rmsg ? asRecord(rmsg.artifact) : null
  const pmsgArt = pmsg ? asRecord(pmsg.artifact) : null
  if (ra || pa || rmsgArt || pmsgArt) {
    base.artifact = { ...(ra || {}), ...(pa || {}), ...(rmsgArt || {}), ...(pmsgArt || {}) }
  }
  const ran = asRecord(r?.analysis)
  const pan = asRecord(p?.analysis)
  const ranArt = ra ? asRecord(ra.analysis) : null
  const panArt = pa ? asRecord(pa.analysis) : null
  if (ran || pan || ranArt || panArt) {
    base.analysis = { ...(ran || {}), ...(pan || {}), ...(ranArt || {}), ...(panArt || {}) }
  }
  const rm = r?.messages
  const pm = p?.messages
  if (Array.isArray(rm) && rm.length > 0) base.messages = rm
  else if (Array.isArray(pm) && pm.length > 0) base.messages = pm
  return base
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

/** Extrae texto de un mensaje estilo OpenAI / Vapi (content string | parte[] | message). */
function textFromMessageFragment(message: unknown): string {
  const m = asRecord(message)
  if (!m) return typeof message === 'string' ? message : ''
  const direct =
    readString(m, 'message') ||
    readString(m, 'text') ||
    readString(m, 'transcript') ||
    ''
  if (direct) return direct
  const c = m.content
  if (typeof c === 'string') return c.trim()
  if (Array.isArray(c)) {
    return c
      .map((part) => {
        const p = asRecord(part)
        if (!p) return typeof part === 'string' ? part : ''
        return (
          readString(p, 'text') ||
          readString(p, 'transcript') ||
          readString(p, 'content') ||
          ''
        )
      })
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

function normalizeRoleLabel(roleRaw: string): string {
  const r = roleRaw.trim().toLowerCase()
  if (r === 'bot' || r === 'assistant') return 'Assistant'
  if (r === 'user' || r === 'customer' || r === 'caller') return 'User'
  return roleRaw.trim() || 'unknown'
}

export function buildTranscriptFromMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null
  const lines = messages
    .map((message) => {
      const m = asRecord(message)
      if (!m) return null
      const roleRaw =
        readString(m, 'role') ||
        readString(m, 'speaker') ||
        readString(m, 'speakerLabel') ||
        'unknown'
      const role = normalizeRoleLabel(roleRaw)
      const content = textFromMessageFragment(message)
      return content.trim() ? `${role}: ${content.trim()}` : null
    })
    .filter((line): line is string => !!line)
  return lines.length > 0 ? lines.join('\n') : null
}

function buildTranscript(messages: unknown): string | null {
  return buildTranscriptFromMessages(messages)
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

/** Arrays de mensajes en payloads end-of-call-report / conversation. */
export function getMessagesFromPayload(payload: unknown): unknown[] | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const art = getArtifactFromPayload(data)
  const artCall = art ? asRecord(art.call) : null
  const analysis = asRecord(data.analysis)
  const artAnalysis = art ? asRecord(art.analysis) : null
  const msg = asRecord(data.message)
  const fromMessage = msg ? (asRecord(msg.artifact) || msg) : null
  const fromMessageCall = fromMessage ? asRecord(fromMessage.call) : null
  const candidates = [
    msg?.messages,
    data.messages,
    call?.messages,
    art?.messages,
    artCall?.messages,
    analysis?.messages,
    artAnalysis?.messages,
    fromMessage?.messages,
    fromMessageCall?.messages,
  ]
  for (const list of candidates) {
    if (Array.isArray(list) && list.length > 0) return list
  }
  if (Array.isArray(data.openAiMessages) && data.openAiMessages.length > 0) {
    return data.openAiMessages
  }
  if (call && Array.isArray(call.openAiMessages) && call.openAiMessages.length > 0) {
    return call.openAiMessages
  }
  const oai = asRecord(data.openAiMessages) || (call ? asRecord(call.openAiMessages) : null)
  if (oai && Array.isArray(oai.messages) && oai.messages.length > 0) return oai.messages
  return null
}

export function getTranscriptFromPayload(payload: unknown): string | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const art = getArtifactFromPayload(data)
  const artCall = art ? asRecord(art.call) : null
  const analysis = asRecord(data.analysis)
  const artAnalysis = art ? asRecord(art.analysis) : null

  const direct =
    readString(data, 'transcript') ||
    readString(call, 'transcript') ||
    readString(art, 'transcript') ||
    readString(artCall, 'transcript') ||
    readString(art, 'combinedTranscript') ||
    readString(analysis, 'transcript') ||
    readString(artAnalysis, 'transcript')

  if (direct) return direct

  const fromMessages =
    buildTranscript(data.messages) ||
    buildTranscript(call?.messages) ||
    buildTranscript(art?.messages) ||
    buildTranscript(artCall?.messages) ||
    buildTranscript(analysis?.messages) ||
    buildTranscript(artAnalysis?.messages)

  if (fromMessages) return fromMessages

  const msgList = getMessagesFromPayload(payload)
  return msgList ? buildTranscriptFromMessages(msgList) : null
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
    readString(call, 'stereoRecordingUrl') ||
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
  const msg = asRecord(data.message)
  const msgCall = msg ? asRecord(msg.call) : null
  return (
    readString(call, 'id') ||
    readString(msgCall, 'id') ||
    readString(artCall, 'id') ||
    readString(data, 'callId') ||
    readString(data, 'call_id') ||
    readString(art, 'callId') ||
    readString(msg, 'callId') ||
    null
  )
}

/** Tipo de evento server (end-of-call-report, tool-calls, …) aunque venga anidado en message. */
export function getVapiMessageTypeFromPayload(payload: unknown): string {
  const data = asRecord(payload)
  if (!data) return ''
  const msg = asRecord(data.message)
  return (
    readString(data, 'type') ||
    readString(msg, 'type') ||
    ''
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

/** Coste en USD o unidades Vapi (número o en call.cost / analysis). */
export function getCostFromPayload(payload: unknown): number | null {
  const data = asRecord(payload)
  if (!data) return null
  const call = asRecord(data.call)
  const analysis = asRecord(data.analysis)
  const art = getArtifactFromPayload(data)
  const artCall = art ? asRecord(art.call) : null
  const artAnalysis = art ? asRecord(art.analysis) : null
  const callCost = asRecord(call?.cost) || asRecord(artCall?.cost)
  return (
    readNumber(data, 'cost') ||
    readNumber(call, 'cost') ||
    readNumber(artCall, 'cost') ||
    readNumber(callCost, 'total') ||
    readNumber(callCost, 'amount') ||
    readNumber(analysis, 'cost') ||
    readNumber(artAnalysis, 'cost') ||
    null
  )
}

export function getCallTimestampsFromPayload(
  payload: unknown
): { startedAt: string | null; endedAt: string | null } {
  const data = asRecord(payload)
  if (!data) return { startedAt: null, endedAt: null }
  const call = asRecord(data.call)
  const art = getArtifactFromPayload(data)
  const artCall = art ? asRecord(art.call) : null
  const pick = (o: AnyRecord | null) => {
    if (!o) return { s: null as string | null, e: null as string | null }
    return {
      s:
        readString(o, 'startedAt') ||
        readString(o, 'started_at') ||
        readString(o, 'startTime') ||
        null,
      e: readString(o, 'endedAt') || readString(o, 'ended_at') || readString(o, 'endTime') || null,
    }
  }
  const a = pick(call)
  const b = pick(artCall)
  const c = pick(data)
  return {
    startedAt: a.s || b.s || c.s,
    endedAt: a.e || b.e || c.e,
  }
}

/** Objeto `analysis` completo para metadata (Vapi end-of-call-report). */
export function getAnalysisObjectFromPayload(payload: unknown): AnyRecord | null {
  const data = asRecord(payload)
  if (!data) return null
  const art = getArtifactFromPayload(data)
  const artAnalysis = art ? asRecord(art.analysis) : null
  const direct = asRecord(data.analysis)
  if (direct && Object.keys(direct).length > 0) return direct
  if (artAnalysis && Object.keys(artAnalysis).length > 0) return artAnalysis
  return null
}
