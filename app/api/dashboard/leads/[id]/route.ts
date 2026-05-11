import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

type RouteContext = { params: Promise<{ id: string }> }

function isTestLikeName(name: string | null | undefined): boolean {
  if (!name) return false
  const normalized = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
  return /^(sin nombre|muchas gracias|esta semana|y apellido|es jos)$/.test(normalized)
}

function normalizePhoneForMatch(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  return phone.trim()
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const id = String(params.id || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
    }

    const url = new URL(request.url)
    const target = url.searchParams.get('target') === 'customer' ? 'customer' : 'lead'

    const supabase = createServiceRoleClient()

    if (target === 'customer') {
      const customerSelectAttempts = [
        'id, name, phone, source, metadata',
        'id, name, phone, metadata',
        'id, name, phone, source',
        'id, name, phone',
      ]
      let customerRow: Record<string, unknown> | null = null
      for (const cols of customerSelectAttempts) {
        const { data, error } = await supabase
          .from('customers')
          .select(cols)
          .eq('organization_id', organizationId)
          .eq('id', id)
          .maybeSingle()
        if (!error) {
          customerRow = (data as Record<string, unknown> | null) || null
          break
        }
      }
      if (!customerRow) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 })
      }

      const metadata =
        customerRow.metadata &&
        typeof customerRow.metadata === 'object' &&
        !Array.isArray(customerRow.metadata)
          ? (customerRow.metadata as Record<string, unknown>)
          : {}
      const source = typeof customerRow.source === 'string' ? customerRow.source : null
      const name = typeof customerRow.name === 'string' ? customerRow.name : null
      const phone = normalizePhoneForMatch(
        typeof customerRow.phone === 'string' ? customerRow.phone : null,
      )

      const { count: callLogCount } = await supabase
        .from('call_logs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('customer_id', id)
      const { count: followUpCount } = await supabase
        .from('follow_ups')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('customer_id', id)
      const { count: workOrderCount } = await supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('customer_id', id)
      const { count: appointmentCount } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('customer_id', id)

      const hasProtectedRelations =
        (workOrderCount || 0) > 0 || (appointmentCount || 0) > 0
      const hasActivityRelations = (callLogCount || 0) > 0 || (followUpCount || 0) > 0
      const isVapiSource =
        source === 'vapi_call' ||
        metadata.source === 'vapi_call' ||
        metadata.last_source === 'vapi_call'
      const isTestData =
        isVapiSource ||
        isTestLikeName(name) ||
        (phone && phone.endsWith('0000')) ||
        (phone && phone.endsWith('1234'))
      const orphaned = !hasActivityRelations && !hasProtectedRelations

      if (!orphaned && !isTestData) {
        return NextResponse.json(
          {
            error: 'customer_not_safe_to_delete',
            message:
              'Este cliente no parece de prueba u huérfano. No se borró por seguridad.',
          },
          { status: 409 },
        )
      }
      if (hasProtectedRelations && !isTestData) {
        return NextResponse.json(
          {
            error: 'customer_has_protected_relations',
            message:
              'Este cliente tiene relaciones protegidas (trabajos/citas). No se borró.',
          },
          { status: 409 },
        )
      }

      const { error: deleteCustomerError } = await supabase
        .from('customers')
        .delete()
        .eq('organization_id', organizationId)
        .eq('id', id)
      if (deleteCustomerError) throw deleteCustomerError
      return NextResponse.json({ ok: true, deleted: 'customer', id, mode: 'hard' })
    }

    const { data: leadRow, error: findLeadError } = await supabase
      .from('leads')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle()
    if (findLeadError) throw findLeadError
    if (!leadRow) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    await supabase
      .from('follow_ups')
      .delete()
      .eq('organization_id', organizationId)
      .eq('lead_id', id)
    await supabase
      .from('call_logs')
      .update({ lead_id: null, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('lead_id', id)

    const { error: deleteLeadError } = await supabase
      .from('leads')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id)
    if (deleteLeadError) throw deleteLeadError

    return NextResponse.json({ ok: true, deleted: 'lead', id, mode: 'hard' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'delete_lead_failed'
    return NextResponse.json({ error: 'delete_lead_failed', message }, { status: 500 })
  }
}
