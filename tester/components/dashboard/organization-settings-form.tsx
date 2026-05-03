'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Save, Loader2 } from 'lucide-react'

interface Organization {
  id: string
  name: string
  slug: string
  timezone: string
  business_hours: Record<string, { start: string; end: string }>
}

const timezones = [
  { id: 'America/New_York', name: 'Eastern Time (US)' },
  { id: 'America/Chicago', name: 'Central Time (US)' },
  { id: 'America/Denver', name: 'Mountain Time (US)' },
  { id: 'America/Los_Angeles', name: 'Pacific Time (US)' },
  { id: 'America/Argentina/Buenos_Aires', name: 'Argentina' },
  { id: 'America/Mexico_City', name: 'Mexico City' },
  { id: 'America/Sao_Paulo', name: 'Sao Paulo' },
  { id: 'Europe/Madrid', name: 'Madrid' },
  { id: 'Europe/London', name: 'London' },
]

export function OrganizationSettingsForm({ organization }: { organization: Organization | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: organization?.name || '',
    timezone: organization?.timezone || 'America/New_York',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (organization?.id) {
        await supabase
          .from('organizations')
          .update({
            name: formData.name,
            timezone: formData.timezone,
            updated_at: new Date().toISOString(),
          })
          .eq('id', organization.id)
      }
      router.refresh()
    } catch (error) {
      console.error('Error saving organization:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre de la Empresa</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Mi Empresa"
          />
        </div>

        <div className="space-y-2">
          <Label>Zona Horaria</Label>
          <Select
            value={formData.timezone}
            onValueChange={(value) => setFormData({ ...formData, timezone: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((tz) => (
                <SelectItem key={tz.id} value={tz.id}>
                  {tz.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            Guardar Cambios
          </>
        )}
      </Button>
    </form>
  )
}
