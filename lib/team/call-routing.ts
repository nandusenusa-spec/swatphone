import 'server-only'

import { normalizePhone } from '@/lib/phone'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type CallRecipient = {
  id: string
  name: string
  phoneE164: string
  extension: string | null
  callPriority: number
}

type TeamMemberRow = {
  id: string
  name: string
  phone: string | null
  extension: string | null
  receives_calls?: boolean | null
  call_priority?: number | null
  created_at?: string | null
  is_available?: boolean | null
}

function isMissingCallRoutingColumnError(err: { message?: string; code?: string }): boolean {
  if (err.code === '42703') return true
  const msg = (err.message || '').toLowerCase()
  return msg.includes('receives_calls') || msg.includes('call_priority')
}

function rowToRecipient(row: TeamMemberRow): CallRecipient | null {
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (!name) return null
  const phoneE164 = normalizePhone(row.phone || '')
  if (!phoneE164) return null
  const priority =
    typeof row.call_priority === 'number' && Number.isFinite(row.call_priority)
      ? row.call_priority
      : 100
  return {
    id: row.id,
    name,
    phoneE164,
    extension: typeof row.extension === 'string' ? row.extension.trim() || null : null,
    callPriority: priority,
  }
}

async function fetchTeamRows(organizationId: string): Promise<TeamMemberRow[]> {
  const supabase = createServiceRoleClient()
  const withRoutingCols = await supabase
    .from('team_members')
    .select('id, name, phone, extension, receives_calls, call_priority, created_at, is_available')
    .eq('organization_id', organizationId)

  if (withRoutingCols.error && isMissingCallRoutingColumnError(withRoutingCols.error)) {
    console.warn(
      '[call-routing] migration 023 not applied — treating all members as receives_calls=true',
      { organization_id: organizationId },
    )
    const legacy = await supabase
      .from('team_members')
      .select('id, name, phone, extension, created_at, is_available')
      .eq('organization_id', organizationId)
    if (legacy.error) {
      console.error('[call-routing] legacy fetch failed', legacy.error)
      return []
    }
    return (legacy.data || []).map((row) => ({
      ...(row as TeamMemberRow),
      receives_calls: true,
      call_priority: 100,
    }))
  }

  if (withRoutingCols.error) {
    console.error('[call-routing] fetch failed', withRoutingCols.error)
    return []
  }

  return (withRoutingCols.data || []) as TeamMemberRow[]
}

/**
 * Miembros elegibles para transferencia: receives_calls, teléfono E.164 válido.
 * Orden: call_priority asc, created_at asc, id asc.
 */
export async function getAvailableCallRecipients(organizationId: string): Promise<CallRecipient[]> {
  const orgId = organizationId.trim()
  if (!orgId) return []

  const rows = await fetchTeamRows(orgId)
  const ranked: { recipient: CallRecipient; createdAt: string; id: string }[] = []

  for (const row of rows) {
    if (row.receives_calls === false) continue
    if (row.is_available === false) continue
    const recipient = rowToRecipient(row)
    if (!recipient) continue
    ranked.push({
      recipient,
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
      id: row.id,
    })
  }

  ranked.sort((a, b) => {
    const byPriority = a.recipient.callPriority - b.recipient.callPriority
    if (byPriority !== 0) return byPriority
    const byCreated = a.createdAt.localeCompare(b.createdAt)
    if (byCreated !== 0) return byCreated
    return a.id.localeCompare(b.id)
  })

  return ranked.map((r) => r.recipient)
}

export async function getNextCallRecipient(
  organizationId: string,
  excludeIds: string[] = [],
): Promise<CallRecipient | null> {
  const excluded = new Set(excludeIds.filter(Boolean))
  const available = await getAvailableCallRecipients(organizationId)
  return available.find((r) => !excluded.has(r.id)) ?? null
}

export async function isPhoneEligibleForCallTransfer(
  organizationId: string,
  phoneE164: string,
): Promise<boolean> {
  const normalized = normalizePhone(phoneE164)
  if (!normalized) return false
  const available = await getAvailableCallRecipients(organizationId)
  return available.some((r) => r.phoneE164 === normalized)
}
