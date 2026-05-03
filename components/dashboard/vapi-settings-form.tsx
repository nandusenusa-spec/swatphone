'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Save, Loader2, ExternalLink, CheckCircle, XCircle } from 'lucide-react'

interface Organization {
  id: string
  vapi_api_key: string | null
  vapi_assistant_id: string | null
  vapi_phone_number: string | null
}

export function VapiSettingsForm({ organization }: { organization: Organization | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    vapi_api_key: organization?.vapi_api_key || '',
    vapi_assistant_id: organization?.vapi_assistant_id || '',
    vapi_phone_number: organization?.vapi_phone_number || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (organization?.id) {
        await supabase
          .from('organizations')
          .update({
            vapi_api_key: formData.vapi_api_key || null,
            vapi_assistant_id: formData.vapi_assistant_id || null,
            vapi_phone_number: formData.vapi_phone_number || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', organization.id)
      }
      router.refresh()
    } catch (error) {
      console.error('Error saving voice provider settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Status */}
      <div className="rounded-lg border p-4">
        <h4 className="mb-3 font-medium">Estado de Conexion</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Private/Server API Key</span>
            {formData.vapi_api_key ? (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Configurada
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-red-500">
                <XCircle className="h-4 w-4" />
                No configurada
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Assistant ID</span>
            {formData.vapi_assistant_id ? (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Configurado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-yellow-600">
                <XCircle className="h-4 w-4" />
                Pendiente
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Numero de Telefono</span>
            {formData.vapi_phone_number ? (
              <span className="text-sm font-medium">{formData.vapi_phone_number}</span>
            ) : (
              <span className="text-sm text-muted-foreground">No asignado</span>
            )}
          </div>
        </div>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="vapi_api_key">Private/Server API Key</Label>
          <Input
            id="vapi_api_key"
            type="password"
            value={formData.vapi_api_key}
            onChange={(e) => setFormData({ ...formData, vapi_api_key: e.target.value })}
            placeholder="Pega aqui tu key privada/servidor"
          />
          <p className="text-xs text-muted-foreground">
            Usa la key privada/servidor del proveedor (no la publica/client). Obtenla desde{' '}
            <span className="inline-flex items-center gap-1 text-primary">
              portal del proveedor
              <ExternalLink className="h-3 w-3" />
            </span>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="vapi_assistant_id">Assistant ID</Label>
          <Input
            id="vapi_assistant_id"
            value={formData.vapi_assistant_id}
            onChange={(e) => setFormData({ ...formData, vapi_assistant_id: e.target.value })}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
          <p className="text-xs text-muted-foreground">
            Se generara automaticamente al crear el asistente en el proveedor
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="vapi_phone_number">Numero de Telefono</Label>
          <Input
            id="vapi_phone_number"
            value={formData.vapi_phone_number}
            onChange={(e) => setFormData({ ...formData, vapi_phone_number: e.target.value })}
            placeholder="+1234567890"
          />
          <p className="text-xs text-muted-foreground">
            Numero asignado por el proveedor para recibir llamadas
          </p>
        </div>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Guardar Configuracion
          </>
        )}
      </Button>
    </form>
  )
}
