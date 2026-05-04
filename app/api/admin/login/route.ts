import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { NextResponse } from 'next/server'
import { compare as bcryptCompare } from 'bcryptjs'
import { createHmac } from 'crypto'

type LoginAttemptState = {
  count: number
  firstAttemptAt: number
  blockedUntil: number | null
}

const LOGIN_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_BLOCK_MS = 15 * 60 * 1000 // 15 minutes
const loginAttempts = new Map<string, LoginAttemptState>()

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  const ip = xff.split(',')[0]?.trim()
  if (ip) return ip
  return req.headers.get('x-real-ip') || 'unknown'
}

function getRateKey(req: Request, username: string): string {
  return `${username.trim().toLowerCase()}|${getClientIp(req)}`
}

function cleanOldLoginAttempts(now: number): void {
  for (const [key, st] of loginAttempts.entries()) {
    const expiredWindow = now - st.firstAttemptAt > LOGIN_WINDOW_MS && !st.blockedUntil
    const expiredBlock = !!st.blockedUntil && now > st.blockedUntil + LOGIN_WINDOW_MS
    if (expiredWindow || expiredBlock) loginAttempts.delete(key)
  }
}

function blockedResponse(seconds: number) {
  return NextResponse.json(
    { error: `Too many failed attempts. Try again in ${Math.max(1, seconds)}s.` },
    { status: 429 },
  )
}

function checkRateLimit(req: Request, username: string): NextResponse | null {
  const now = Date.now()
  cleanOldLoginAttempts(now)
  const key = getRateKey(req, username)
  const st = loginAttempts.get(key)
  if (!st?.blockedUntil) return null
  if (now > st.blockedUntil) {
    loginAttempts.delete(key)
    return null
  }
  const secs = Math.ceil((st.blockedUntil - now) / 1000)
  return blockedResponse(secs)
}

function registerFailedAttempt(req: Request, username: string): NextResponse | null {
  const now = Date.now()
  const key = getRateKey(req, username)
  const prev = loginAttempts.get(key)
  const withinWindow = !!prev && now - prev.firstAttemptAt <= LOGIN_WINDOW_MS
  const count = withinWindow ? prev.count + 1 : 1
  const firstAttemptAt = withinWindow && prev ? prev.firstAttemptAt : now
  const blockedUntil = count >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_BLOCK_MS : null
  loginAttempts.set(key, { count, firstAttemptAt, blockedUntil })
  if (!blockedUntil) return null
  const secs = Math.ceil((blockedUntil - now) / 1000)
  return blockedResponse(secs)
}

function clearFailedAttempts(req: Request, username: string): void {
  loginAttempts.delete(getRateKey(req, username))
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function signAdminPayload(payload: string): string {
  const secret = process.env.ADMIN_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('Missing ADMIN_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    const maybeBlocked = checkRateLimit(req, username)
    if (maybeBlocked) return maybeBlocked

    const supabase = createServiceRoleClient()

    // Verify admin credentials
    const { data: admin, error } = await supabase
      .from('admin_credentials')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .single()

    if (error || !admin) {
      const maybeBlockedNow = registerFailedAttempt(req, username)
      if (maybeBlockedNow) return maybeBlockedNow
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Prefer RPC (pgcrypto). Si PostgREST falla al invocarla, bcryptjs valida el mismo hash bcrypt ($2a$/bf).
    const { data: rpcMatch, error: rpcErr } = await supabase.rpc('verify_admin_password', {
      input_username: username,
      input_password: password,
    })

    let passwordMatch = Boolean(rpcMatch)
    if (rpcErr) {
      console.warn('[admin/login] verify_admin_password RPC unavailable; bcrypt fallback:', rpcErr.message)
      passwordMatch = await bcryptCompare(password, String(admin.password_hash || ''))
    }

    if (!passwordMatch) {
      const maybeBlockedNow = registerFailedAttempt(req, username)
      if (maybeBlockedNow) return maybeBlockedNow
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    clearFailedAttempts(req, username)

    // Create admin session token
    const payload = JSON.stringify(
      {
        adminId: admin.id,
        username: admin.username,
        email: admin.email,
        exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      }
    )
    const payloadEncoded = encodeBase64Url(payload)
    const signature = signAdminPayload(payloadEncoded)
    const sessionToken = `${payloadEncoded}.${signature}`

    const response = NextResponse.json(
      {
        success: true,
        token: sessionToken,
        username: admin.username,
        email: admin.email
      },
      { status: 200 },
    )

    // Cookie HttpOnly so server routes can verify admin auth.
    response.cookies.set('admin_token', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 24 * 60 * 60,
    })
    return response
  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    )
  }
}
