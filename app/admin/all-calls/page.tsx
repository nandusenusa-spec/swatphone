'use client'

import { useEffect, useState } from 'react'
import { getAdminAuthHeaders } from '@/lib/admin/client-headers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Phone, Clock, Search, Play, FileText } from 'lucide-react'

interface Call {
  id: string
  phone_number: string
  direction: string
  status: string
  duration_seconds: number
  transcript: string | null
  summary: string | null
  sentiment: string | null
  recording_url: string | null
  created_at: string
  organizations: {
    name: string
  } | null
}

export default function AllCallsPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function fetchCalls() {
      const res = await fetch('/api/admin/data?type=calls', {
        cache: 'no-store',
        credentials: 'include',
        headers: getAdminAuthHeaders(),
      })
      const json = await res.json()
      if (res.ok && Array.isArray(json.data)) setCalls(json.data as Call[])
      setLoading(false)
    }
    fetchCalls()
  }, [])

  const filteredCalls = calls.filter(call => 
    call.phone_number?.includes(search) || 
    call.organizations?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando llamadas...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Llamadas Luma</h1>
          <p className="text-muted-foreground">
            Llamadas entrantes a la línea de la plataforma (no las de cada cliente)
          </p>
        </div>
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por telefono o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Llamadas ({filteredCalls.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCalls.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay llamadas registradas</p>
          ) : (
            <div className="space-y-4">
              {filteredCalls.map((call) => (
                <div key={call.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Phone className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{call.phone_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {call.organizations?.name || 'Sin cliente'} - {new Date(call.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={call.direction === 'inbound' ? 'default' : 'secondary'}>
                      {call.direction === 'inbound' ? 'Entrante' : 'Saliente'}
                    </Badge>
                    <Badge variant={
                      call.sentiment === 'positive' ? 'default' :
                      call.sentiment === 'negative' ? 'destructive' : 'secondary'
                    }>
                      {call.sentiment || 'neutral'}
                    </Badge>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{formatDuration(call.duration_seconds || 0)}</span>
                    </div>
                    {call.recording_url && (
                      <Button size="sm" variant="ghost">
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                    {call.transcript && (
                      <Button size="sm" variant="ghost">
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
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
