import { timingSafeEqual } from 'crypto'

export function verifyXAdminSecret(request: Request): boolean {
  const expected = process.env.ADMIN_SECRET?.trim()
  if (!expected) return false
  const got = request.headers.get('x-admin-secret')
  if (!got) return false
  const a = Buffer.from(got, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function adminMigrationsAllowed(): boolean {
  return process.env.ALLOW_ADMIN_MIGRATIONS === 'true'
}
