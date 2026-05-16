'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { Loader2, Save } from 'lucide-react'

type TemplateOption = {
  industry_key: string
  name: string
}

type ProfilePayload = {
  business_name: string | null
  industry_key: string
  language: string
  timezone: string | null
}

export function CrmBusinessProfileForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [form, setForm] = useState<ProfilePayload>({
    business_name: '',
    industry_key: 'general',
    language: 'es',
    timezone: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/crm/business-profile', { credentials: 'include' })
      const json = (await res.json()) as {
        profile?: ProfilePayload | null
        available_templates?: TemplateOption[]
        error?: string
        message?: string
      }
      if (!res.ok) {
        setError(json.message || json.error || 'No se pudo cargar el perfil CRM')
        return
      }
      setTemplates(
        (json.available_templates || []).map((t) => ({
          industry_key: t.industry_key,
          name: t.name,
        })),
      )
      const p = json.profile
      setForm({
        business_name: p?.business_name || '',
        industry_key: p?.industry_key || 'general',
        language: p?.language || 'es',
        timezone: p?.timezone || '',
      })
    } catch {
      setError('Error de red al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/crm/business-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          business_name: form.business_name.trim() || null,
          industry_key: form.industry_key,
          language: form.language,
          timezone: form.timezone.trim() || null,
        }),
      })
      const json = (await res.json()) as { message?: string; error?: string }
      if (!res.ok) {
        setError(json.message || json.error || 'No se pudo guardar')
        return
      }
      router.refresh()
    } catch {
      setError('Error de red al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando perfil CRM…
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-2">
        <Label htmlFor="business_name">Nombre del negocio</Label>
        <Input
          id="business_name"
          value={form.business_name}
          onChange={(e) => setForm({ ...form, business_name: e.target.value })}
          placeholder="Mi negocio"
        />
      </div>

      <div className="space-y-2">
        <Label>Industria / plantilla CRM</Label>
        <Select
          value={form.industry_key}
          onValueChange={(value) => setForm({ ...form, industry_key: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar industria" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.industry_key} value={t.industry_key}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="language">Idioma del asistente (CRM)</Label>
        <Select
          value={form.language}
          onValueChange={(value) => setForm({ ...form, language: value })}
        >
          <SelectTrigger id="language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="es">Español</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">Zona horaria (opcional)</Label>
        <Input
          id="timezone"
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          placeholder="America/New_York"
        />
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Guardar
      </Button>
    </form>
  )
}
