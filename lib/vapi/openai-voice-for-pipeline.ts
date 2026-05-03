/**
 * Vapi: some OpenAI voices (e.g. coral) are only valid with realtime models.
 * Our stack uses Anthropic Claude + standard pipeline — use classic TTS voices instead.
 */
const OPENAI_REALTIME_ONLY_VOICE_IDS = new Set(['coral'])

export function openAiVoiceIdForLlmPipeline(
  requested: string | null | undefined,
  fallback: string = 'alloy',
): string {
  const raw = typeof requested === 'string' ? requested.trim() : ''
  if (!raw) return fallback
  const key = raw.toLowerCase()
  if (OPENAI_REALTIME_ONLY_VOICE_IDS.has(key)) return fallback
  return raw
}
