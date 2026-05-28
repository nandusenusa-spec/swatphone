import Link from 'next/link'
import { requireDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { getBusinessProfile } from '@/lib/crm/industry-templates'
import { getOnboardingPlaybook } from '@/lib/onboarding/industry-playbooks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Mic, ArrowRight } from 'lucide-react'

export default async function BienvenidaPage() {
  const organizationId = await requireDashboardOrganizationId()
  const profile = await getBusinessProfile(organizationId)
  const industryKey = profile?.industry_key || 'general'
  const playbook = getOnboardingPlaybook(industryKey)
  const businessName = profile?.business_name || 'tu negocio'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{playbook.title}</h1>
        <p className="mt-1 text-muted-foreground">
          Hola, <span className="text-foreground font-medium">{businessName}</span>. {playbook.subtitle}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Primeros pasos</CardTitle>
          <CardDescription>Completá esto para que la experiencia con Luma sea excelente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {playbook.checklist.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm transition hover:bg-muted/50"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {item.label}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mic className="h-5 w-5" />
            Tips para el asistente de voz
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {playbook.voiceTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/dashboard">Ir al panel</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/settings/crm">Ver plantilla CRM</Link>
        </Button>
      </div>
    </div>
  )
}
