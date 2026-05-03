'use client'

import { useEffect, useState } from 'react'
import { getAdminAuthHeaders } from '@/lib/admin/client-headers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, Phone, Users, TrendingUp, DollarSign } from 'lucide-react'

interface Stats {
  totalClients: number
  totalCalls: number
  totalLeads: number
  totalMinutes: number
  avgCallDuration: number
  conversionRate: number
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    totalCalls: 0,
    totalLeads: 0,
    totalMinutes: 0,
    avgCallDuration: 0,
    conversionRate: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const listOpts = {
          cache: 'no-store' as const,
          credentials: 'include' as const,
          headers: getAdminAuthHeaders(),
        }
        const [statsRes, callsRes, leadsRes] = await Promise.all([
          fetch('/api/admin/data?type=stats', listOpts),
          fetch('/api/admin/data?type=calls', listOpts),
          fetch('/api/admin/data?type=leads', listOpts),
        ])
        const statsJson = await statsRes.json().catch(() => ({}))
        const callsJson = await callsRes.json().catch(() => ({}))
        const leadsJson = await leadsRes.json().catch(() => ({}))

        const d = statsJson.data as
          | { organizations?: number; calls?: number; leads?: number }
          | undefined
        const clientsCount = typeof d?.organizations === 'number' ? d.organizations : 0
        const callsCount = typeof d?.calls === 'number' ? d.calls : 0
        const leadsCountFromStats = typeof d?.leads === 'number' ? d.leads : 0

        const calls = (callsJson.data || []) as Array<{ duration_seconds?: number }>
        const totalSecs = calls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0)
        const avgDuration = calls.length ? totalSecs / calls.length : 0

        const leads = (leadsJson.data || []) as Array<{ status?: string }>
        const leadListLen = leads.length > 0 ? leads.length : leadsCountFromStats
        const convertedLeads = leads.filter((l) => l.status === 'converted').length
        const conversionRate =
          leads.length > 0 ? (convertedLeads / leads.length) * 100 : 0

        setStats({
          totalClients: clientsCount,
          totalCalls: callsCount,
          totalLeads: leadListLen,
          totalMinutes: Math.round(totalSecs / 60),
          avgCallDuration: Math.round(avgDuration),
          conversionRate: Math.round(conversionRate),
        })
      } catch {
        setStats({
          totalClients: 0,
          totalCalls: 0,
          totalLeads: 0,
          totalMinutes: 0,
          avgCallDuration: 0,
          conversionRate: 0,
        })
      }
      setLoading(false)
    }
    fetchStats()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando analytics...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Metricas globales de la plataforma</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClients}</div>
            <p className="text-xs text-muted-foreground">Organizaciones activas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Llamadas</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCalls}</div>
            <p className="text-xs text-muted-foreground">Llamadas procesadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLeads}</div>
            <p className="text-xs text-muted-foreground">Prospectos capturados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Minutos Totales</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMinutes}</div>
            <p className="text-xs text-muted-foreground">Minutos de llamadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Duracion Promedio</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgCallDuration}s</div>
            <p className="text-xs text-muted-foreground">Por llamada</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Conversion</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">Leads convertidos</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue estimation */}
      <Card>
        <CardHeader>
          <CardTitle>Estimacion de Ingresos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Ingreso Mensual (estimado)</p>
              <p className="text-3xl font-bold text-primary">${stats.totalClients * 1000}</p>
              <p className="text-xs text-muted-foreground">{stats.totalClients} clientes x $1,000/mes</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Costo voz IA (estimado)</p>
              <p className="text-3xl font-bold text-destructive">${Math.round(stats.totalMinutes * 0.25)}</p>
              <p className="text-xs text-muted-foreground">{stats.totalMinutes} min x $0.25/min</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Ganancia Neta (estimado)</p>
              <p className="text-3xl font-bold text-green-600">
                ${(stats.totalClients * 1000) - Math.round(stats.totalMinutes * 0.25)}
              </p>
              <p className="text-xs text-muted-foreground">Ingreso - Costos</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
