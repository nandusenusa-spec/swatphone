import type { NextRequest } from 'next/server'
import { getAssistantIdFromPayload } from '@/lib/vapi/payload'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type JsonRecord = Record<string, unknown>

export type JobStatusOrgSource =
  | 'args'
  | 'query'
  | 'assistant_server_url'
  | 'assistant_mapping'
  | 'env'
  | 'missing'

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Optional env fallback: VAPI_ASSISTANT_ORG_MAPPING=assistantUuid:orgUuid,...
 * Prefer lookupOrganizationIdByVapiAssistantId (organizations.vapi_assistant_id).
 */
export function parseVapiAssistantOrgMappingFromEnv(): Readonly<Record<string, string>> {
  const raw = process.env.VAPI_ASSISTANT_ORG_MAPPING?.trim()
  if (!raw) return {}
  const out: Record<string, string> = {}
  for (const part of raw.split(',')) {
    const sep = part.indexOf(':')
    if (sep < 0) continue
    const assistantId = part.slice(0, sep).trim()
    const orgId = part.slice(sep + 1).trim()
    if (assistantId && orgId && UUID_RE.test(assistantId) && UUID_RE.test(orgId)) {
      out[assistantId] = orgId
    }
  }
  return out
}

export function defaultOrgIdFromEnvForVapiTools(): string {
  return (
    process.env.DEFAULT_GET_JOB_STATUS_ORGANIZATION_ID?.trim() ||
    process.env.VAPI_DEFAULT_ORGANIZATION_ID?.trim() ||
    ''
  )
}

export function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

export function extractOrgIdFromUrlString(urlStr: string): string | null {
  const s = urlStr.trim()
  if (!s) return null
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const oid = new URL(s).searchParams.get('organization_id')?.trim()
      if (oid && UUID_RE.test(oid)) return oid
    } catch {
      /* noop */
    }
    return null
  }
  const qIdx = s.indexOf('?')
  if (qIdx >= 0) {
    try {
      const oid = new URLSearchParams(s.slice(qIdx + 1)).get('organization_id')?.trim()
      if (oid && UUID_RE.test(oid)) return oid
    } catch {
      /* noop */
    }
  }
  return null
}

export function collectAssistantServerUrlCandidates(flat: JsonRecord, rawBody: JsonRecord): string[] {
  const urls: string[] = []
  const add = (v: unknown) => {
    if (typeof v !== 'string') return
    const t = v.trim()
    if (!t) return
    if (t.includes('organization_id=') || t.startsWith('http')) urls.push(t)
  }
  const fromAsst = (a: JsonRecord | null) => {
    if (!a) return
    add(a.serverUrl)
    add(a.server_url)
  }
  const msg = asRecord(rawBody.message)
  const msgCall = asRecord(msg?.call)
  fromAsst(asRecord(msgCall?.assistant))
  fromAsst(asRecord(msg?.assistant))
  const rootCall = asRecord(rawBody.call)
  fromAsst(asRecord(rootCall?.assistant))
  fromAsst(asRecord(rawBody.assistant))

  const fCall = asRecord(flat.call)
  fromAsst(asRecord(fCall?.assistant))
  fromAsst(asRecord(flat.assistant))

  return [...new Set(urls)]
}

export async function lookupOrganizationIdByVapiAssistantId(
  assistantId: string,
  logPrefix = '[vapi/org-resolve]',
): Promise<string | null> {
  if (!assistantId || !UUID_RE.test(assistantId)) return null
  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .eq('vapi_assistant_id', assistantId)
      .maybeSingle()
    if (error) {
      console.warn(`${logPrefix} org_by_assistant_query_error`, {
        message: error.message,
        code: error.code,
        assistantId,
      })
      return null
    }
    const id = data?.id
    return typeof id === 'string' && UUID_RE.test(id) ? id : null
  } catch (e) {
    console.warn(`${logPrefix} org_by_assistant_exception`, {
      message: e instanceof Error ? e.message : String(e),
      assistantId,
    })
    return null
  }
}

export function detectAssistantId(flat: JsonRecord, rawBody: JsonRecord): string | null {
  const fromPayload =
    getAssistantIdFromPayload(flat) ||
    getAssistantIdFromPayload(rawBody) ||
    getAssistantIdFromPayload(asRecord(rawBody.message))
  if (fromPayload) return fromPayload

  const msg = asRecord(rawBody.message)
  const mc = asRecord(msg?.call)
  const mca = asRecord(mc?.assistant)
  if (mca) {
    const id = typeof mca.id === 'string' ? mca.id.trim() : ''
    if (id && UUID_RE.test(id)) return id
  }
  const ma = asRecord(msg?.assistant)
  if (ma) {
    const id = typeof ma.id === 'string' ? ma.id.trim() : ''
    if (id && UUID_RE.test(id)) return id
  }
  const fc = asRecord(flat.call)
  const fca = asRecord(fc?.assistant)
  if (fca) {
    const id = typeof fca.id === 'string' ? fca.id.trim() : ''
    if (id && UUID_RE.test(id)) return id
  }
  return null
}

export async function resolveOrganizationIdForVapiTools(input: {
  args: JsonRecord
  flat: JsonRecord
  rawBody: JsonRecord
  request: NextRequest | null
  toolCallId: string
  logPrefix?: string
}): Promise<{
  organizationId: string | null
  orgSource: JobStatusOrgSource
  assistantIdDetected: string | null
  mappingDetail: string | null
}> {
  const { args, flat, rawBody, request, toolCallId } = input
  const logPrefix = input.logPrefix ?? '[vapi/org-resolve]'

  let raw = typeof args.organization_id === 'string' ? args.organization_id.trim() : ''
  if (raw && !UUID_RE.test(raw)) {
    console.warn(`${logPrefix} invalid_organization_id_arg_ignored`, {
      toolCallId,
      preview: raw.slice(0, 24),
    })
    raw = ''
  }
  if (raw) {
    return {
      organizationId: raw,
      orgSource: 'args',
      assistantIdDetected: detectAssistantId(flat, rawBody),
      mappingDetail: null,
    }
  }

  const assistantIdDetected = detectAssistantId(flat, rawBody)

  if (request) {
    const q =
      request.nextUrl.searchParams.get('organization_id')?.trim() ||
      request.nextUrl.searchParams.get('org')?.trim()
    if (q && UUID_RE.test(q)) {
      return {
        organizationId: q,
        orgSource: 'query',
        assistantIdDetected,
        mappingDetail: null,
      }
    }
  }

  for (const url of collectAssistantServerUrlCandidates(flat, rawBody)) {
    const oid = extractOrgIdFromUrlString(url)
    if (oid) {
      return {
        organizationId: oid,
        orgSource: 'assistant_server_url',
        assistantIdDetected,
        mappingDetail: url.length > 180 ? `${url.slice(0, 180)}…` : url,
      }
    }
  }

  if (assistantIdDetected) {
    const fromDb = await lookupOrganizationIdByVapiAssistantId(assistantIdDetected, logPrefix)
    if (fromDb) {
      return {
        organizationId: fromDb,
        orgSource: 'assistant_mapping',
        assistantIdDetected,
        mappingDetail: 'supabase_vapi_assistant_id',
      }
    }
    const known = parseVapiAssistantOrgMappingFromEnv()[assistantIdDetected]
    if (known && UUID_RE.test(known)) {
      return {
        organizationId: known,
        orgSource: 'assistant_mapping',
        assistantIdDetected,
        mappingDetail: 'known_assistant_org_pair',
      }
    }
  }

  const fromEnv = defaultOrgIdFromEnvForVapiTools()
  if (fromEnv && UUID_RE.test(fromEnv)) {
    return {
      organizationId: fromEnv,
      orgSource: 'env',
      assistantIdDetected,
      mappingDetail: null,
    }
  }
  if (fromEnv) {
    console.error(`${logPrefix} invalid_default_org_env`, {
      preview: fromEnv.slice(0, 24),
    })
  }

  console.error(`${logPrefix} missing_organization_id`, {
    toolCallId,
    assistantIdDetected,
  })
  return {
    organizationId: null,
    orgSource: 'missing',
    assistantIdDetected,
    mappingDetail: null,
  }
}
