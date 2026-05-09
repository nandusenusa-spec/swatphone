'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Organization {
  id: string
  name: string
  slug: string
  vapi_api_key: string | null
  vapi_assistant_id: string | null
  vapi_phone_number: string | null
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchClients = async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching clients:', error)
      } else {
        setClients(data || [])
      }
      setLoading(false)
    }

    fetchClients()
  }, [])

  if (loading) {
    return <div className="p-8">Cargando...</div>
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Clientes</h1>

      <div className="space-y-4">
        {clients.map((client) => (
          <div key={client.id} className="border border-border rounded-lg p-6 bg-card">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">{client.name}</h2>
                <p className="text-sm text-muted-foreground">Slug: {client.slug}</p>
              </div>
              <a
                href={`/admin/clients/${client.id}`}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
              >
                Ver Detalles
              </a>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">ALOHA API Key</p>
                <p className="font-mono">{client.vapi_api_key ? '✓ Configurada' : '✗ No configurada'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Assistant ID</p>
                <p className="font-mono">{client.vapi_assistant_id || 'No asignado'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Numero Telefono</p>
                <p className="font-mono">{client.vapi_phone_number || 'No asignado'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {clients.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No hay clientes registrados aun
        </div>
      )}
    </div>
  )
}
