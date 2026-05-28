const MAX_CLIENT_SPEECH_NOTES = 1200

/** Anexa preferencias del dueño al prompt; no sustituye reglas operativas de Admin. */
export function appendClientSpeechNotesToPrompt(
  prompt: string,
  notes: string | null | undefined,
): string {
  const t = (notes || '').trim()
  if (!t) return prompt
  const safe = t.length > MAX_CLIENT_SPEECH_NOTES ? t.slice(0, MAX_CLIENT_SPEECH_NOTES) : t
  return `${prompt}\n\nPreferencias del negocio (dueño del local; tono y estilo, sin contradecir reglas operativas):\n${safe}`
}

export const CLIENT_WELCOME_MESSAGE_MAX = 90

export function normalizeClientWelcomeMessage(raw: string): string {
  return raw.trim().slice(0, CLIENT_WELCOME_MESSAGE_MAX)
}
