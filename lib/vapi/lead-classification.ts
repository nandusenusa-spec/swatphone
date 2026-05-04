/**
 * Clasificación comercial para leads/follow-ups desde Vapi (SWAT-VoiceIA).
 * Los metadatos van en `notes` cuando la tabla no tiene columnas dedicadas.
 */

export const SWAT_COMMERCIAL_BLOCK_START = '[swat_commercial]'
export const SWAT_COMMERCIAL_BLOCK_END = '[/swat_commercial]'

/** Parsea el bloque `[swat_commercial]` en campos para tabla/dashboard. */
export function parseCommercialFieldsFromNotes(notes: string | null | undefined): Partial<LeadCommercialFields> | null {
  if (!notes || typeof notes !== 'string') return null
  const start = notes.indexOf(SWAT_COMMERCIAL_BLOCK_START)
  const end = notes.indexOf(SWAT_COMMERCIAL_BLOCK_END)
  if (start === -1 || end === -1 || end <= start) return null
  const inner = notes.slice(start + SWAT_COMMERCIAL_BLOCK_START.length, end).trim()
  if (!inner) return null
  const out: Partial<LeadCommercialFields> = {}
  for (const line of inner.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (t === 'callback_required=true') {
      out.callback_required = true
      continue
    }
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim().toLowerCase()
    const val = t.slice(eq + 1).trim()
    if (key === 'category') out.category = val
    else if (key === 'intent') out.intent = val
    else if (key === 'priority') out.priority = val
    else if (key === 'estimated_value_level') out.estimated_value_level = val
    else if (key === 'summary') out.summary = val
    else if (key === 'next_action') out.next_action = val
    else if (key === 'source') out.source = val
  }
  return Object.keys(out).length ? out : null
}

/** Score 0–100 para UI cuando la columna score sigue en 0 pero hay clasificación en notas. */
export function scoreHintFromCommercial(c: Partial<LeadCommercialFields> | null | undefined): number {
  if (!c?.priority && !c?.category) return 0
  if (c.category === 'wrap' || c.priority === 'urgent') return 88
  if (c.priority === 'high') return 72
  if (c.priority === 'normal') return 48
  if (c.priority === 'low') return 28
  return 40
}

/** Extrae líneas clave del bloque comercial para mostrar en UI (sin el bloque completo). */
export function extractSwatCommercialPreview(notes: string | null | undefined): string | null {
  if (!notes || typeof notes !== 'string') return null
  const start = notes.indexOf(SWAT_COMMERCIAL_BLOCK_START)
  const end = notes.indexOf(SWAT_COMMERCIAL_BLOCK_END)
  if (start === -1 || end === -1 || end <= start) return null
  const inner = notes.slice(start + SWAT_COMMERCIAL_BLOCK_START.length, end).trim()
  if (!inner) return null
  const pick = ['category', 'priority', 'callback_required', 'intent']
  const lines = inner.split('\n').map((l) => l.trim())
  const out = lines.filter((l) => pick.some((p) => l.toLowerCase().startsWith(`${p}=`)))
  return out.length ? out.join(' · ') : inner.split('\n').slice(0, 4).join(' · ')
}

/** Frases y palabras que indican wrap / rotulación vehicular. */
const WRAP_PHRASES = [
  'wrap',
  'wrapp',
  'vehicle wrap',
  'car wrap',
  'vinyl wrap',
  'full wrap',
  'partial wrap',
  'wrap vehicular',
  'rotulación vehicular',
  'rotulacion vehicular',
  'vinilo para carro',
  'vinilo vehicular',
  'gráfica vehicular',
  'grafica vehicular',
  'lettering vehicular',
  'fleet graphics',
  'rotulación',
  'rotulacion',
]

/** True si el texto sugiere wrap; incluye "rap" típico de STT cuando hay contexto vehicular. */
export function detectWrapIntent(text: string): boolean {
  const lower = text.toLowerCase()
  for (const phrase of WRAP_PHRASES) {
    if (lower.includes(phrase)) return true
  }
  if (/\bwrap\b/i.test(text)) return true
  if (/\bwrapp\b/i.test(text)) return true
  if (/\brap\b/i.test(lower)) {
    if (
      /vehicul|rotul|vinil|fleet|graf|coche|auto|carro|truck|van|flota|cotiz|presup|lettering|full\s*wrap|partial/i.test(
        lower,
      )
    ) {
      return true
    }
  }
  return false
}

export type LeadCommercialFields = {
  category: string
  intent: string
  priority: string
  estimated_value_level: string
  summary: string
  next_action: string
  source: string
  callback_required: boolean
}

const WRAP_DEFAULTS: LeadCommercialFields = {
  category: 'wrap',
  intent: 'quote_request',
  priority: 'high',
  estimated_value_level: 'high',
  summary: 'Cliente solicita cotización para wrap vehicular.',
  next_action:
    'Llamar cuanto antes para pedir detalles del vehículo y alcance del wrap.',
  source: 'vapi_call',
  callback_required: true,
}

function normStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t || undefined
}

/** Une need/motivo/notas para detección heurística. */
export function classificationSourceText(parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join('\n').trim()
}

/**
 * Aplica defaults de wrap si el texto lo amerita y el modelo no fijó category=wrap.
 */
export function mergeWrapHeuristic(
  combinedNeedNotes: string,
  partial: Partial<LeadCommercialFields>,
): Partial<LeadCommercialFields> {
  if (!detectWrapIntent(combinedNeedNotes)) return partial
  if (partial.category === 'wrap') return partial
  return {
    ...partial,
    ...WRAP_DEFAULTS,
    summary: partial.summary || WRAP_DEFAULTS.summary,
    next_action: partial.next_action || WRAP_DEFAULTS.next_action,
  }
}

export function parseModelLeadClassification(args: Record<string, unknown>): Partial<LeadCommercialFields> {
  return {
    category: normStr(args.category),
    intent: normStr(args.intent),
    priority: normStr(args.priority),
    estimated_value_level: normStr(args.estimated_value_level),
    summary: normStr(args.summary),
    next_action: normStr(args.next_action),
    source: normStr(args.source) || 'vapi_call',
    callback_required:
      args.callback_required === true ||
      (typeof args.callback_required === 'string' && args.callback_required === 'true'),
  }
}

export function buildCommercialMetaBlock(fields: Partial<LeadCommercialFields>): string {
  const rows: string[] = []
  const f = fields
  if (f.source) rows.push(`source=${f.source}`)
  if (f.category) rows.push(`category=${f.category}`)
  if (f.intent) rows.push(`intent=${f.intent}`)
  if (f.priority) rows.push(`priority=${f.priority}`)
  if (f.estimated_value_level) rows.push(`estimated_value_level=${f.estimated_value_level}`)
  if (f.summary) rows.push(`summary=${f.summary.replace(/\n/g, ' ').slice(0, 500)}`)
  if (f.next_action) rows.push(`next_action=${f.next_action.replace(/\n/g, ' ').slice(0, 500)}`)
  if (f.callback_required) rows.push('callback_required=true')
  if (!rows.length) return ''
  return `${SWAT_COMMERCIAL_BLOCK_START}\n${rows.join('\n')}\n${SWAT_COMMERCIAL_BLOCK_END}\n\n`
}

export function prependCommercialBlockToNotes(
  block: string,
  freeformNotes: string | undefined,
): string {
  const tail = (freeformNotes || '').trim()
  if (!block.trim()) return tail
  if (!tail) return block.trim()
  return `${block.trim()}\n${tail}`
}

/** ISO-8601: fin del día civil UTC de mañana (aprox.) para due_at de wrap. */
export function defaultFollowUpDueIsoTomorrow(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(23, 59, 0, 0)
  return d.toISOString()
}
