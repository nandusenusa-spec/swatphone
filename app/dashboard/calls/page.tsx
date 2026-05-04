import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone } from '@/lib/phone'
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
  let metricsTotal = 0
  let metricsInbound = 0
  let metricsCompleted = 0
  let metricsMissed = 0
  let leadByNormPhone = new Map<
    string,
    { id: string; name: string | null; email: string | null; phone: string }
  >()
  let followByCallId = new Map<
    string,
    { id: string; title: string; status: string; call_log_id: string | null; due_at: string | null }
  >()
  if (orgId) {
    const [res, totalCt, missedCt] = await Promise.all([
      service
        .from('call_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50),
      service
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId),
      service
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .or(
          'result.ilike.%miss%,result.ilike.%fail%,result.ilike.%no-answer%,result.ilike.%hang%,result.eq.spam_rejected',
        ),
    ])
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
    const callIds = calls.map((c) => c.id).filter(Boolean) as string[]
    const [{ data: leadsData }, followRes] = await Promise.all([
      service.from('leads').select('id, name, email, phone').eq('organization_id', orgId).limit(500),
      callIds.length
        ? service
            .from('follow_ups')
            .select('id, title, status, call_log_id, due_at')
            .eq('organization_id', orgId)
            .in('call_log_id', callIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])
    const leadsRows =
      (leadsData || []) as { id: string; name: string | null; email: string | null; phone: string }[]
    const followRows =
      (followRes.data || []) as {
        id: string
        title: string
        status: string
        call_log_id: string | null
        due_at: string | null
      }[]
    const phoneMap = new Map<string, (typeof leadsRows)[0]>()
    for (const L of leadsRows) {
      const n = normalizePhone(L.phone)
      if (n && !phoneMap.has(n)) phoneMap.set(n, L)
    }
    leadByNormPhone = phoneMap
    const fuMap = new Map<string, (typeof followRows)[0]>()
    for (const f of followRows) {
      if (f.call_log_id && !fuMap.has(f.call_log_id)) {
        fuMap.set(f.call_log_id, f)
      }
    }
    followByCallId = fuMap
    metricsTotal = totalCt.count ?? 0
    metricsInbound = metricsTotal
    metricsMissed = missedCt.count ?? 0
    metricsCompleted = Math.max(0, metricsTotal - metricsMissed)

    console.info('[dashboard/calls-metrics]', {
      organization_id: orgId,
      total: metricsTotal,
      inbound: metricsInbound,
      completed: metricsCompleted,
      missed: metricsMissed,
      table: 'call_logs',
      filtersUsed: {
        organization_id: orgId,
        completed_derived: 'total_minus_missed_bucket',
        list_limit: 50,
      },
    })
  }

  const normalizedCalls = calls.map((c: Record<string, unknown>) => {
    const started = c.started_at ? new Date(String(c.started_at)).getTime() : 0
    const ended = c.ended_at ? new Date(String(c.ended_at)).getTime() : 0
    const phone = typeof c.phone === 'string' ? c.phone : ''
    const customerName = typeof c.customer_name === 'string' ? c.customer_name : null
    const intent = typeof c.intent === 'string' ? c.intent : null
    const se =
      c.structured_extraction &&
      typeof c.structured_extraction === 'object' &&
      !Array.isArray(c.structured_extraction)
        ? (c.structured_extraction as Record<string, unknown>)
        : {}
    const recording_url =
      (typeof se.vapi_recording_url === 'string' ? se.vapi_recording_url : null) ||
      (typeof se.recording_url === 'string' ? se.recording_url : null)
    const ended_reason =
      (typeof se.vapi_ended_reason === 'string' ? se.vapi_ended_reason : null) ||
      (typeof c.result === 'string' ? c.result : null) ||
      (typeof c.outcome === 'string' ? c.outcome : null)
    const sentiment =
      typeof se.vapi_sentiment === 'string' ? se.vapi_sentiment : null
    const vapiDur = typeof se.vapi_duration_seconds === 'number' ? se.vapi_duration_seconds : null
    const duration =
      vapiDur !== null && Number.isFinite(vapiDur) && vapiDur >= 0
        ? Math.round(vapiDur)
        : started && ended && ended > started
          ? Math.round((ended - started) / 1000)
          : 0
    const norm = normalizePhone(phone)
    const related_lead = norm ? leadByNormPhone.get(norm) ?? null : null
    const related_follow_up =
      typeof c.id === 'string' ? followByCallId.get(c.id) ?? null : null
    return {
      id: c.id,
      vapi_call_id: typeof c.vapi_call_id === 'string' ? c.vapi_call_id : null,
      phone_number: phone,
      customer_name: customerName,
      intent,
      direction: 'inbound' as const,
      status:
        (typeof c.result === 'string' ? c.result : null) ||
        (typeof c.outcome === 'string' ? c.outcome : null) ||
        'completed',
      duration_seconds: duration,
      recording_url,
      transcript: typeof c.transcript === 'string' ? c.transcript : null,
      summary: typeof c.summary === 'string' ? c.summary : null,
      next_action: typeof c.next_action === 'string' ? c.next_action : null,
      sentiment,
      ended_reason,
      created_at: String(c.created_at || new Date().toISOString()),
      leads: related_lead
        ? {
            id: related_lead.id,
            name: related_lead.name,
            email: related_lead.email,
            phone: related_lead.phone,
          }
        : null,
      related_follow_up,
      team_members: null,
    }
  })

  const stats = [
    { title: 'Total Llamadas', value: metricsTotal || 0, icon: Phone },
    { title: 'Entrantes', value: metricsInbound || 0, icon: PhoneIncoming },
    { title: 'Completadas', value: metricsCompleted || 0, icon: PhoneOutgoing },
    { title: 'Perdidas', value: metricsMissed || 0, icon: PhoneMissed },
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
