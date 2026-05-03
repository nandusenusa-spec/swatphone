/**
 * Normaliza consultas de voz tipo "500 business cards" → núcleo buscable.
 */
export function normalizeVoiceProductQuery(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ')
  // "500 business cards", "1,000 postcards"
  s = s.replace(/^\d{1,8}(\s*,\s*\d{1,8})?\s+/, '')
  // "500 x 2" raro; "500x business" → quitar cantidad inicial
  s = s.replace(/^\d{1,8}\s*([xX×]\s*\d{1,4})?\s+/, '')
  s = s.replace(/^\d{1,8}\s*[-–]\s*/, '')
  return s.trim()
}

/**
 * Expande términos coloquiales o abreviaturas para buscar en catálogo (products / organization_catalog / price_catalog).
 * Orden: el caller prueba términos en el orden devuelto (normalizado primero).
 */
export function expandPriceLookupTerms(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  const normalized = normalizeVoiceProductQuery(trimmed)
  const out: string[] = []
  const add = (s: string) => {
    const x = s.trim().replace(/\s+/g, ' ')
    if (x && !out.includes(x)) out.push(x)
  }

  const compact = normalized.replace(/\s+/g, ' ').trim()
  const lower = compact.toLowerCase()
  const lowerRaw = trimmed.toLowerCase()

  add(compact)
  if (trimmed !== compact) add(trimmed)

  // BC / B.C. (solo o dentro de frase: "precio para BC", "500 BC")
  if (
    /^b\.?\s*c\.?$/i.test(compact) ||
    lower === 'bc' ||
    lower === 'b c' ||
    /\bbc\b/i.test(trimmed) ||
    /\bbc\b/i.test(compact)
  ) {
    add('business cards')
    add('business card')
    add('tarjetas de presentación')
    add('tarjeta de presentación')
  }

  // business card(s) → también términos ES usados en admin (nombre/categoría)
  if (/\bbusiness\s+cards?\b/i.test(trimmed) || /\bbusiness\s+cards?\b/i.test(compact)) {
    add('business cards')
    add('business card')
    add('tarjetas de presentación')
    add('tarjeta de presentación')
    add('tarjetas de visita')
    add('tarjeta de visita')
  }

  // singular → plural
  if (/\bbusiness\s+card\b/i.test(compact) && !/\bbusiness\s+cards\b/i.test(compact)) {
    add('business cards')
  }

  // "cards" en contexto de impresión (evitar "postcards" si aparece solo "cards" con business ya cubierto)
  if (/\bcards\b/i.test(lowerRaw) && /\bbusiness\b/i.test(lowerRaw)) {
    add('business cards')
  }
  if (lower === 'cards' || lower === 'card') {
    add('business cards')
    add('tarjetas de presentación')
  }

  // Tarjetas (ES)
  if (/\btarjetas\s+personales\b/i.test(trimmed) || /\btarjetas\s+personales\b/i.test(compact)) {
    add('tarjetas de presentación')
    add('tarjeta de presentación')
    add('tarjetas')
    add('business cards')
  }
  if (/\btarjetas\s+de\s+presentaci[oó]n\b/i.test(trimmed) || /\btarjetas\s+de\s+presentaci[oó]n\b/i.test(compact)) {
    add('tarjetas de presentación')
    add('business cards')
  }

  return out
}
