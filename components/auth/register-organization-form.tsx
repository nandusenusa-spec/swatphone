'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Building2,
  Loader2,
  PartyPopper,
  Printer,
  Stethoscope,
  UtensilsCrossed,
  Brain,
  Sparkles,
} from 'lucide-react'

type TemplateOption = {
  industry_key: string
  name: string
  description: string | null
}

const INDUSTRY_ICONS: Record<string, typeof Building2> = {
  venue: Sparkles,
  print_shop: Printer,
  restaurant: UtensilsCrossed,
  dental: Stethoscope,
  psychologist: Brain,
  general: Building2,
}

const TIMEZONES = [
  { id: 'America/Argentina/Buenos_Aires', name: 'Argentina' },
  { id: 'America/New_York', name: 'US Eastern' },
  { id: 'America/Chicago', name: 'US Central' },
  { id: 'America/Los_Angeles', name: 'US Pacific' },
  { id: 'America/Mexico_City', name: 'México' },
  { id: 'Europe/Madrid', name: 'Madrid' },
]

export function RegisterOrganizationForm({ disabled }: { disabled?: boolean }) {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [companyName, setCompanyName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [industryKey, setIndustryKey] = useState('venue')
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires')

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    try {
      const res = await fetch('/api/public/crm-templates', { cache: 'no-store' })
      const json = (await res.json()) as { templates?: TemplateOption[]; error?: string }
      if (res.ok && Array.isArray(json.templates)) {
        setTemplates(json.templates)
        if (json.templates.some((t) => t.industry_key === 'venue')) {
          setIndustryKey('venue')
        } else if (json.templates[0]) {
          setIndustryKey(json.templates[0].industry_key)
        }
      }
    } catch {
      setError('No se pudieron cargar los rubros.')
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  useEffect(() => {
    if (!disabled) void loadTemplates()
  }, [disabled, loadTemplates])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled) return
    setError(null)

    if (password !== repeatPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (!companyName.trim()) {
      setError('Ingresá el nombre de la empresa.')
      return
    }
    if (!industryKey) {
      setError('Seleccioná un rubro.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/register-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(),
          owner_full_name: ownerName.trim() || companyName.trim(),
          owner_email: email.trim(),
          owner_password: password,
          industry_key: industryKey,
          timezone,
          language: 'es',
        }),
      })
      const json = (await res.json()) as { message?: string; error?: string }
      if (!res.ok) {
        setError(json.message || json.error || 'No se pudo registrar la empresa.')
        return
      }

      const supabase = createClient()
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInErr) {
        setError(
          'Empresa creada, pero no pudimos iniciar sesión automáticamente. Entrá con tu email y contraseña.',
        )
        router.push('/auth/login')
        return
      }

      router.refresh()
      router.push('/dashboard/bienvenida')
    } catch {
      setError('Error de red. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (disabled) {
    return (
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
        El registro público está desactivado. Pedí a tu administrador que cree la cuenta o activá{' '}
        <code className="text-xs">ENABLE_PUBLIC_ORG_REGISTRATION</code> en el servidor.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label className="text-white">Rubro de tu negocio</Label>
        <p className="text-xs text-white/60">
          Define campos del CRM, etapas del pipeline y contexto del asistente de voz.
        </p>
        {loadingTemplates ? (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando rubros…
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((t) => {
              const Icon = INDUSTRY_ICONS[t.industry_key] || Building2
              const selected = industryKey === t.industry_key
              return (
                <button
                  key={t.industry_key}
                  type="button"
                  onClick={() => setIndustryKey(t.industry_key)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition',
                    selected
                      ? 'border-[#00d2ff]/60 bg-[#00d2ff]/10 ring-1 ring-[#00d2ff]/30'
                      : 'border-white/10 bg-white/5 hover:border-white/20',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        selected ? 'text-[#00d2ff]' : 'text-white/70',
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium text-white">{t.name}</p>
                      {t.description ? (
                        <p className="mt-0.5 text-xs text-white/55 line-clamp-2">{t.description}</p>
                      ) : null}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="company" className="text-white">
            Nombre de la empresa
          </Label>
          <Input
            id="company"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Ej. Salón Aurora Events"
            className="liquid-glass h-10 border-white/10 bg-white/5 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="owner" className="text-white">
            Tu nombre
          </Label>
          <Input
            id="owner"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Coordinador/a"
            className="liquid-glass h-10 border-white/10 bg-white/5 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-white">Zona horaria</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="liquid-glass border-white/10 bg-white/5 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.id} value={tz.id}>
                  {tz.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="email" className="text-white">
            Email (acceso al panel)
          </Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="liquid-glass h-10 border-white/10 bg-white/5 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-white">
            Contraseña
          </Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="liquid-glass h-10 border-white/10 bg-white/5 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="repeat" className="text-white">
            Repetir contraseña
          </Label>
          <Input
            id="repeat"
            type="password"
            required
            autoComplete="new-password"
            value={repeatPassword}
            onChange={(e) => setRepeatPassword(e.target.value)}
            className="liquid-glass h-10 border-white/10 bg-white/5 text-white"
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting || loadingTemplates}
        className="c3-btn flex w-full items-center justify-center gap-2 disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creando tu espacio…
          </>
        ) : (
          <>
            <PartyPopper className="h-4 w-4" />
            Crear empresa y entrar
          </>
        )}
      </button>

      <p className="text-center text-sm text-white/60">
        ¿Ya tenés cuenta?{' '}
        <Link href="/auth/login" className="text-white underline underline-offset-4">
          Iniciar sesión
        </Link>
      </p>
      <p className="text-center text-xs text-white/45">
        El teléfono de voz lo configura tu administrador de plataforma después del alta (Vapi + número
        dedicado).
      </p>
    </form>
  )
}
