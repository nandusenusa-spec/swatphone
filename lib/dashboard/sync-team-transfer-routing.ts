import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'

type TeamRow = {
  name: string
  phone: string | null
  extension: string | null
  is_available: boolean
  role?: string | null
  department?: string | null
}

/** Normalizado para `organization_routing` y para runtime Vapi (misma forma que parseTransferDestinations). */
export type TeamTransferDestinationRow = {
  extension: string
  name: string
  phone_e164: string
  role?: string | null
  department?: string | null
}

export function teamMembersToTransferDestinations(members: TeamRow[]): TeamTransferDestinationRow[] {
  const out: TeamTransferDestinationRow[] = []
  for (const m of members) {
    if (!m.is_available) continue
    const name = typeof m.name === 'string' ? m.name.trim() : ''
    const rawPhone = typeof m.phone === 'string' ? m.phone.trim() : ''
    if (!name || !rawPhone) continue
    const phone_e164 = normalizePhone(rawPhone)
    if (!phone_e164) continue
    const role = typeof m.role === 'string' ? m.role.trim() || null : null
    const department = typeof m.department === 'string' ? m.department.trim() || null : null
    out.push({
      extension: typeof m.extension === 'string' ? m.extension.trim() : '',
      name,
      phone_e164,
      ...(role ? { role } : {}),
      ...(department ? { department } : {}),
    })
  }
  return out
}

/**
 * Refleja `team_members` en `organization_routing.transfer_destinations`
 * para que Super Admin / Vapi vean los mismos destinos que cargó el cliente en Equipo.
 */
export async function syncOrganizationRoutingFromTeam(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ destinations_count: number }> {
  const { data: members, error: mErr } = await supabase
    .from('team_members')
    .select('name, phone, extension, is_available, role, department')
    .eq('organization_id', organizationId)
  if (mErr) throw mErr

  const transfer_destinations = teamMembersToTransferDestinations((members || []) as TeamRow[])
  const now = new Date().toISOString()

  const { data: existing, error: exErr } = await supabase
    .from('organization_routing')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (exErr) throw exErr

  if (existing) {
    const { error } = await supabase
      .from('organization_routing')
      .update({ transfer_destinations, updated_at: now })
      .eq('organization_id', organizationId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('organization_routing').insert({
      organization_id: organizationId,
      transfer_destinations,
      allow_live_transfer: true,
      updated_at: now,
    })
    if (error) throw error
  }

  console.info('[dashboard/sync-team-transfer]', {
    organization_id: organizationId,
    destinations_count: transfer_destinations.length,
  })

  return { destinations_count: transfer_destinations.length }
}

export type NormalizedTransferDestination = {
  extension: string
  name: string
  phone_e164: string
}

function routingRowKey(d: { extension: string; name: string }): string {
  const ext = (d.extension || '').trim()
  if (ext) return `ext:${ext}`
  return `name:${(d.name || '').trim().toLowerCase()}`
}

function teamMemberKey(m: { extension: string | null; name: string }): string {
  const ext = (m.extension || '').trim()
  if (ext) return `ext:${ext}`
  return `name:${(m.name || '').trim().toLowerCase()}`
}

/**
 * Refleja `transfer_destinations` guardados en Super Admin en `team_members`
 * (misma lista que ve el cliente en Equipo).
 * Hace merge por interno (o por nombre si el interno está vacío) para no pisar email/rol
 * y para permitir el mismo E.164 en varias filas si la BD lo permite.
 */
export async function syncTeamMembersFromTransferDestinations(
  supabase: SupabaseClient,
  organizationId: string,
  destinations: NormalizedTransferDestination[],
): Promise<{ team_rows: number }> {
  const now = new Date().toISOString()

  const { data: existing, error: exErr } = await supabase
    .from('team_members')
    .select('id, name, phone, extension, email, role')
    .eq('organization_id', organizationId)
  if (exErr) throw exErr

  let members = existing || []
  const destKeySet = new Set(destinations.map((d) => routingRowKey(d)))

  for (const m of members) {
    if (!destKeySet.has(teamMemberKey(m))) {
      const { error: dErr } = await supabase.from('team_members').delete().eq('id', m.id)
      if (dErr) throw dErr
    }
  }

  const { data: afterOrphanRemoval, error: reErr } = await supabase
    .from('team_members')
    .select('id, name, phone, extension, email, role')
    .eq('organization_id', organizationId)
  if (reErr) throw reErr
  members = afterOrphanRemoval || []

  const usedIds = new Set<string>()

  for (const d of destinations) {
    const ext = d.extension?.trim() ? d.extension.trim() : null
    const k = routingRowKey({ extension: d.extension || '', name: d.name })
    const match = members.find((m) => teamMemberKey(m) === k)

    const patch = {
      name: d.name,
      phone: d.phone_e164,
      extension: ext,
      is_available: true,
      updated_at: now,
    }

    if (match) {
      const { error: uErr } = await supabase.from('team_members').update(patch).eq('id', match.id)
      if (uErr) throw uErr
      usedIds.add(match.id)
    } else {
      const { data: inserted, error: iErr } = await supabase
        .from('team_members')
        .insert({
          organization_id: organizationId,
          ...patch,
        })
        .select('id')
      if (iErr) throw iErr
      const newId = inserted?.[0]?.id
      if (newId) usedIds.add(newId)
    }
  }

  for (const m of members) {
    if (!usedIds.has(m.id)) {
      const { error: dErr } = await supabase.from('team_members').delete().eq('id', m.id)
      if (dErr) throw dErr
    }
  }

  return { team_rows: usedIds.size }
}
