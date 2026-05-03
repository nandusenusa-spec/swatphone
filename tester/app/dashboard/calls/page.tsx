import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CallsTable } from '@/components/dashboard/calls-table'
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react'

export default async function CallsPage() {
  const supabase = await createClient()
  
  const { data: calls } = await supabase
    .from('calls')
    .select('id, phone_number, direction, status, duration_seconds, recording_url, transcript, summary, sentiment, created_at, leads(name, email, phone), team_members(name)')
    .order('created_at', { ascending: false })
    .limit(50)
  
  // Stats
  const { count: totalCalls } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
  
  const { count: inboundCalls } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'inbound')
  
  const { count: completedCalls } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
  
  const { count: missedCalls } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .in('status', ['no-answer', 'failed'])

  const stats = [
    { title: 'Total Llamadas', value: totalCalls || 0, icon: Phone },
    { title: 'Entrantes', value: inboundCalls || 0, icon: PhoneIncoming },
    { title: 'Completadas', value: completedCalls || 0, icon: PhoneOutgoing },
    { title: 'Perdidas', value: missedCalls || 0, icon: PhoneMissed },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Llamadas</h1>
        <p className="text-muted-foreground">
          Historial de todas las llamadas manejadas por el asistente
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

      {/* Calls table */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Llamadas</CardTitle>
          <CardDescription>
            Todas las llamadas con transcripciones y detalles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CallsTable calls={calls || []} />
        </CardContent>
      </Card>
    </div>
  )
}
