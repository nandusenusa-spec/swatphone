type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

/**
 * Aplana envelopes de Vapi (message, artifact, analysis) para server URL / webhooks.
 * Igual que necesita el dispatcher para end-of-call-report.
 */
export function flattenVapiServerEvent(body: JsonRecord): JsonRecord {
  const msg = asRecord(body.message)
  const out: JsonRecord = { ...body }
  if (msg) {
    Object.assign(out, msg)
    const msgCall = asRecord(msg.call)
    const bodyCall = asRecord(body.call)
    if (msgCall || bodyCall) {
      out.call = { ...(bodyCall || {}), ...(msgCall || {}) }
    }
  } else if (body.call) {
    out.call = body.call
  }

  const artRoot = asRecord(body.artifact)
  const artMsg = msg ? asRecord(msg.artifact) : null
  const art = artRoot || artMsg
  if (art) {
    const prev = asRecord(out.artifact)
    out.artifact = { ...(prev || {}), ...art }
    const artAnalysis = asRecord(art.analysis)
    if (artAnalysis) {
      const prevAn = asRecord(out.analysis)
      out.analysis = { ...(prevAn || {}), ...artAnalysis }
    }
  }

  return out
}
