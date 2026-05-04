import { requireDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppointmentsClient } from '@/components/dashboard/appointments-client'

export default async function AppointmentsPage() {
  const orgId = await requireDashboardOrganizationId()
  const service = createServiceRoleClient()

  const appointments = orgId
    ? (
        await service
          .from('appointments')
          .select('id, date, time, status, notes, source, customer_id, customers(name, phone)')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(100)
      ).data || []
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Citas</h1>
        <p className="text-muted-foreground">Gestión de citas (Google Calendar se integra en fase siguiente)</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Citas registradas ({appointments.length})</CardTitle>
          <CardDescription>Creadas por el bot o manualmente desde CRM</CardDescription>
        </CardHeader>
        <CardContent>
          <AppointmentsClient initialAppointments={appointments as any[]} />
        </CardContent>
      </Card>
    </div>
  )
}
