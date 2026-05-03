import type { NextRequest } from 'next/server'
import { timingSafeEqualUtf8 } from '@/lib/security/timing-safe'

/** Lee clave interna de X-Internal-Key o Authorization: Bearer */
export function readInternalApiKey(request: NextRequest): string {
  const rawHeader = request.headers.get('x-internal-key')?.trim()
  if (rawHeader) return rawHeader
  const auth = request.headers.get('authorization')
  const bearer = auth?.replace(/^Bearer\s+/i, '').trim()
  return bearer || ''
}

export function isValidInternalApiKey(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY?.trim()
  if (!expected) return true
  const provided = readInternalApiKey(request)
  if (!provided) return false
  return timingSafeEqualUtf8(provided, expected)
}
