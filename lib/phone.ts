/**
 * Normalize phone for storage and lookup: strip spaces/symbols, E.164-style.
 * US: 10 digits -> +1XXXXXXXXXX
 */
export function normalizePhone(input: string): string {
  const trimmed = (input || '').trim()
  if (!trimmed) return ''

  let digits = trimmed.replace(/[^\d]/g, '')

  if (trimmed.startsWith('+')) {
    const rest = trimmed.slice(1).replace(/\D/g, '')
    return rest ? `+${rest}` : ''
  }

  if (digits.length === 10) {
    return `+1${digits}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }
  if (digits.length > 0) {
    return `+${digits}`
  }

  return ''
}
