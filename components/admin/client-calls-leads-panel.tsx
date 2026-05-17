'use client'

import { useEffect, useState } from 'react'
import { getAdminAuthHeaders } from '@/lib/admin/client-headers'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { Phone, Users } from 'lucide-react'

type CallRow = {
  id: string
  phone_number: string
  status: string
  duration_seconds: number
  summary: string | null
  created_at: string
}

type LeadRow = {
  id: string
  name: string | null
  phone: string
  email: string | null
  status: string
  score: number
  created_at: string
}

export function ClientCallsLeadsPanel({ organizationId }: { organizationId: string }) {
  const [calls, setCalls] = useState<CallRow[]>([])
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const headers = getAdminAuthHeaders()
      const opts: RequestInit = { credentials: 'include', cache: 'no-store', headers }
      try {
        const [callsRes, leadsRes] = await Promise.all([
          fetch(`/api/admin/data?type=calls&id=${organizationId}`, opts),
          fetch(`/api/admin/data?type=leads&id=${organizationId}`, opts),
        ])
        const callsJson = await callsRes.json()
        const leadsJson = await leadsRes.json()
        if (!cancelled) {
          if (callsRes.ok && Array.isArray(callsJson.data)) setCalls(callsJson.data)
          if (leadsRes.ok && Array.isArray(leadsJson.data)) setLeads(leadsJson.data)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Cargando actividad…</p>
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="h-5 w-5" />
            Llamadas del cliente
          </CardTitle>
          <CardDescription>Últimas 100 registradas para esta organización</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[420px] space-y-3 overflow-y-auto">
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin llamadas</p>
          ) : (
            calls.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.phone_number}</span>
                  <Badge variant="outline">{c.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(new Date(c.created_at), 'dd/MM/yyyy HH:mm')}
                  {c.duration_seconds > 0 ? ` · ${c.duration_seconds}s` : ''}
                </p>
                {c.summary ? (
                  <p className="mt-2 line-clamp-2 text-muted-foreground">{c.summary}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Leads del cliente
          </CardTitle>
          <CardDescription>Prospectos capturados por el asistente de este cliente</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[420px] space-y-3 overflow-y-auto">
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin leads</p>
          ) : (
            leads.map((l) => (
              <div key={l.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{l.name || 'Sin nombre'}</span>
                  <Badge variant="secondary">{l.status}</Badge>
                </div>
                <p className="text-muted-foreground">{l.phone}</p>
                {l.email ? <p className="text-xs text-muted-foreground">{l.email}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(new Date(l.created_at), 'dd/MM/yyyy')} · score {l.score}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
