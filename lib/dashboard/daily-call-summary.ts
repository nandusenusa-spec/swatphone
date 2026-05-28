import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCallContactDisplay } from '@/lib/dashboard/call-contact-display'
import { fetchDashboardCallLogs, type DashboardCallLogRow } from '@/lib/dashboard/call-logs-queries'
import { normalizePhone } from '@/lib/phone'
import type {
  DailyCallBucket,
  DailyCallEntry,
  DailyCallSummary,
  DailyLeadEntry,
} from '@/lib/dashboard/daily-call-summary-types'

export type {
  DailyCallBucket,
  DailyCallEntry,
  DailyCallSummary,
  DailyLeadEntry,
} from '@/lib/dashboard/daily-call-summary-types'

const DEFAULT_TZ = 'America/New_York'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** YYYY-MM-DD in org timezone */
export function todayDateKeyInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || DEFAULT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function parseDateKey(input: string | null | undefined, fallback: string): string {
  const raw = (input || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return fallback
}

/** Local calendar day [start, end) as UTC ISO strings for DB filters. */
export function dayBoundsUtc(dateKey: string, timezone: string): { start: string; end: string } {
  const tz = timezone?.trim() || DEFAULT_TZ
  const [y, m, d] = dateKey.split('-').map((x) => Number(x))
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
    minute: 'numeric',
  }).formatToParts(utcNoon)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const offsetMinutes = hour * 60 + minute - 12 * 60
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMinutes * 60_000)
  const end = new Date(start.getTime() + 24 * 60 * 60_000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function callTimestamp(row: DashboardCallLogRow): string {
  const started = typeof row.started_at === 'string' ? row.started_at : ''
  const created = typeof row.created_at === 'string' ? row.created_at : ''
  return started || created || new Date().toISOString()
}

function inRange(iso: string, start: string, end: string): boolean {
  const t = new Date(iso).getTime()
  return t >= new Date(start).getTime() && t < new Date(end).getTime()
}

function strField(row: DashboardCallLogRow, key: string): string | null {
  const v = row[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function numField(row: DashboardCallLogRow, key: string): number {
  const v = row[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function boolField(row: DashboardCallLogRow, key: string): boolean {
  return row[key] === true
}

export function isSpamCallRow(row: DashboardCallLogRow): boolean {
  const classification = (strField(row, 'classification') || '').toLowerCase()
  const outcome = (strField(row, 'outcome') || strField(row, 'result') || '').toLowerCase()
  const spamScore = numField(row, 'spam_score')
  if (classification.includes('spam')) return true
  if (outcome.includes('spam')) return true
  if (spamScore >= 70) return true
  const se = asRecord(row.structured_extraction)
  if (se?.spam === true || se?.marked_spam === true) return true
  return false
}

export function isMissedCallRow(row: DashboardCallLogRow): boolean {
  const outcome = (strField(row, 'outcome') || strField(row, 'result') || '').toLowerCase()
  if (
    outcome.includes('miss') ||
    outcome.includes('fail') ||
    outcome.includes('no-answer') ||
    outcome.includes('hang')
  ) {
    return true
  }
  const duration = callDurationSeconds(row)
  if (duration > 0 && duration < 8 && !strField(row, 'summary')) return true
  return false
}

function callDurationSeconds(row: DashboardCallLogRow): number {
  const se = asRecord(row.structured_extraction)
  const vapiDur = se && typeof se.vapi_duration_seconds === 'number' ? se.vapi_duration_seconds : null
  if (vapiDur !== null && vapiDur >= 0) return Math.round(vapiDur)
  const started = row.started_at ? new Date(String(row.started_at)).getTime() : 0
  const ended = row.ended_at ? new Date(String(row.ended_at)).getTime() : 0
  if (started && ended && ended > started) return Math.round((ended - started) / 1000)
  return 0
}

function callReason(row: DashboardCallLogRow): string {
  const summary = strField(row, 'summary')
  const intent = strField(row, 'intent')
  const next = strField(row, 'next_action')
  if (summary) return summary.length > 220 ? `${summary.slice(0, 217)}…` : summary
  if (intent) return intent
  if (next) return next
  return 'Sin resumen registrado'
}

function needsFollowUp(row: DashboardCallLogRow): boolean {
  if (boolField(row, 'follow_up_required') || boolField(row, 'callback_required')) return true
  const next = (strField(row, 'next_action') || '').toLowerCase()
  if (next.includes('llamar') || next.includes('seguimiento') || next.includes('callback')) return true
  if (boolField(row, 'urgent')) return true
  return false
}

function mapCallEntry(
  row: DashboardCallLogRow,
  newLeadPhones: Set<string>,
): DailyCallEntry {
  const phone = typeof row.phone === 'string' ? row.phone : ''
  const se = asRecord(row.structured_extraction)
  const contact = resolveCallContactDisplay({
    phone,
    customerName: strField(row, 'customer_name'),
    structuredExtraction: se,
    relatedLeadName: null,
  })
  const norm = normalizePhone(phone)
  const spam = isSpamCallRow(row)
  const missed = !spam && isMissedCallRow(row)
  const followUp = !spam && !missed && needsFollowUp(row)
  const bucket: DailyCallBucket = spam ? 'spam' : missed ? 'missed' : followUp ? 'follow_up' : 'normal'

  return {
    id: String(row.id || ''),
    at: callTimestamp(row),
    phone,
    contactName: contact.primary,
    contactHint: contact.hint,
    reason: callReason(row),
    intent: strField(row, 'intent'),
    nextAction: strField(row, 'next_action'),
    bucket,
    followUp,
    isNewLead: norm ? newLeadPhones.has(norm) : false,
    durationSeconds: callDurationSeconds(row),
  }
}

export async function fetchDailyCallSummary(
  service: SupabaseClient,
  organizationId: string,
  options?: { dateKey?: string; timezone?: string },
): Promise<DailyCallSummary> {
  const timezone = options?.timezone?.trim() || DEFAULT_TZ
  const dateKey = parseDateKey(options?.dateKey, todayDateKeyInTimezone(timezone))
  const { start, end } = dayBoundsUtc(dateKey, timezone)

  const dateLabel = new Intl.DateTimeFormat('es-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${dateKey}T12:00:00.000Z`))

  const [{ rows }, leadsRes, customersRes] = await Promise.all([
    fetchDashboardCallLogs(service, organizationId, 500),
    service
      .from('leads')
      .select('id, name, phone, status, notes, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })
      .limit(200),
    service
      .from('customers')
      .select('id, name, phone, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const newLeadPhones = new Set<string>()
  const newLeads: DailyLeadEntry[] = []

  for (const L of leadsRes.data || []) {
    const phone = typeof L.phone === 'string' ? L.phone : ''
    const norm = normalizePhone(phone)
    if (norm) newLeadPhones.add(norm)
    newLeads.push({
      id: String(L.id),
      name: typeof L.name === 'string' ? L.name : null,
      phone,
      status: typeof L.status === 'string' ? L.status : null,
      notesPreview:
        typeof L.notes === 'string' && L.notes.trim()
          ? L.notes.trim().slice(0, 120)
          : null,
      createdAt: String(L.created_at || ''),
    })
  }

  for (const C of customersRes.data || []) {
    const phone = typeof C.phone === 'string' ? C.phone : ''
    const norm = normalizePhone(phone)
    if (norm) newLeadPhones.add(norm)
    if (!newLeads.some((l) => normalizePhone(l.phone) === norm)) {
      newLeads.push({
        id: String(C.id),
        name: typeof C.name === 'string' ? C.name : null,
        phone,
        status: 'customer',
        notesPreview: null,
        createdAt: String(C.created_at || ''),
      })
    }
  }

  const dayCalls = rows.filter((r) => inRange(callTimestamp(r), start, end))
  const entries = dayCalls.map((r) => mapCallEntry(r, newLeadPhones))

  const spamCalls = entries.filter((e) => e.bucket === 'spam')
  const missedCalls = entries.filter((e) => e.bucket === 'missed')
  const followUpCalls = entries.filter((e) => e.bucket === 'follow_up')
  const normalCalls = entries.filter((e) => e.bucket === 'normal')

  const needFollowUp = followUpCalls.length
  const noFollowUp = normalCalls.length + spamCalls.length

  return {
    dateLabel,
    dateKey,
    timezone,
    stats: {
      totalCalls: entries.length,
      completed: entries.filter((e) => e.bucket === 'normal' || e.bucket === 'follow_up').length,
      missed: missedCalls.length,
      spamOrBot: spamCalls.length,
      newLeads: newLeads.length,
      needFollowUp,
      noFollowUp,
    },
    followUpCalls,
    normalCalls,
    spamCalls,
    missedCalls,
    newLeads,
  }
}
