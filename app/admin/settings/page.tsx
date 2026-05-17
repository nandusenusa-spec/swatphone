'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Key, Globe, Bell, Shield, Phone } from 'lucide-react'

type PlatformOrg = { configured?: boolean; id: string | null; name: string | null; slug: string | null }

export default function AdminSettingsPage() {
  const [platform, setPlatform] = useState<PlatformOrg | null>(null)

  useEffect(() => {
    fetch('/api/admin/platform-org', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.configured && j?.id) setPlatform(j as PlatformOrg)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuracion del Sistema</h1>
        <p className="text-muted-foreground">Plataforma Luma y ajustes globales</p>
      </div>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Línea de voz de Luma (plataforma)
          </CardTitle>
          <CardDescription>
            Teléfono, assistant y webhook para quien llama a Luma — no confundir con los clientes (tenants).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {platform?.id ? (
            <>
              <p className="text-sm">
                Organización: <strong>{platform.name}</strong>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{platform.id}</span>
              </p>
              <Button asChild>
                <Link href={`/admin/clients/${platform.id}`}>Configurar asistente y número de Luma</Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                En Vapi, el Server URL debe incluir{' '}
                <code className="rounded bg-muted px-1">?organization_id={platform.id}</code>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Creá una organización <strong>Luma</strong> en Supabase (distinta de SWATWORKS) y definí su UUID en{' '}
              <code className="rounded bg-muted px-1">LUMA_PLATFORM_ORGANIZATION_ID</code> en Vercel. Los clientes
              (SWATWORKS, etc.) se administran en Admin → Clientes.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Proveedor de voz (referencia)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="events-base">Base Server URL (eventos de voz)</Label>
              <Input
                id="events-base"
                value={typeof window !== 'undefined' ? `${window.location.origin}/api/voice/events` : ''}
                readOnly
                className="bg-muted font-mono text-xs"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Zona horaria por defecto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input value="America/New_York" readOnly className="bg-muted" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Próximamente</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Seguridad admin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Credenciales en tabla admin_credentials</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
