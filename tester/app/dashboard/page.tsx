import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Phone, Users, TrendingUp, Clock, PhoneIncoming, PhoneOutgoing } from 'lucide-react'
import { RecentCallsList } from '@/components/dashboard/recent-calls'
import { LeadsPipeline } from '@/components/dashboard/leads-pipeline'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  // Get stats
  const { count: totalCalls } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
  
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
  
  const { count: qualifiedLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .in('status', ['qualified', 'converted'])
  
  const { data: recentCalls } = await supabase
    .from('calls')
    .select('*, leads(name, phone)')
    .order('created_at', { ascending: false })
    .limit(5)
  
  const { data: leadsByStatus } = await supabase
    .from('leads')
    .select('status')
  
  // Calculate average call duration
  const { data: callDurations } = await supabase
    .from('calls')
    .select('duration_seconds')
    .gt('duration_seconds', 0)
  
  const avgDuration = callDurations && callDurations.length > 0
    ? Math.round(callDurations.reduce((acc, c) => acc + (c.duration_seconds || 0), 0) / callDurations.length)
    : 0

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
