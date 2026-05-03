import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone } from '@/lib/phone'

const RATE_WINDOW_MS = 15 * 60 * 1000
/** Llamadas en la ventana antes de empezar a subir score */
const RATE_SOFT_THRESHOLD = 3
const RATE_SCORE_PER_EXCESS = 18
const AUTO_BLOCK_SCORE = 98

export type PhoneScreeningRow = {
  id: string
  organization_id: string
  phone_e164: string
  spam_score: number
  blocked: boolean
  blocked_reason: string | null
  manual_block: boolean
  attempts_count: number
  first_seen_at: string
  last_seen_at: string
  last_rejected_at: string | null
  updated_at: string
}

const REJECT_GENERIC_ES =
  'No podemos completar su llamada en este momento. Si cree que es un error, intente más tarde o por otro canal.'
const REJECT_BLOCKED_ES =
  'Su número no puede ser atendido en esta línea. Si necesita ayuda, contacte por otro medio.'
const REJECT_SPAM_ES =
  'Detectamos actividad inusual desde este número. La llamada no puede continuar.'

function spokenError(kind: 'blocked' | 'spam' | 'generic'): string {
  if (kind === 'blocked') return REJECT_BLOCKED_ES
  if (kind === 'spam') return REJECT_SPAM_ES
  return REJECT_GENERIC_ES
}

/**
 * Antes de devolver assistant en assistant-request: bloqueo, score umbral, rate-limit.
 * Devuelve { allow: false, error } para respuesta Vapi `{ error: string }` (cuelga tras mensaje).
 */
export async function screenInboundAssistantRequest(input: {
  organizationId: string
  phoneRaw: string
  spamThreshold: number
}): Promise<{ allow: true } | { allow: false; error: string }> {
  const phone = normalizePhone(input.phoneRaw)
  if (!phone) {
    return { allow: true }
  }

  const supabase = createServiceRoleClient()
  const threshold = Math.max(50, Math.min(100, input.spamThreshold || 70))

  const { data: existing, error: selErr } = await supabase
    .from('phone_screening')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('phone_e164', phone)
    .maybeSingle()

  if (selErr?.code === 'PGRST205') {
    return { allow: true }
  }
  if (selErr) {
    console.error('[phone-screening] select failed', selErr)
    return { allow: true }
  }

  const row = existing as PhoneScreeningRow | null
  const now = Date.now()

  if (row) {
    if (row.manual_block || row.blocked) {
      return { allow: false, error: spokenError('blocked') }
    }
    if (row.spam_score >= threshold) {
      return { allow: false, error: spokenError('spam') }
    }
  }

  let attempts = 1
  let spamScore = row?.spam_score ?? 0
  let firstSeen = row?.first_seen_at || new Date().toISOString()

  if (row) {
    const last = new Date(row.last_seen_at).getTime()
    if (Number.isFinite(last) && now - last < RATE_WINDOW_MS) {
      attempts = row.attempts_count + 1
      if (attempts > RATE_SOFT_THRESHOLD) {
        const excess = attempts - RATE_SOFT_THRESHOLD
        spamScore = Math.min(100, spamScore + excess * RATE_SCORE_PER_EXCESS)
      }
    } else {
      attempts = 1
    }
  }

  let blocked = false
  let blockedReason: string | null = row?.blocked_reason ?? null
  if (spamScore >= threshold) {
    blockedReason = blockedReason || 'spam_score_threshold'
  }
  if (spamScore >= AUTO_BLOCK_SCORE) {
    blocked = true
    blockedReason = blockedReason || 'auto_high_score'
  }

  const rejectNow = blocked || spamScore >= threshold
  const nowIso = new Date().toISOString()
  const patch = {
    organization_id: input.organizationId,
    phone_e164: phone,
    spam_score: spamScore,
    blocked,
    blocked_reason: blockedReason,
    manual_block: row?.manual_block ?? false,
    attempts_count: attempts,
    first_seen_at: firstSeen,
    last_seen_at: nowIso,
    updated_at: nowIso,
    last_rejected_at: rejectNow ? nowIso : row?.last_rejected_at ?? null,
  }

  const { error: upErr } = await supabase.from('phone_screening').upsert(patch, {
    onConflict: 'organization_id,phone_e164',
  })

  if (upErr) {
    console.error('[phone-screening] upsert failed', upErr)
    return { allow: true }
  }

  if (rejectNow) {
    return { allow: false, error: spokenError(blocked ? 'blocked' : 'spam') }
  }

  return { allow: true }
}

/** Tras mark_spam_call o rechazo por validación: persistir en phone_screening */
export async function flagPhoneAsSpam(input: {
  organizationId: string
  phone: string
  reason?: string
  spamScore?: number
  block?: boolean
}): Promise<void> {
  const phone = normalizePhone(input.phone)
  if (!phone) return

  const score = Math.max(70, Math.min(100, input.spamScore ?? 92))
  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()
  const { data: cur } = await supabase
    .from('phone_screening')
    .select('attempts_count,first_seen_at')
    .eq('organization_id', input.organizationId)
    .eq('phone_e164', phone)
    .maybeSingle()

  const { error } = await supabase.from('phone_screening').upsert(
    {
      organization_id: input.organizationId,
      phone_e164: phone,
      spam_score: score,
      blocked: input.block !== false,
      blocked_reason: input.reason || 'marked_spam',
      manual_block: false,
      attempts_count: typeof cur?.attempts_count === 'number' ? cur.attempts_count : 0,
      first_seen_at: (typeof cur?.first_seen_at === 'string' && cur.first_seen_at) || now,
      last_seen_at: now,
      updated_at: now,
      last_rejected_at: now,
    },
    { onConflict: 'organization_id,phone_e164' },
  )
  if (error && error.code !== 'PGRST205') {
    console.warn('[phone-screening] flagPhoneAsSpam', error.message)
  }
}

export async function listPhoneScreening(organizationId: string): Promise<PhoneScreeningRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('phone_screening')
    .select('*')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) {
    if (error.code === 'PGRST205') return []
    throw error
  }
  return (data || []) as PhoneScreeningRow[]
}

export async function adminSetPhoneBlock(input: {
  organizationId: string
  phone: string
  blocked: boolean
  manual: boolean
  reason?: string
}): Promise<void> {
  const phone = normalizePhone(input.phone)
  if (!phone) throw new Error('invalid_phone')

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  if (!input.blocked) {
    const { error } = await supabase
      .from('phone_screening')
      .update({
        blocked: false,
        manual_block: false,
        blocked_reason: null,
        spam_score: 0,
        attempts_count: 0,
        updated_at: now,
        last_rejected_at: null,
      })
      .eq('organization_id', input.organizationId)
      .eq('phone_e164', phone)
    if (error && error.code !== 'PGRST116') throw error
    return
  }

  const { error } = await supabase.from('phone_screening').upsert(
    {
      organization_id: input.organizationId,
      phone_e164: phone,
      blocked: true,
      manual_block: input.manual,
      blocked_reason: input.reason || (input.manual ? 'manual_block' : 'admin_block'),
      spam_score: 95,
      attempts_count: 0,
      first_seen_at: now,
      last_seen_at: now,
      updated_at: now,
      last_rejected_at: now,
    },
    { onConflict: 'organization_id,phone_e164' },
  )
  if (error) throw error
}
