'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, Key, Globe, Bell, Shield } from 'lucide-react'

export default function AdminSettingsPage() {
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    // Simular guardado
    await new Promise(r => setTimeout(r, 1000))
    setSaving(false)
    alert('Configuracion guardada')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuracion del Sistema</h1>
        <p className="text-muted-foreground">Configuracion global de SWAT-VoiceIA</p>
      </div>

      <div className="grid gap-6">
        {/* Voice Provider Global Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Configuracion de proveedor de voz
            </CardTitle>
            <CardDescription>
              Configuracion global del proveedor de voz para la plataforma
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vapi-key">API Key de voz (Global)</Label>
              <Input
                id="vapi-key"
                type="password"
                placeholder="sk_live_xxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">
                Esta key se usa para crear asistentes de nuevos clientes
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="events-base">Base Server URL (eventos de voz)</Label>
              <Input
                id="events-base"
                value={typeof window !== 'undefined' ? `${window.location.origin}/api/voice/events` : ''}
                readOnly
                className="bg-muted font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                En el proveedor de voz (assistant o número) pegá esta base +{' '}
                <code className="rounded bg-muted px-1">?organization_id=UUID_DE_LA_EMPRESA</code>. El UUID lo ves en
                Admin → Clientes → Ver detalles o en Supabase (<code className="rounded bg-muted px-1">organizations.id</code>
                ).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Platform Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuracion de Plataforma
            </CardTitle>
            <CardDescription>
              Ajustes generales del sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="platform-name">Nombre de la Plataforma</Label>
              <Input
                id="platform-name"
                defaultValue="SWAT-VoiceIA"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-email">Email de Soporte</Label>
              <Input
                id="support-email"
                type="email"
                placeholder="soporte@swatvoiceia.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-price">Precio Mensual por Cliente</Label>
              <Input
                id="default-price"
                type="number"
                defaultValue="1000"
              />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificaciones
            </CardTitle>
            <CardDescription>
              Configurar alertas y notificaciones
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="alert-email">Email para Alertas</Label>
              <Input
                id="alert-email"
                type="email"
                placeholder="alertas@tuempresa.com"
              />
              <p className="text-xs text-muted-foreground">
                Recibiras alertas cuando un cliente tenga problemas
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Seguridad
            </CardTitle>
            <CardDescription>
              Cambiar credenciales de acceso admin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Password Actual</Label>
              <Input
                id="current-password"
                type="password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nuevo Password</Label>
              <Input
                id="new-password"
                type="password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Password</Label>
              <Input
                id="confirm-password"
                type="password"
              />
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Guardando...' : 'Guardar Configuracion'}
        </Button>
      </div>
    </div>
  )
}
