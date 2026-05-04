/**
 * TEMP DEMO ONLY — disable after presentation.
 *
 * When DEMO_BYPASS_AUTH=true, allows /api/admin/data without admin_token for the
 * fixed demo organization only. Does not replace real admin auth when bypass is off.
 */

import { DEMO_ORGANIZATION_ID, isDemoBypassAuth } from '@/lib/auth/demo-bypass'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { NextRequest, NextResponse } from 'next/server'

const GET_TYPES_OPEN = new Set(['stats', 'organizations'])

/** GET types that require ?id= to match the demo org. */
const GET_TYPES_STRICT_ORG = new Set([
  'organization',
  'products',
  'faqs',
  'team',
  'work_orders',
  'assistant_config',
  'owner_credential',
  'phone_screening',
  'voice_runtime_config',
  'print_clients',
  'print_jobs',
])

/**
 * When admin token is missing: return a NextResponse to send, or null to continue.
 * If not demo mode, returns 401.
 */
export function rejectUnlessDemoBypassAdminDataGet(
  request: NextRequest,
): NextResponse | null {
  if (!isDemoBypassAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const id = searchParams.get('id')

  if (!type) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (GET_TYPES_OPEN.has(type)) {
    console.log(`[auth/demo-bypass] api_admin_data type=${type}`)
    return null
  }

  if (GET_TYPES_STRICT_ORG.has(type)) {
    if (id !== DEMO_ORGANIZATION_ID) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.log(`[auth/demo-bypass] api_admin_data organization_id=${id}`)
    return null
  }

  if (type === 'calls' || type === 'leads') {
    if (!id || id !== DEMO_ORGANIZATION_ID) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.log(`[auth/demo-bypass] api_admin_data organization_id=${id}`)
    return null
  }

  // Unknown type: let route handler return 400 Invalid type (same as admin token path).
  return null
}

type ScopeResult = 'ok' | 'forbidden'

async function resolveDemoPostOrgScope(
  type: string,
  body: Record<string, unknown>,
): Promise<ScopeResult> {
  const idTop = typeof body.id === 'string' ? body.id : ''
  const data = (body.data || {}) as Record<string, unknown>

  switch (type) {
    case 'update_organization':
    case 'update_assistant_config':
      return idTop === DEMO_ORGANIZATION_ID ? 'ok' : 'forbidden'

    case 'create_organization_with_owner':
      return 'forbidden'

    case 'save_owner_credential':
    case 'reset_owner_password': {
      const orgId = (idTop || (typeof data.organization_id === 'string' ? data.organization_id : '')) as string
      return orgId === DEMO_ORGANIZATION_ID ? 'ok' : 'forbidden'
    }

    case 'update_voice_runtime':
    case 'update_phone_screening':
    case 'create_print_client': {
      const orgId = (idTop ||
        (typeof data.organization_id === 'string' ? data.organization_id : '')) as string
      return orgId === DEMO_ORGANIZATION_ID ? 'ok' : 'forbidden'
    }

    case 'update_print_client': {
      if (!idTop) return 'forbidden'
      const supabase = createServiceRoleClient()
      const { data: row } = await supabase
        .from('clients')
        .select('organization_id')
        .eq('id', idTop)
        .maybeSingle()
      return row?.organization_id === DEMO_ORGANIZATION_ID ? 'ok' : 'forbidden'
    }

    case 'create_print_job': {
      const clientId = typeof data.client_id === 'string' ? data.client_id : ''
      if (!clientId) return 'forbidden'
      const supabase = createServiceRoleClient()
      const { data: row } = await supabase
        .from('clients')
        .select('organization_id')
        .eq('id', clientId)
        .maybeSingle()
      return row?.organization_id === DEMO_ORGANIZATION_ID ? 'ok' : 'forbidden'
    }

    case 'update_work_order': {
      const orgId =
        typeof data.organization_id === 'string' ? data.organization_id.trim() : ''
      return orgId === DEMO_ORGANIZATION_ID ? 'ok' : 'forbidden'
    }

    case 'update_print_job': {
      if (!idTop) return 'forbidden'
      const supabase = createServiceRoleClient()
      const { data: job } = await supabase.from('jobs').select('client_id').eq('id', idTop).maybeSingle()
      if (!job?.client_id) return 'forbidden'
      const { data: client } = await supabase
        .from('clients')
        .select('organization_id')
        .eq('id', job.client_id as string)
        .maybeSingle()
      return client?.organization_id === DEMO_ORGANIZATION_ID ? 'ok' : 'forbidden'
    }

    default:
      return 'forbidden'
  }
}

/**
 * When admin token is missing: return a NextResponse to send, or null to continue.
 */
export async function rejectUnlessDemoBypassAdminDataPost(
  body: Record<string, unknown>,
): Promise<NextResponse | null> {
  if (!isDemoBypassAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const type = typeof body.type === 'string' ? body.type : ''
  if (!type) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const scope = await resolveDemoPostOrgScope(type, body)
  if (scope !== 'ok') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  console.log(`[auth/demo-bypass] api_admin_data organization_id=${DEMO_ORGANIZATION_ID}`)
  return null
}
