/**
 * Resolución de voz para Vapi (sync, webhook assistant-request, dispatcher).
 *
 * Variables de entorno:
 * - `VAPI_FORCE_OPENAI_VOICE_ID` — fuerza voiceId (p. ej. shimmer); `source: forced_env`.
 * - `VAPI_FORCE_OPENAI_VOICE_PROVIDER` — default `openai` si usás force.
 * - `VAPI_VOICE_IGNORE_ADMIN_ORG_IDS` — UUIDs de org (coma/espacio): ignoran voice_id de admin y usan fallback.
 * - `VAPI_OPENAI_VOICE_FALLBACK` — default `shimmer` si no hay admin o está bloqueada.
 * - `VAPI_BLOCKED_OPENAI_VOICE_IDS` — lista propia; si no se define, se bloquean alloy, echo, onyx, fable.
 * - `VAPI_TRANSCRIBER_LANGUAGE` — default `multi`; para SWATWORKS probá `es`.
 * - `VAPI_TRANSCRIBER_MODEL` — default `nova-2`.
 *
 * ElevenLabs/Cartesia: requieren `voice.provider` distinto y payload distinto en PATCH; no incluido aquí.
 */
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { openAiVoiceIdForLlmPipeline } from '@/lib/vapi/openai-voice-for-pipeline'

/** Voz OpenAI por defecto para pipeline Anthropic (femenina clara). */
export const DEFAULT_OPENAI_FEMININE_VOICE =
  process.env.VAPI_OPENAI_VOICE_FALLBACK?.trim() || 'shimmer'

export type VoiceResolutionSource =
  | 'admin'
  | 'fallback'
  | 'forced_env'
  | 'ignored_org_fallback'
  | 'blocked_voice_fallback'

export type ResolvedVoiceForVapi = {
  voiceProvider: string
  voiceId: string
  source: VoiceResolutionSource
  /** voice_id crudo en assistant_configs (si existía). */
  assistantConfigVoiceId: string | null
  /** voice_id en organization_ai_config. */
  organizationAiVoiceId: string | null
  /** De qué fila salió el id de admin usado antes de blocklist (si aplica). */
  adminSource: 'assistant_configs' | 'organization_ai_config' | null
}

function parseCsvLowerSet(raw: string | undefined): Set<string> {
  const s = new Set<string>()
  if (!raw?.trim()) return s
  for (const p of raw.split(/[\s,]+/)) {
    const t = p.trim().toLowerCase()
    if (t) s.add(t)
  }
  return s
}

function defaultBlockedOpenAiVoices(): Set<string> {
  const env = process.env.VAPI_BLOCKED_OPENAI_VOICE_IDS?.trim()
  if (env) return parseCsvLowerSet(env)
  // Por defecto sustituir voces típicamente masculinas o muy neutras; extendé con VAPI_BLOCKED_OPENAI_VOICE_IDS.
  return new Set(['alloy', 'echo', 'onyx', 'fable'])
}

function ignoreAdminForOrg(organizationId: string): boolean {
  const ids = parseCsvLowerSet(process.env.VAPI_VOICE_IGNORE_ADMIN_ORG_IDS)
  return ids.has(organizationId.trim().toLowerCase())
}

function normalizeVoiceId(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

/**
 * Resuelve voz OpenAI para PATCH/sync u offline, sin leer DB.
 * Orden: VAPI_FORCE_OPENAI_VOICE_ID → ignorar admin por org → blocklist → admin → fallback.
 */
export function resolveOpenAiVoiceForSync(input: {
  organizationId: string
  assistantConfigVoiceId: string | null | undefined
  organizationAiVoiceId: string | null | undefined
}): ResolvedVoiceForVapi {
  const orgId = (input.organizationId || '').trim()
  const forced = process.env.VAPI_FORCE_OPENAI_VOICE_ID?.trim()
  if (forced) {
    const vid = openAiVoiceIdForLlmPipeline(forced, DEFAULT_OPENAI_FEMININE_VOICE)
    return {
      voiceProvider: process.env.VAPI_FORCE_OPENAI_VOICE_PROVIDER?.trim() || 'openai',
      voiceId: vid,
      source: 'forced_env',
      assistantConfigVoiceId: normalizeVoiceId(input.assistantConfigVoiceId),
      organizationAiVoiceId: normalizeVoiceId(input.organizationAiVoiceId),
      adminSource: null,
    }
  }

  const ac = normalizeVoiceId(input.assistantConfigVoiceId)
  const oai = normalizeVoiceId(input.organizationAiVoiceId)
  const adminSource: 'assistant_configs' | 'organization_ai_config' | null = ac
    ? 'assistant_configs'
    : oai
      ? 'organization_ai_config'
      : null
  let rawAdmin = ac || oai || null

  if (orgId && ignoreAdminForOrg(orgId)) {
    const vid = openAiVoiceIdForLlmPipeline(null, DEFAULT_OPENAI_FEMININE_VOICE)
    return {
      voiceProvider: 'openai',
      voiceId: vid,
      source: 'ignored_org_fallback',
      assistantConfigVoiceId: ac,
      organizationAiVoiceId: oai,
      adminSource,
    }
  }

  const blocklist = defaultBlockedOpenAiVoices()
  if (rawAdmin && blocklist.has(rawAdmin.toLowerCase())) {
    const vid = openAiVoiceIdForLlmPipeline(null, DEFAULT_OPENAI_FEMININE_VOICE)
    return {
      voiceProvider: 'openai',
      voiceId: vid,
      source: 'blocked_voice_fallback',
      assistantConfigVoiceId: ac,
      organizationAiVoiceId: oai,
      adminSource,
    }
  }

  if (rawAdmin) {
    return {
      voiceProvider: 'openai',
      voiceId: openAiVoiceIdForLlmPipeline(rawAdmin, DEFAULT_OPENAI_FEMININE_VOICE),
      source: 'admin',
      assistantConfigVoiceId: ac,
      organizationAiVoiceId: oai,
      adminSource,
    }
  }

  return {
    voiceProvider: 'openai',
    voiceId: openAiVoiceIdForLlmPipeline(null, DEFAULT_OPENAI_FEMININE_VOICE),
    source: 'fallback',
    assistantConfigVoiceId: null,
    organizationAiVoiceId: null,
    adminSource: null,
  }
}

export async function resolveOpenAiVoiceForOrganization(
  organizationId: string,
): Promise<ResolvedVoiceForVapi> {
  const supabase = createServiceRoleClient()
  let { data: activeCfg, error: activeErr } = await supabase
    .from('assistant_configs')
    .select('voice_id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (activeErr && activeErr.code !== 'PGRST116' && activeErr.code !== 'PGRST205') {
    console.warn('[voice-for-vapi] assistant_configs active read', activeErr.message)
  }
  let acVoice = normalizeVoiceId(activeCfg?.voice_id)
  if (!acVoice) {
    const { data: latestCfg } = await supabase
      .from('assistant_configs')
      .select('voice_id')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    acVoice = normalizeVoiceId(latestCfg?.voice_id)
  }

  const { data: oaiRow, error: oaiErr } = await supabase
    .from('organization_ai_config')
    .select('voice_id')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (oaiErr && oaiErr.code !== 'PGRST116' && oaiErr.code !== 'PGRST205') {
    console.warn('[voice-for-vapi] organization_ai_config read', oaiErr.message)
  }
  const oaiVoice = normalizeVoiceId(oaiRow?.voice_id)

  return resolveOpenAiVoiceForSync({
    organizationId,
    assistantConfigVoiceId: acVoice,
    organizationAiVoiceId: oaiVoice,
  })
}

export function getTranscriberConfigForVapi(): {
  provider: string
  model: string
  language: string
} {
  const language = process.env.VAPI_TRANSCRIBER_LANGUAGE?.trim() || 'multi'
  const model = process.env.VAPI_TRANSCRIBER_MODEL?.trim() || 'nova-2'
  return { provider: 'deepgram', model, language }
}

/** Extrae voz persistida en respuesta GET de Vapi (camelCase / snake_case). */
export function extractVoiceFromVapiAssistantPayload(a: unknown): {
  voice_provider: string | null
  voice_id: string | null
  voice_model: string | null
  transcriber_provider: string | null
  transcriber_model: string | null
  transcriber_language: string | null
} {
  const empty = {
    voice_provider: null as string | null,
    voice_id: null as string | null,
    voice_model: null as string | null,
    transcriber_provider: null as string | null,
    transcriber_model: null as string | null,
    transcriber_language: null as string | null,
  }
  if (!a || typeof a !== 'object') return empty
  const rec = a as Record<string, unknown>
  const voice =
    rec.voice && typeof rec.voice === 'object' && !Array.isArray(rec.voice)
      ? (rec.voice as Record<string, unknown>)
      : null
  const tr =
    rec.transcriber && typeof rec.transcriber === 'object' && !Array.isArray(rec.transcriber)
      ? (rec.transcriber as Record<string, unknown>)
      : null
  const vid =
    (typeof voice?.voiceId === 'string' && voice.voiceId) ||
    (typeof voice?.voice_id === 'string' && voice.voice_id) ||
    null
  const vmodel =
    (typeof voice?.model === 'string' && voice.model) ||
    (typeof voice?.voiceModel === 'string' && voice.voiceModel) ||
    null
  return {
    voice_provider: typeof voice?.provider === 'string' ? voice.provider : null,
    voice_id: vid,
    voice_model: vmodel,
    transcriber_provider: typeof tr?.provider === 'string' ? tr.provider : null,
    transcriber_model: typeof tr?.model === 'string' ? tr.model : null,
    transcriber_language:
      typeof tr?.language === 'string'
        ? tr.language
        : typeof tr?.languageCode === 'string'
          ? tr.languageCode
          : null,
  }
}
