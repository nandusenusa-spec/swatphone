'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Stats {
  totalClients: number
  totalCalls: number
  totalLeads: number
  totalRevenue: number
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    totalCalls: 0,
    totalLeads: 0,
    totalRevenue: 0,
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchStats = async () => {
      const { count: clientsCount } = await supabase
        .from('organizations')
        .select('*', { count: 'exact', head: true })

      const { count: callsCount } = await supabase
        .from('calls')
        .select('*', { count: 'exact', head: true })

      const { count: leadsCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })

      setStats({
        totalClients: clientsCount || 0,
        totalCalls: callsCount || 0,
        totalLeads: leadsCount || 0,
        totalRevenue: (clientsCount || 0) * 1000, // $1000 per client
      })
      setLoading(false)
    }

    fetchStats()
  }, [])

  if (loading) {
    return <div className="p-8">Cargando...</div>
  }

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-8">Admin Dashboard</h1>

      <div className="grid grid-cols-4 gap-6 mb-12">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground mb-2">Clientes Totales</p>
          <p className="text-4xl font-bold">{stats.totalClients}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground mb-2">Llamadas Totales</p>
          <p className="text-4xl font-bold">{stats.totalCalls}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground mb-2">Leads Totales</p>
          <p className="text-4xl font-bold">{stats.totalLeads}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground mb-2">Ingresos Mensuales</p>
          <p className="text-4xl font-bold">${stats.totalRevenue.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Acciones Rapidas</h2>
          <div className="space-y-3">
            <a
              href="/admin/clients"
              className="block w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-center hover:opacity-90 transition"
            >
              Ver Todos los Clientes
            </a>
            <a
              href="/admin/all-calls"
              className="block w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-center hover:opacity-90 transition"
            >
              Ver Todas las Llamadas
            </a>
            <a
              href="/admin/all-leads"
              className="block w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-center hover:opacity-90 transition"
            >
              Ver Todos los Leads
            </a>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Sistema</h2>
          <div className="space-y-3 text-sm">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className="text-green-600">Online</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Database:</span>
              <span className="text-green-600">Connected</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Vapi Integration:</span>
              <span className="text-yellow-600">Pending Config</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
