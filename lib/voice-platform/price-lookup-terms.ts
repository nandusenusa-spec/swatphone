/**
 * Expande términos coloquiales o abreviaturas para buscar en catálogo (products / organization_catalog / price_catalog).
 * Orden: se prueba el término original primero en el caller; luego sinónimos.
 */
export function expandPriceLookupTerms(raw: string): string[] {
  const t = raw.trim()
  if (!t) return []

  const out: string[] = []
  const add = (s: string) => {
    const x = s.trim()
    if (x && !out.includes(x)) out.push(x)
  }

  add(t)

  const compact = t.replace(/\s+/g, ' ').trim()
  const lower = compact.toLowerCase()

  // BC / B.C. → business cards / tarjetas
  if (/^b\.?\s*c\.?$/i.test(compact) || lower === 'bc' || lower === 'b c') {
    add('business cards')
    add('business card')
    add('tarjetas de presentación')
    add('tarjeta de presentación')
    add('tarjetas')
    add('tarjeta')
  }

  return out
}
