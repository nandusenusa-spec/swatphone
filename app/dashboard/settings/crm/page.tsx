import Link from 'next/link'
import { requireDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { getOrganizationCrmTemplate } from '@/lib/crm/industry-templates'
import { CrmBusinessProfileForm } from '@/components/dashboard/crm-business-profile-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function CrmSettingsPage() {
  const organizationId = await requireDashboardOrganizationId()
  const bundle = await getOrganizationCrmTemplate(organizationId)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/settings" className="text-sm text-muted-foreground hover:underline">
          ← Configuración
        </Link>
        <h1 className="mt-2 text-2xl font-bold">CRM por industria</h1>
        <p className="text-muted-foreground">
          Elegí la plantilla que define campos, etapas del pipeline y módulos del dashboard.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil del negocio</CardTitle>
          <CardDescription>
            La industria seleccionada ajusta el contexto del asistente de voz en el próximo sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CrmBusinessProfileForm />
        </CardContent>
      </Card>

      {bundle ? (
        <Card>
          <CardHeader>
            <CardTitle>Vista previa: {bundle.template.name}</CardTitle>
            <CardDescription>
              {bundle.fields.length} campos · {bundle.stages.length} etapas ·{' '}
              {bundle.modules.filter((m) => m.is_enabled).length} módulos activos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground mb-1">Campos CRM</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {bundle.fields.map((f) => (
                  <li key={f.id}>
                    {f.label} <span className="text-muted-foreground">({f.field_key})</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-muted-foreground mb-1">Etapas del pipeline</p>
              <p>{bundle.stages.map((s) => s.label).join(' → ')}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
