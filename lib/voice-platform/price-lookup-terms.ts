/**
 * Aliases BC / business cards / tarjetas (presentación, personales, visita) y SKUs "Business Cards - N".
 * Si hay cantidad en la frase, collectBusinessCardSkuAliases genera el nombre de catálogo del admin.
 */
/** True si el texto menciona BC / business cards / tarjetas de presentación (u alias), sin exigir cantidad. */
export function mentionsBusinessCardsProductFamily(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  const lower = t.toLowerCase()
  if (/\bbc\b/.test(lower)) return true
  if (/\bb\.?\s*c\.?\b/i.test(t)) return true
  if (/\bbusiness\s+cards?\b/i.test(lower)) return true
  if (/\btarjetas\s+de\s+presentaci[oó]n\b/i.test(lower)) return true
  if (/\btarjeta\s+de\s+presentaci[oó]n\b/i.test(lower)) return true
  if (/\btarjetas\s+personales\b/i.test(lower)) return true
  if (/\btarjetas\s+de\s+visita\b/i.test(lower)) return true
  if (/\btarjeta\s+de\s+visita\b/i.test(lower)) return true
  return false
}

/** True si hay cantidad explícita tipo BC 500 / 1000 business cards → SKU Business Cards - N */
export function hasBusinessCardsSkuQuantityInQuery(raw: string): boolean {
  return (
    collectBusinessCardSkuAliases(raw).length > 0 ||
    collectBusinessCardSkuAliases(normalizeVoiceProductQuery(raw)).length > 0
  )
}

export function detectedBusinessCardsQuantityFromInput(raw: string): number | null {
  for (const sku of collectBusinessCardSkuAliases(raw)) {
    const m = sku.match(/-\s*(\d+)\s*$/i)
    if (m) return parseInt(m[1], 10)
  }
  for (const sku of collectBusinessCardSkuAliases(normalizeVoiceProductQuery(raw))) {
    const m = sku.match(/-\s*(\d+)\s*$/i)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

export function collectBusinessCardSkuAliases(raw: string): string[] {
  const t = raw.trim()
  if (!t) return []
  const patterns: RegExp[] = [
    /\bbc\s+(\d{2,5})\b/i,
    /\bbc\s*(\d{2,5})\b/i,
    /\b(\d{2,5})\s+bc\b/i,
    /\bbusiness\s+cards?\s+(\d{2,5})\b/i,
    /\b(\d{2,5})\s+business\s+cards?\b/i,
    /\btarjetas\s+de\s+presentaci[oó]n\s+(\d{2,5})\b/i,
    /\b(\d{2,5})\s+tarjetas\s+de\s+presentaci[oó]n\b/i,
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const re of patterns) {
    const m = t.match(re)
    if (m?.[1]) {
      const sku = `Business Cards - ${m[1]}`
      if (!seen.has(sku)) {
        seen.add(sku)
        out.push(sku)
      }
    }
  }
  return out
}

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

  // Primero: SKU admin típico "Business Cards - 500" (BC 500, 500 business cards, etc.)
  for (const sku of collectBusinessCardSkuAliases(trimmed)) {
    add(sku)
  }
  for (const sku of collectBusinessCardSkuAliases(compact)) {
    add(sku)
  }

  // Familia BC sin cantidad: priorizar nombre de catálogo antes que "bc" suelto (ilike %bc% demasiado amplio)
  if (mentionsBusinessCardsProductFamily(trimmed) && !hasBusinessCardsSkuQuantityInQuery(trimmed)) {
    add('Business Cards')
    add('business cards')
    add('tarjetas de presentación')
    add('tarjeta de presentación')
  }

  // No usar solo "bc" / "b c" como término de búsqueda aislado
  const skipBareBc =
    (lower === 'bc' || lower === 'b c' || /^b\.?\s*c\.?$/i.test(compact)) &&
    !hasBusinessCardsSkuQuantityInQuery(trimmed)

  if (!skipBareBc) {
    add(compact)
    if (trimmed !== compact) add(trimmed)
  }

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
