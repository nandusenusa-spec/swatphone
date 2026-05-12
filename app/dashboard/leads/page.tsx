import { requireDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LeadsTable } from '@/components/dashboard/leads-table'
import {
  parseCommercialFieldsFromNotes,
  scoreHintFromCommercial,
} from '@/lib/vapi/lead-classification'
import { normalizePhone } from '@/lib/phone'
import { Users, UserCheck, Star } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function commercialFromStoredLead(row: Record<string, unknown>) {
  const meta = row.metadata as Record<string, unknown> | undefined
  const fromMeta =
    meta?.commercial &&
    typeof meta.commercial === 'object' &&
    meta.commercial !== null &&
    !Array.isArray(meta.commercial)
      ? (meta.commercial as Record<string, unknown>)
      : {}
  const fromNotes = parseCommercialFieldsFromNotes(typeof row.notes === 'string' ? row.notes : null) || {}
  const merged = {
    category: (fromNotes.category || (fromMeta.category as string | undefined)) as string | undefined,
    intent: (fromNotes.intent || (fromMeta.intent as string | undefined)) as string | undefined,
    priority: (fromNotes.priority || (fromMeta.priority as string | undefined)) as string | undefined,
    estimated_value_level: (fromNotes.estimated_value_level ||
      (fromMeta.estimated_value_level as string | undefined)) as string | undefined,
    summary: (fromNotes.summary || (fromMeta.summary as string | undefined)) as string | undefined,
    next_action: (fromNotes.next_action || (fromMeta.next_action as string | undefined)) as string | undefined,
    source: (fromNotes.source || (fromMeta.source as string | undefined)) as string | undefined,
  }
  return merged
}

export default async function LeadsPage() {
  const orgId = await requireDashboardOrganizationId()
  const service = createServiceRoleClient()

  const [customersRes, leadsRes, callLogsRes] = orgId
    ? await Promise.all([
        service
          .from('customers')
          .select('id, name, phone, email, company, created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        service
          .from('leads')
          .select('id, name, phone, email, company, status, score, created_at, notes, metadata')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        service
          .from('call_logs')
          .select('id, phone, customer_name, created_at, summary')
          .eq('organization_id', orgId)
          .not('phone', 'is', null)
          .order('created_at', { ascending: false })
          .limit(200),
      ])
    : [null, null, null]

  const customers = customersRes?.data || []
  const crmLeads = leadsRes?.data || []
  const callLogs = callLogsRes?.data || []

  const fromCustomers = customers.map((c: Record<string, unknown>) => ({
    id: String(c.id),
    rowKind: 'customer' as const,
    name: typeof c.name === 'string' ? c.name : null,
    phone: String(c.phone || ''),
    email: typeof c.email === 'string' ? c.email : null,
    company: typeof c.company === 'string' ? c.company : null,
    status: 'new',
    score: 0,
    display_score: 0,
    category: null as string | null,
    priority: null as string | null,
    summary: null as string | null,
    next_action: null as string | null,
    score_reasons: [] as string[],
    interests: [] as string[],
    notes: null as string | null,
    created_at: String(c.created_at || new Date().toISOString()),
    team_members: null,
  }))

  const fromLeads = crmLeads.map((c: Record<string, unknown>) => {
    const comm = commercialFromStoredLead(c)
    const rawScore = typeof c.score === 'number' ? c.score : 0
    const displayScore = Math.max(rawScore, scoreHintFromCommercial(comm))
    return {
      id: String(c.id),
      rowKind: 'lead' as const,
      name: typeof c.name === 'string' ? c.name : null,
      phone: String(c.phone || ''),
      email: typeof c.email === 'string' ? c.email : null,
      company: typeof c.company === 'string' ? c.company : null,
      status: typeof c.status === 'string' ? c.status : 'new',
      score: rawScore,
      display_score: displayScore,
      category: comm.category ?? null,
      priority: comm.priority ?? null,
      summary: comm.summary ?? null,
      next_action: comm.next_action ?? null,
      score_reasons: [] as string[],
      interests: [] as string[],
      notes: typeof c.notes === 'string' ? c.notes : null,
      created_at: String(c.created_at || new Date().toISOString()),
      team_members: null,
    }
  })

  const phoneKey = (raw: string) => {
    const n = normalizePhone(raw)
    return n || raw.trim()
  }

  /** Un lead real por teléfono (mayor score / más reciente). Evita dos filas por la misma llamada en `leads`. */
  const dedupeLeadRowsByPhone = <
    T extends {
      id: string
      phone: string
      created_at: string
      score: number
      display_score?: number
    },
  >(
    rows: T[],
  ): T[] => {
    const m = new Map<string, T>()
    for (const r of rows) {
      const k = phoneKey(r.phone)
      if (!k) continue
      const prev = m.get(k)
      if (!prev) {
        m.set(k, r)
        continue
      }
      const sc = (x: T) => (typeof x.display_score === 'number' ? x.display_score : x.score) || 0
      const next = sc(r) > sc(prev) ? r : sc(r) < sc(prev) ? prev : new Date(r.created_at) > new Date(prev.created_at) ? r : prev
      m.set(k, next)
    }
    return [...m.values()]
  }

  const dedupedCrmLeads = dedupeLeadRowsByPhone(fromLeads)

  const leadPhones = new Set(dedupedCrmLeads.map((x) => phoneKey(x.phone)))
  const customersOnly = fromCustomers.filter((c) => !leadPhones.has(phoneKey(c.phone)))
  const customerAndLeadPhones = new Set([...leadPhones, ...customersOnly.map((c) => phoneKey(c.phone))])

  const fromCalls = callLogs
    .filter((r: Record<string, unknown>) => {
      const phone = typeof r.phone === 'string' ? r.phone.trim() : ''
      return Boolean(phone) && !customerAndLeadPhones.has(phoneKey(phone))
    })
    .map((r: Record<string, unknown>) => ({
      id: `call-${String(r.id || '')}`,
      rowKind: 'call' as const,
      name: typeof r.customer_name === 'string' && r.customer_name.trim() ? r.customer_name.trim() : null,
      phone: String(r.phone || ''),
      email: null as string | null,
      company: null as string | null,
      status: 'new',
      score: 0,
      display_score: 0,
      category: null as string | null,
      priority: null as string | null,
      summary: typeof r.summary === 'string' ? r.summary : null,
      next_action: null as string | null,
      score_reasons: [] as string[],
      interests: [] as string[],
      notes: typeof r.summary === 'string' ? r.summary : null,
      created_at: String(r.created_at || new Date().toISOString()),
      team_members: null,
    }))

  const leads = [...dedupedCrmLeads, ...customersOnly, ...fromCalls].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const teamMembers: any[] = []
  const totalLeads = leads.length
  const newLeads = leads.filter((l) => l.status === 'new').length
  const qualifiedLeads = leads.filter((l) => l.status === 'qualified').length
  const avgScore =
    leads.length > 0
      ? Math.round(
          leads.reduce((acc, l) => acc + (typeof l.display_score === 'number' ? l.display_score : l.score), 0) /
            leads.length,
        )
      : 0

  const stats = [
    { title: 'Total Leads', value: totalLeads || 0, icon: Users },
    { title: 'Nuevos', value: newLeads || 0, icon: UserCheck },
    { title: 'Calificados', value: qualifiedLeads || 0, icon: Star },
    { title: 'Score Promedio', value: `${avgScore}%`, icon: Star },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Leads</h1>
        <p className="text-muted-foreground">
          Gestiona los leads capturados por el asistente
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leads table */}
      <Card>
        <CardHeader>
          <CardTitle>Todos los Leads</CardTitle>
          <CardDescription>
            Lista completa de leads con scoring y estado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeadsTable leads={leads || []} teamMembers={teamMembers || []} />
        </CardContent>
      </Card>
    </div>
  )
}
