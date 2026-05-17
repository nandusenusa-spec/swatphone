import Link from 'next/link'
import { requireDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { getOrganizationSubscription } from '@/lib/billing/subscription-access'
import { BillingActions } from '@/components/dashboard/billing-actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default async function BillingSettingsPage() {
  const organizationId = await requireDashboardOrganizationId()
  const sub = await getOrganizationSubscription(organizationId)

  const trialDaysLeft =
    sub?.status === 'trialing' && sub.trial_ends_at
      ? Math.max(
          0,
          Math.ceil(
            (new Date(sub.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          ),
        )
      : null

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/settings" className="text-sm text-muted-foreground hover:underline">
          ← Configuración
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Facturación</h1>
        <p className="text-muted-foreground">Plan, trial y suscripción Stripe</p>
      </div>

      {sub?.status === 'trialing' && trialDaysLeft !== null ? (
        <Alert>
          <AlertTitle>Periodo de prueba</AlertTitle>
          <AlertDescription>
            Quedan aproximadamente {trialDaysLeft} día(s). Activá un plan para continuar sin
            interrupciones.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Estado actual</CardTitle>
          <CardDescription>Organización {organizationId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Plan:</span> {sub?.plan ?? '—'}
          </p>
          <p>
            <span className="text-muted-foreground">Estado:</span> {sub?.status ?? 'sin registro'}
          </p>
          {sub?.current_period_end ? (
            <p>
              <span className="text-muted-foreground">Próximo periodo / fin:</span>{' '}
              {new Date(sub.current_period_end).toLocaleString()}
            </p>
          ) : null}
          <p>
            <span className="text-muted-foreground">Setup fee pagado:</span>{' '}
            {sub?.setup_fee_paid ? 'sí' : 'no'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acciones</CardTitle>
          <CardDescription>Checkout Stripe (14 días de trial en planes nuevos)</CardDescription>
        </CardHeader>
        <CardContent>
          <BillingActions />
        </CardContent>
      </Card>
    </div>
  )
}
