import { requireDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  fetchDailyCallSummary,
  parseDateKey,
  todayDateKeyInTimezone,
} from '@/lib/dashboard/daily-call-summary'
import { DailySummaryView } from '@/components/dashboard/daily-summary-view'

type SearchParams = Promise<{ date?: string }>

export default async function ResumenDiaPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const orgId = await requireDashboardOrganizationId()
  const service = createServiceRoleClient()
  const sp = await searchParams

  const { data: org } = await service
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .maybeSingle()

  const timezone =
    typeof org?.timezone === 'string' && org.timezone.trim()
      ? org.timezone.trim()
      : 'America/New_York'

  const todayKey = todayDateKeyInTimezone(timezone)
  const dateKey = parseDateKey(sp.date, todayKey)

  const summary = await fetchDailyCallSummary(service, orgId, {
    dateKey,
    timezone,
  })

  return <DailySummaryView summary={summary} initialDateKey={dateKey} />
}
