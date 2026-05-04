import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CallsTable } from '@/components/dashboard/calls-table'
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react'

export default async function CallsPage() {
  const supabase = await createClient()
  const service = createServiceRoleClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', (await supabase.auth.getUser()).data.user?.id || '')
    .maybeSingle()

  const orgId = profile?.organization_id

  let calls: Record<string, unknown>[] = []
  if (orgId) {
    const res = await service
      .from('call_logs')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (res.error) {
      console.error('[dashboard/calls-query]', {
        status: 'error',
        code: res.error.code,
        message: res.error.message,
        details: (res.error as { details?: string }).details ?? null,
        hint: (res.error as { hint?: string }).hint ?? null,
        table: 'call_logs',
        filtersUsed: { organization_id: orgId, limit: 50, order: 'created_at desc' },
      })
    }
    calls = (res.data || []) as Record<string, unknown>[]
  }

  const normalizedCalls = calls.map((c: Record<string, unknown>) => {
    const started = c.started_at ? new Date(String(c.started_at)).getTime() : 0
    const ended = c.ended_at ? new Date(String(c.ended_at)).getTime() : 0
    const duration = started && ended && ended > started ? Math.round((ended - started) / 1000) : 0
    const phone = typeof c.phone === 'string' ? c.phone : ''
    const customerName = typeof c.customer_name === 'string' ? c.customer_name : null
    const intent = typeof c.intent === 'string' ? c.intent : null
    return {
      id: c.id,
      phone_number: phone,
      customer_name: customerName,
      intent,
      direction: 'inbound' as const,
      status:
        (typeof c.result === 'string' ? c.result : null) ||
        (typeof c.outcome === 'string' ? c.outcome : null) ||
        'completed',
      duration_seconds: duration,
      recording_url: null,
      transcript: typeof c.transcript === 'string' ? c.transcript : null,
      summary: typeof c.summary === 'string' ? c.summary : null,
      next_action: typeof c.next_action === 'string' ? c.next_action : null,
      sentiment: null,
      created_at: String(c.created_at || new Date().toISOString()),
      leads: null,
      team_members: null,
    }
  })

  const totalCalls = normalizedCalls.length
  const inboundCalls = normalizedCalls.length
  const completedCalls = normalizedCalls.filter((c: any) => String(c.status).toLowerCase().includes('completed')).length
  const missedCalls = normalizedCalls.filter((c: any) =>
    ['failed', 'missed', 'no-answer'].some((v) => String(c.status).toLowerCase().includes(v)),
  ).length

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
          <CallsTable calls={normalizedCalls || []} />
        </CardContent>
      </Card>
    </div>
  )
}
