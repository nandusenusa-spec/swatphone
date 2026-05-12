import { requireDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Phone, Users, TrendingUp, Clock, PhoneIncoming, PhoneOutgoing } from 'lucide-react'
import { RecentCallsList } from '@/components/dashboard/recent-calls'
import { LeadsPipeline } from '@/components/dashboard/leads-pipeline'

export default async function DashboardPage() {
  const orgId = await requireDashboardOrganizationId()
  const service = createServiceRoleClient()

  const callLogs = orgId
    ? (
        await service
          .from('call_logs')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(100)
      ).data || []
    : []

  const [customersRes, leadsCountRes] = orgId
    ? await Promise.all([
        service
          .from('customers')
          .select('id, created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        service.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      ])
    : [null, null]

  const customers = customersRes?.data || []
  const leadsCountOnly = leadsCountRes && !leadsCountRes.error ? leadsCountRes.count || 0 : 0

  const recentCalls = callLogs.slice(0, 5).map((r: Record<string, unknown>) => {
    const started = r.started_at ? new Date(String(r.started_at)).getTime() : 0
    const ended = r.ended_at ? new Date(String(r.ended_at)).getTime() : 0
    const duration = started && ended && ended > started ? Math.round((ended - started) / 1000) : 0
    const phone = typeof r.phone === 'string' ? r.phone : ''
    const customerName = typeof r.customer_name === 'string' ? r.customer_name : null
    const intent = typeof r.intent === 'string' ? r.intent : null
    const summary = typeof r.summary === 'string' ? r.summary : null
    const nextAction = typeof r.next_action === 'string' ? r.next_action : null
    return {
      id: r.id,
      phone_number: phone,
      customer_name: customerName,
      intent,
      summary,
      next_action: nextAction,
      direction: 'inbound' as const,
      status: (typeof r.result === 'string' ? r.result : null) || (typeof r.outcome === 'string' ? r.outcome : null) || 'completed',
      duration_seconds: duration,
      recording_url: null,
      transcript: typeof r.transcript === 'string' ? r.transcript : null,
      created_at: String(r.created_at || new Date().toISOString()),
      leads: null,
    }
  })

  const totalCalls = callLogs.length
  const totalLeads = customers.length + leadsCountOnly
  const qualifiedLeads = 0
  const leadsByStatus = customers.map(() => ({ status: 'new' }))

  const durations = recentCalls.map((c: any) => c.duration_seconds).filter((n: number) => n > 0)
  const avgDuration =
    durations.length > 0 ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : 0

  const stats = [
    {
      title: 'Total Llamadas',
      value: totalCalls || 0,
      description: 'Este mes',
      icon: Phone,
      trend: '+12%',
    },
    {
      title: 'Total Leads',
      value: totalLeads || 0,
      description: 'Capturados',
      icon: Users,
      trend: '+8%',
    },
    {
      title: 'Leads Calificados',
      value: qualifiedLeads || 0,
      description: 'Listos para contactar',
      icon: TrendingUp,
      trend: '+15%',
    },
    {
      title: 'Duracion Promedio',
      value: `${Math.floor(avgDuration / 60)}:${(avgDuration % 60).toString().padStart(2, '0')}`,
      description: 'Por llamada',
      icon: Clock,
      trend: '-5%',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Resumen de tu asistente de voz AI
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
              <p className="text-xs text-muted-foreground">
                <span className={stat.trend.startsWith('+') ? 'text-green-600' : 'text-red-500'}>
                  {stat.trend}
                </span>{' '}
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent calls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Llamadas Recientes
            </CardTitle>
            <CardDescription>
              Las ultimas 5 llamadas recibidas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentCallsList calls={recentCalls || []} />
          </CardContent>
        </Card>

        {/* Leads pipeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Pipeline de Leads
            </CardTitle>
            <CardDescription>
              Distribucion por estado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeadsPipeline leads={leadsByStatus || []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
