import { normalizePhone } from '@/lib/phone'
import type { CallClassification, CallIntent, ValidationStatus } from '@/lib/voice-platform/types'

type ClassifyInput = {
  text?: string | null
  name?: string | null
  phone?: string | null
  reason?: string | null
  attempts?: number
  hasJobNumber?: boolean
  existingCustomer?: boolean
  explicitHumanRequest?: boolean
}

type ClassifyOutput = {
  intent: CallIntent
  classification: CallClassification
  validationStatus: ValidationStatus
  spamScore: number
  urgent: boolean
  transferCandidate: boolean
}

const INTENT_MAP: Array<{ intent: CallIntent; words: string[] }> = [
  { intent: 'estado_trabajo', words: ['estado', 'trabajo', 'pedido', 'orden'] },
  { intent: 'entrega', words: ['entrega', 'fecha', 'listo', 'retiro'] },
  { intent: 'precio', words: ['precio', 'cotizacion', 'cuanto', 'coste', 'costo'] },
  { intent: 'cita', words: ['cita', 'turno', 'agendar', 'agenda'] },
  { intent: 'nueva_orden', words: ['nueva orden', 'nuevo trabajo', 'encargar'] },
  { intent: 'hablar_con_humano', words: ['humano', 'persona', 'ramon', 'agente'] },
  { intent: 'reclamo', words: ['reclamo', 'queja', 'molesto', 'enojado'] },
]

const SPAM_WORDS = ['promocion', 'oferta bancaria', 'gana dinero', 'crypto', 'casino', 'inversion']

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w))
}

export function classifyCall(input: ClassifyInput): ClassifyOutput {
  const text = `${input.text || ''} ${input.reason || ''}`.toLowerCase().trim()
  const attempts = Math.max(0, input.attempts || 0)
  const phone = normalizePhone(input.phone || '')
  const hasName = !!(input.name || '').trim()
  const hasPhone = !!phone
  const hasReason = text.length >= 4

  let intent: CallIntent = 'unknown'
  for (const rule of INTENT_MAP) {
    if (hasAny(text, rule.words)) {
      intent = rule.intent
      break
    }
  }

  const urgent = intent === 'reclamo' || text.includes('urgente') || text.includes('urgencia')
  const explicitHuman = input.explicitHumanRequest === true || intent === 'hablar_con_humano'

  let spamScore = 0
  if (!hasReason) spamScore += 35
  if (!hasPhone) spamScore += 20
  if (!hasName) spamScore += 10
  if (hasAny(text, SPAM_WORDS)) spamScore += 45
  if (text.length > 0 && text.length < 3) spamScore += 25
  if (attempts >= 2 && (!hasReason || intent === 'unknown')) spamScore += 35
  if (text === '') spamScore += 40
  spamScore = Math.min(100, spamScore)

  let validationStatus: ValidationStatus = 'validated'
  if (!hasPhone || !hasReason) validationStatus = 'pending'
  if (attempts >= 2 && (intent === 'unknown' || spamScore >= 70)) {
    validationStatus = 'spam_or_invalid'
  } else if (spamScore >= 70) {
    validationStatus = 'invalid'
  }

  let classification: CallClassification = 'lead'
  if (validationStatus === 'spam_or_invalid' || spamScore >= 80) classification = 'spam'
  else if (intent === 'unknown' && attempts >= 2) classification = 'invalid'
  else if (input.existingCustomer && input.hasJobNumber) classification = 'existing_job'
  else if (urgent) classification = 'urgent'
  else if (input.existingCustomer) classification = 'trusted_customer'

  const transferCandidate =
    explicitHuman ||
    urgent ||
    classification === 'urgent' ||
    (classification === 'lead' && text.includes('hablar con ventas'))

  if (transferCandidate && classification !== 'spam' && classification !== 'invalid') {
    classification = 'transfer_candidate'
  }

  return {
    intent,
    classification,
    validationStatus,
    spamScore,
    urgent,
    transferCandidate,
  }
}
