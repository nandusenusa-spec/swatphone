import { DEMO_ORGANIZATION_ID, isDemoBypassAuth } from '@/lib/auth/demo-bypass'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OrganizationSettingsForm } from '@/components/dashboard/organization-settings-form'
import { OwnerProfileForm, OwnerProfileCardTitle } from '@/components/dashboard/owner-profile-form'
import Link from 'next/link'
import { Building2, Clock, CreditCard, Globe, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function SettingsPage() {
  /** TEMP DEMO ONLY — disable after presentation. */
  const demoMode = isDemoBypassAuth()
  let profile: {
    full_name: string | null
    email: string | null
    organizations: Record<string, unknown> | null
  } | null = null

  if (demoMode) {
    const service = createServiceRoleClient()
    const { data: org } = await service
      .from('organizations')
      .select('*')
      .eq('id', DEMO_ORGANIZATION_ID)
      .single()
    profile = {
      full_name: 'Demo User',
      email: 'demo@swatworks.local',
      organizations: org,
    }
  } else {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data: p } = await supabase
      .from('profiles')
      .select('*, organizations(*)')
      .eq('id', user?.id)
      .single()
    profile = p
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuracion</h1>
        <p className="text-muted-foreground">
          Configuracion de tu empresa
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <OwnerProfileCardTitle />
            </CardTitle>
            <CardDescription>Nombre y email que ves en el panel (dueño de la cuenta)</CardDescription>
          </CardHeader>
          <CardContent>
            <OwnerProfileForm
              initialFullName={profile?.full_name || ''}
              initialEmail={profile?.email || ''}
              demoMode={demoMode}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5" />
              CRM por industria
            </CardTitle>
            <CardDescription>Plantilla, campos y contexto del asistente</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/settings/crm">Configurar industria</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Facturación
            </CardTitle>
            <CardDescription>Plan, trial y portal Stripe</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/settings/billing">Ver plan y pagos</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Organization settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Informacion de la Empresa
            </CardTitle>
            <CardDescription>
              Nombre y datos basicos de tu organizacion
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationSettingsForm organization={profile?.organizations} />
          </CardContent>
        </Card>

        {/* Business Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Horario de Atencion
            </CardTitle>
            <CardDescription>
              Horarios en que tu asistente virtual atendera llamadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Lunes - Viernes</p>
                  <p className="text-2xl font-bold text-primary">9:00 AM - 6:00 PM</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Sabado - Domingo</p>
                  <p className="text-2xl font-bold text-muted-foreground">Cerrado</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Para modificar los horarios, contacta a soporte.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Timezone */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Zona Horaria
            </CardTitle>
            <CardDescription>
              Zona horaria para tu asistente virtual
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium">Zona horaria actual</p>
              <p className="text-xl font-semibold">
                {typeof profile?.organizations?.timezone === 'string'
                  ? profile.organizations.timezone
                  : 'America/New_York'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Tampa, Florida (EST/EDT)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
