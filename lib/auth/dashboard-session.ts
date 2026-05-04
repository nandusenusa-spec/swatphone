/**
 * TEMP DEMO ONLY — disable after presentation.
 * Central session + organization resolution for dashboard server components.
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  DEMO_ORGANIZATION_ID,
  isDemoBypassAuth,
  logDemoBypassNotice,
} from '@/lib/auth/demo-bypass'

export type DashboardLayoutProfile = {
  id: string
  email: string
  full_name: string | null
  role: string
  organization_id: string
  organizations: {
    id: string
    name: string
    slug: string
  } | null
}

export async function getDashboardOrganizationId(): Promise<string | null> {
  if (isDemoBypassAuth()) {
    return DEMO_ORGANIZATION_ID
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()
  return data?.organization_id ?? null
}

export async function requireDashboardOrganizationId(): Promise<string> {
  const id = await getDashboardOrganizationId()
  if (!id) {
    redirect('/auth/login')
  }
  return id
}

export async function loadDashboardLayoutProfile(): Promise<{
  profile: DashboardLayoutProfile
  demoMode: boolean
}> {
  if (isDemoBypassAuth()) {
    logDemoBypassNotice()
    const service = createServiceRoleClient()
    const { data: org } = await service
      .from('organizations')
      .select('id, name, slug')
      .eq('id', DEMO_ORGANIZATION_ID)
      .maybeSingle()

    const profile: DashboardLayoutProfile = {
      id: 'demo-user',
      email: 'demo@swatworks.local',
      full_name: 'Demo User',
      role: 'owner',
      organization_id: DEMO_ORGANIZATION_ID,
      organizations: org
        ? { id: org.id, name: org.name, slug: org.slug }
        : {
            id: DEMO_ORGANIZATION_ID,
            name: 'SWATWORKS',
            slug: 'swatworks',
          },
    }
    return { profile, demoMode: true }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organizations(*)')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    redirect('/auth/login')
  }

  const orgJoin = profile.organizations as
    | { id: string; name: string; slug: string }
    | null
    | undefined

  return {
    profile: {
      id: profile.id,
      email: profile.email || '',
      full_name: profile.full_name,
      role: profile.role || 'member',
      organization_id: profile.organization_id,
      organizations: orgJoin
        ? {
            id: orgJoin.id,
            name: orgJoin.name,
            slug: orgJoin.slug,
          }
        : null,
    },
    demoMode: false,
  }
}

/**
 * In demo bypass, use service role and always filter by organization_id.
 * Otherwise use the user-scoped server client (RLS).
 */
export async function getDashboardDataClient(orgId: string): Promise<{
  db: SupabaseClient
  applyOrgFilter: boolean
}> {
  if (isDemoBypassAuth()) {
    return { db: createServiceRoleClient(), applyOrgFilter: true }
  }
  return { db: await createClient(), applyOrgFilter: false }
}
