import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
]

export type GoogleCalendarConnection = {
  id: string
  organization_id: string
  provider: 'google'
  calendar_id: string | null
  calendar_name: string | null
  refresh_token_encrypted: string
  access_token_encrypted: string | null
  token_expiry: string | null
  timezone: string | null
  is_active: boolean
}

type GoogleTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

type GoogleCalendarListEntry = {
  id: string
  summary?: string
  primary?: boolean
  accessRole?: string
  timeZone?: string
}

export type GoogleCalendarStatus = {
  connected: boolean
  calendarId: string | null
  calendarName: string | null
  timezone: string | null
}

function appUrlFromRequest(requestUrl?: string | null): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (requestUrl) {
    const url = new URL(requestUrl)
    return url.origin
  }
  return ''
}

export function googleRedirectUri(requestUrl?: string | null): string {
  return (
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${appUrlFromRequest(requestUrl)}/api/integrations/google-calendar/callback`
  )
}

function requireGoogleOAuthConfig(requestUrl?: string | null) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  const redirectUri = googleRedirectUri(requestUrl)
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('google_oauth_not_configured')
  }
  return { clientId, clientSecret, redirectUri }
}

function encryptionKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) throw new Error('google_token_encryption_key_missing')
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  try {
    const decoded = Buffer.from(raw, 'base64')
    if (decoded.length === 32) return decoded
  } catch {}
  return crypto.createHash('sha256').update(raw).digest()
}

export function encryptToken(value: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':')
}

export function decryptToken(value: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(':')
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('unsupported_encrypted_token')
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivRaw, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function buildGoogleCalendarAuthUrl(input: {
  organizationId: string
  state: string
  requestUrl?: string | null
}) {
  const { clientId, redirectUri } = requireGoogleOAuthConfig(input.requestUrl)
  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', input.state)
  url.searchParams.set('include_granted_scopes', 'true')
  return url.toString()
}

async function googleTokenRequest(body: Record<string, string>, requestUrl?: string | null) {
  const { clientId, clientSecret, redirectUri } = requireGoogleOAuthConfig(requestUrl)
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    ...body,
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `google_token_${res.status}`)
  }
  return json
}

export async function exchangeGoogleCalendarCode(code: string, requestUrl?: string | null) {
  return googleTokenRequest(
    {
      code,
      grant_type: 'authorization_code',
    },
    requestUrl,
  )
}

async function refreshGoogleAccessToken(connection: GoogleCalendarConnection) {
  const token = await googleTokenRequest({
    refresh_token: decryptToken(connection.refresh_token_encrypted),
    grant_type: 'refresh_token',
  })
  if (!token.access_token) throw new Error('google_refresh_missing_access_token')
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString()
  const supabase = createServiceRoleClient()
  await supabase
    .from('organization_calendar_connections')
    .update({
      access_token_encrypted: encryptToken(token.access_token),
      token_expiry: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
  return { accessToken: token.access_token, expiresAt }
}

async function getValidAccessToken(connection: GoogleCalendarConnection) {
  const expiryMs = connection.token_expiry ? new Date(connection.token_expiry).getTime() : 0
  if (
    connection.access_token_encrypted &&
    expiryMs &&
    expiryMs > Date.now() + 60_000
  ) {
    return decryptToken(connection.access_token_encrypted)
  }
  return (await refreshGoogleAccessToken(connection)).accessToken
}

async function googleApi<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'error' in json
        ? JSON.stringify(json.error)
        : `google_calendar_${res.status}`
    throw new Error(message)
  }
  return json as T
}

export async function listGoogleCalendars(accessToken: string) {
  const out = await googleApi<{ items?: GoogleCalendarListEntry[] }>(
    '/users/me/calendarList',
    accessToken,
  )
  return out.items || []
}

function pickWritableCalendar(calendars: GoogleCalendarListEntry[]) {
  const writable = calendars.filter((c) => ['owner', 'writer'].includes(c.accessRole || ''))
  return writable.find((c) => c.primary) || writable[0] || calendars[0] || null
}

export async function saveGoogleCalendarConnection(input: {
  organizationId: string
  token: GoogleTokenResponse
  requestUrl?: string | null
}) {
  if (!input.token.access_token) throw new Error('google_missing_access_token')
  if (!input.token.refresh_token) throw new Error('google_missing_refresh_token')
  const calendars = await listGoogleCalendars(input.token.access_token)
  const selected = pickWritableCalendar(calendars)
  if (!selected?.id) throw new Error('google_no_writable_calendar')

  const supabase = createServiceRoleClient()
  await supabase
    .from('organization_calendar_connections')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('organization_id', input.organizationId)
    .eq('provider', 'google')
    .eq('is_active', true)

  const expiresAt = new Date(Date.now() + Number(input.token.expires_in || 3600) * 1000).toISOString()
  const { error } = await supabase.from('organization_calendar_connections').insert({
    organization_id: input.organizationId,
    provider: 'google',
    calendar_id: selected.id,
    calendar_name: selected.summary || selected.id,
    refresh_token_encrypted: encryptToken(input.token.refresh_token),
    access_token_encrypted: encryptToken(input.token.access_token),
    token_expiry: expiresAt,
    timezone: selected.timeZone || 'America/New_York',
    is_active: true,
  })
  if (error) throw error

  return {
    calendarId: selected.id,
    calendarName: selected.summary || selected.id,
    timezone: selected.timeZone || 'America/New_York',
  }
}

export async function getGoogleCalendarConnection(
  organizationId: string,
  supabase: SupabaseClient = createServiceRoleClient(),
) {
  const { data, error } = await supabase
    .from('organization_calendar_connections')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('provider', 'google')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error && error.code !== 'PGRST205') throw error
  return (data || null) as GoogleCalendarConnection | null
}

export async function getGoogleCalendarStatus(organizationId: string): Promise<GoogleCalendarStatus> {
  const connection = await getGoogleCalendarConnection(organizationId)
  return {
    connected: Boolean(connection),
    calendarId: connection?.calendar_id || null,
    calendarName: connection?.calendar_name || null,
    timezone: connection?.timezone || null,
  }
}

export async function disconnectGoogleCalendar(organizationId: string) {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('organization_calendar_connections')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('provider', 'google')
    .eq('is_active', true)
  if (error) throw error
}

export async function createGoogleCalendarEvent(input: {
  organizationId: string
  summary: string
  description?: string | null
  start: Date
  durationMinutes?: number
}) {
  const connection = await getGoogleCalendarConnection(input.organizationId)
  if (!connection?.calendar_id) {
    return { created: false as const, warning: 'calendar_not_connected' as const }
  }
  const accessToken = await getValidAccessToken(connection)
  const durationMs = Math.max(input.durationMinutes || 30, 1) * 60_000
  const end = new Date(input.start.getTime() + durationMs)
  const timezone = connection.timezone || 'America/New_York'
  const event = await googleApi<{ id?: string; htmlLink?: string }>(
    `/calendars/${encodeURIComponent(connection.calendar_id)}/events`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        summary: input.summary,
        description: input.description || undefined,
        start: { dateTime: input.start.toISOString(), timeZone: timezone },
        end: { dateTime: end.toISOString(), timeZone: timezone },
      }),
    },
  )
  return {
    created: true as const,
    googleEventId: event.id || null,
    calendarId: connection.calendar_id,
    calendarName: connection.calendar_name,
  }
}
