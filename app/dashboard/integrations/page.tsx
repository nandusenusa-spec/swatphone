import { requireDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { getGoogleCalendarStatus } from '@/lib/integrations/google-calendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GoogleCalendarIntegrationCard } from '@/components/dashboard/google-calendar-integration-card'

export default async function IntegrationsPage() {
  const organizationId = await requireDashboardOrganizationId()
  const status = await getGoogleCalendarStatus(organizationId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        <p className="text-muted-foreground">Connect services for this organization.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>
            Appointments created by the assistant can be added to this calendar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleCalendarIntegrationCard
            connected={status.connected}
            calendarName={status.calendarName}
            timezone={status.timezone}
          />
        </CardContent>
      </Card>
    </div>
  )
}
