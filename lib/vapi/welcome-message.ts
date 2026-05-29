/** Máximo recomendado para firstMessage en Vapi y saludo dinámico en assistant-request. */
export const WELCOME_MESSAGE_MAX = 90

export function resolveWelcomeMessageForCall(
  raw: string | null | undefined,
  fallback: string,
): string {
  const t = (raw || '').trim()
  const fb = (fallback || '').trim()
  if (t && t.length <= WELCOME_MESSAGE_MAX) return t
  if (t && t.length > WELCOME_MESSAGE_MAX) return t.slice(0, WELCOME_MESSAGE_MAX)
  if (fb && fb.length <= WELCOME_MESSAGE_MAX) return fb
  if (fb) return fb.slice(0, WELCOME_MESSAGE_MAX)
  return 'Hola, gracias por llamar. ¿En qué puedo ayudarte?'
}

export function defaultWelcomeForOrganization(orgName: string): string {
  const name = (orgName || '').trim() || 'nosotros'
  return resolveWelcomeMessageForCall(
    null,
    `Hola, gracias por llamar a ${name}. ¿En qué puedo ayudarte hoy?`,
  )
}
