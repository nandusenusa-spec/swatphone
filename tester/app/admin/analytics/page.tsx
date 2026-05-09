'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  const supabase = createClient()

  useEffect(() => {
    async function fetchStats() {
      // Fetch organizations count
      const { count: clientsCount } = await supabase
        .from('organizations')
        .select('*', { count: 'exact', head: true })

      // Fetch calls
      const { data: calls } = await supabase
        .from('calls')
        .select('duration_seconds')

      // Fetch leads
      const { data: leads } = await supabase
        .from('leads')
        .select('status')

      const totalMinutes = calls?.reduce((acc, call) => acc + (call.duration_seconds || 0), 0) || 0
      const avgDuration = calls?.length ? totalMinutes / calls.length : 0
      const convertedLeads = leads?.filter(l => l.status === 'converted').length || 0
      const conversionRate = leads?.length ? (convertedLeads / leads.length) * 100 : 0

      setStats({
        totalClients: clientsCount || 0,
        totalCalls: calls?.length || 0,
        totalLeads: leads?.length || 0,
        totalMinutes: Math.round(totalMinutes / 60),
        avgCallDuration: Math.round(avgDuration),
        conversionRate: Math.round(conversionRate)
      })
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
              <p className="text-sm text-muted-foreground">Costo ALOHA (estimado)</p>
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
