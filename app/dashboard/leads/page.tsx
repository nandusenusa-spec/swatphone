import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LeadsTable } from '@/components/dashboard/leads-table'
import { Users, UserCheck, UserX, Star } from 'lucide-react'

export default async function LeadsPage() {
  const supabase = await createClient()
  const service = createServiceRoleClient()
  const { data: authData } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', authData.user?.id || '')
    .maybeSingle()
  const orgId = profile?.organization_id

  const [customersRes, leadsRes, callLogsRes] = orgId
    ? await Promise.all([
        service
          .from('customers')
          .select('id, name, phone, email, company, created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        service
          .from('leads')
          .select('id, name, phone, email, company, status, score, created_at')
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
    name: typeof c.name === 'string' ? c.name : null,
    phone: String(c.phone || ''),
    email: typeof c.email === 'string' ? c.email : null,
    company: typeof c.company === 'string' ? c.company : null,
    status: 'new',
    score: 0,
    score_reasons: [] as string[],
    interests: [] as string[],
    notes: null as string | null,
    created_at: String(c.created_at || new Date().toISOString()),
    team_members: null,
  }))

  const fromLeads = crmLeads.map((c: Record<string, unknown>) => ({
    id: String(c.id),
    name: typeof c.name === 'string' ? c.name : null,
    phone: String(c.phone || ''),
    email: typeof c.email === 'string' ? c.email : null,
    company: typeof c.company === 'string' ? c.company : null,
    status: typeof c.status === 'string' ? c.status : 'new',
    score: typeof c.score === 'number' ? c.score : 0,
    score_reasons: [] as string[],
    interests: [] as string[],
    notes: null as string | null,
    created_at: String(c.created_at || new Date().toISOString()),
    team_members: null,
  }))

  const existingPhones = new Set(
    [...fromLeads, ...fromCustomers]
      .map((x) => (typeof x.phone === 'string' ? x.phone.trim() : ''))
      .filter(Boolean),
  )
  const fromCalls = callLogs
    .filter((r: Record<string, unknown>) => {
      const phone = typeof r.phone === 'string' ? r.phone.trim() : ''
      return Boolean(phone) && !existingPhones.has(phone)
    })
    .map((r: Record<string, unknown>) => ({
      id: `call-${String(r.id || '')}`,
      name: typeof r.customer_name === 'string' && r.customer_name.trim() ? r.customer_name.trim() : null,
      phone: String(r.phone || ''),
      email: null as string | null,
      company: null as string | null,
      status: 'new',
      score: 0,
      score_reasons: [] as string[],
      interests: [] as string[],
      notes: typeof r.summary === 'string' ? r.summary : null,
      created_at: String(r.created_at || new Date().toISOString()),
      team_members: null,
    }))

  const leads = [...fromLeads, ...fromCustomers, ...fromCalls].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const teamMembers: any[] = []
  const totalLeads = leads.length
  const newLeads = leads.length
  const qualifiedLeads = 0
  const avgScore = 0

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
