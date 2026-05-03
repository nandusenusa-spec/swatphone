import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone } from '@/lib/phone'

const GENERIC_NAMES = new Set(['cliente', 'customer', 'unknown', 'anon', 'anónimo', 'n/a'])

function normNameKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function firstGivenName(full: string): string {
  const t = full.trim()
  if (!t) return ''
  return t.split(/\s+/)[0] || t
}

function isTrustworthyCustomerName(name: string): boolean {
  const t = name.trim()
  if (t.length < 2) return false
  if (GENERIC_NAMES.has(normNameKey(t))) return false
  return true
}

/**
 * Resuelve un primer nombre solo si hay match confiable (customers o historial de llamadas consistente).
 * No inventa: si hay ambigüedad entre llamadas previas, devuelve null.
 */
export async function resolveTrustedCallerFirstName(input: {
  organizationId: string
  phone: string
}): Promise<{ firstName: string | null; source: 'customer' | 'call_log' | 'none' }> {
  const phone = normalizePhone(input.phone)
  if (!phone) return { firstName: null, source: 'none' }

  const supabase = createServiceRoleClient()

  const { data: custRows, error: cErr } = await supabase
    .from('customers')
    .select('name')
    .eq('organization_id', input.organizationId)
    .eq('phone', phone)
    .limit(1)
  if (cErr) throw cErr
  const cust = custRows?.[0]

  const custName = typeof cust?.name === 'string' ? cust.name : ''
  if (isTrustworthyCustomerName(custName)) {
    return { firstName: firstGivenName(custName), source: 'customer' }
  }

  const { data: leadRows, error: lErr } = await supabase
    .from('leads')
    .select('name')
    .eq('organization_id', input.organizationId)
    .eq('phone', phone)
    .limit(1)
  if (lErr && lErr.code !== 'PGRST205') throw lErr
  const leadName = typeof leadRows?.[0]?.name === 'string' ? leadRows[0].name : ''
  if (isTrustworthyCustomerName(leadName)) {
    return { firstName: firstGivenName(leadName), source: 'call_log' }
  }

  const { data: prevRows, error: pErr } = await supabase
    .from('call_logs')
    .select('customer_name')
    .eq('organization_id', input.organizationId)
    .eq('phone', phone)
    .not('customer_name', 'is', null)
    .order('started_at', { ascending: false })
    .limit(5)
  if (pErr) throw pErr

  const names = (prevRows || [])
    .map((r) => (typeof r.customer_name === 'string' ? r.customer_name.trim() : ''))
    .filter(isTrustworthyCustomerName)

  if (names.length === 0) return { firstName: null, source: 'none' }

  const keys = [...new Set(names.map(normNameKey))]
  if (keys.length !== 1) return { firstName: null, source: 'none' }

  return { firstName: firstGivenName(names[0]), source: 'call_log' }
}
