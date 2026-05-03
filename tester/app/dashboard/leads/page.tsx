import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LeadsTable } from '@/components/dashboard/leads-table'
import { Users, UserCheck, UserX, Star } from 'lucide-react'

export default async function LeadsPage() {
  const supabase = await createClient()
  
  const { data: leads } = await supabase
    .from('leads')
    .select('*, team_members(name)')
    .order('created_at', { ascending: false })
  
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name')
  
  // Stats
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
  
  const { count: newLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'new')
  
  const { count: qualifiedLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'qualified')
  
  const { data: avgScoreData } = await supabase
    .from('leads')
    .select('score')
    .gt('score', 0)
  
  const avgScore = avgScoreData && avgScoreData.length > 0
    ? Math.round(avgScoreData.reduce((acc, l) => acc + l.score, 0) / avgScoreData.length)
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
