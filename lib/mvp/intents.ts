export type BotIntent =
  | 'consultar_estado'
  | 'consultar_entrega'
  | 'dejar_recado'
  | 'hablar_humano'
  | 'unknown'

export type IntentResolution = {
  intent: BotIntent
  attempts: number
  fallback: boolean
  needsHuman: boolean
}

const HUMAN_KEYWORDS = [
  'humano',
  'persona',
  'asesor',
  'agente',
  'operador',
  'representante',
]

const ESTADO_KEYWORDS = ['estado', 'trabajo', 'pedido', 'orden', 'como va', 'avance']
const ENTREGA_KEYWORDS = ['entrega', 'cuando', 'fecha', 'listo', 'retiro']
const RECADO_KEYWORDS = ['recado', 'mensaje', 'avisar', 'dejar nota']
const ANGRY_KEYWORDS = ['enojado', 'molesto', 'queja', 'reclamo', 'urgent', 'urgente']

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w))
}

export function detectIntent(rawText: string, attempts = 0): IntentResolution {
  const text = (rawText || '').toLowerCase().trim()
  const normalizedAttempts = Math.max(0, attempts)

  const explicitHuman = includesAny(text, HUMAN_KEYWORDS)
  const angry = includesAny(text, ANGRY_KEYWORDS)
  if (explicitHuman || angry) {
    return {
      intent: 'hablar_humano',
      attempts: normalizedAttempts,
      fallback: false,
      needsHuman: true,
    }
  }

  if (includesAny(text, ENTREGA_KEYWORDS)) {
    return {
      intent: 'consultar_entrega',
      attempts: normalizedAttempts,
      fallback: false,
      needsHuman: false,
    }
  }

  if (includesAny(text, ESTADO_KEYWORDS)) {
    return {
      intent: 'consultar_estado',
      attempts: normalizedAttempts,
      fallback: false,
      needsHuman: false,
    }
  }

  if (includesAny(text, RECADO_KEYWORDS)) {
    return {
      intent: 'dejar_recado',
      attempts: normalizedAttempts,
      fallback: false,
      needsHuman: false,
    }
  }

  const nextAttempts = normalizedAttempts + 1
  if (nextAttempts >= 2) {
    return {
      intent: 'dejar_recado',
      attempts: nextAttempts,
      fallback: true,
      needsHuman: false,
    }
  }

  return {
    intent: 'unknown',
    attempts: nextAttempts,
    fallback: false,
    needsHuman: false,
  }
}
