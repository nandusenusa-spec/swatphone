'use client'

import { useEffect, useState } from 'react'
import { getAdminAuthHeaders } from '@/lib/admin/client-headers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Users, Search, Phone, Mail, Building2 } from 'lucide-react'

interface Lead {
  id: string
  name: string | null
  phone: string
  email: string | null
  company: string | null
  status: string
  score: number
  created_at: string
  organizations: {
    name: string
  } | null
}

export default function AllLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [platformNote, setPlatformNote] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLeads() {
      const res = await fetch('/api/admin/data?type=leads', {
        cache: 'no-store',
        credentials: 'include',
        headers: getAdminAuthHeaders(),
      })
      const json = await res.json()
      if (res.ok && Array.isArray(json.data)) setLeads(json.data as Lead[])
      if (typeof json.note === 'string') setPlatformNote(json.note)
      setLoading(false)
    }
    fetchLeads()
  }, [])

  const filteredLeads = leads.filter(lead => 
    lead.name?.toLowerCase().includes(search.toLowerCase()) ||
    lead.phone?.includes(search) ||
    lead.email?.toLowerCase().includes(search.toLowerCase()) ||
    lead.organizations?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const statusColors: Record<string, string> = {
    new: 'bg-blue-500',
    contacted: 'bg-yellow-500',
    qualified: 'bg-green-500',
    unqualified: 'bg-gray-500',
    converted: 'bg-purple-500',
    lost: 'bg-red-500'
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando leads...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads de Luma</h1>
          <p className="text-muted-foreground">
            Prospectos que llaman a la línea de la plataforma (no los de cada cliente)
          </p>
          {platformNote === 'platform_org_not_configured' ? (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
              Configurá <code className="rounded bg-muted px-1">LUMA_PLATFORM_ORGANIZATION_ID</code> en Vercel
              con una org dedicada a Luma. SWATWORKS y otros clientes están en Admin → Clientes.
            </p>
          ) : null}
        </div>
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, telefono, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Leads ({filteredLeads.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLeads.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay leads registrados</p>
          ) : (
            <div className="space-y-4">
              {filteredLeads.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{lead.name || 'Sin nombre'}</p>
                      <p className="text-sm text-muted-foreground">
                        {lead.organizations?.name || 'Sin cliente'}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {lead.phone}
                          </span>
                        )}
                        {lead.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {lead.email}
                          </span>
                        )}
                        {lead.company && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {lead.company}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge className={statusColors[lead.status] || 'bg-gray-500'}>
                      {lead.status}
                    </Badge>
                    <div className="text-center">
                      <p className="text-lg font-bold">{lead.score}</p>
                      <p className="text-xs text-muted-foreground">Score</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
