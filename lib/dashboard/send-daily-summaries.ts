import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  fetchDailyCallSummary,
  todayDateKeyInTimezone,
} from '@/lib/dashboard/daily-call-summary'
import { formatDailySummaryTelegramMessage } from '@/lib/notifications/daily-summary-telegram-format'
import { notifyDailyCallSummaryTelegram } from '@/lib/notifications/telegram'
import { resolveTelegramDelivery } from '@/lib/notifications/telegram-org-config'

export type DailySummarySendResult = {
  organizations: number
  sent: number
  skippedNoTelegram: number
  skippedNoActivity: number
  failed: number
  details: Array<{ organizationId: string; name: string; ok: boolean; reason?: string }>
}

const DEFAULT_TZ = 'America/New_York'

export async function sendDailySummariesToTelegram(options?: {
  organizationId?: string
  dateKey?: string
  /** Si true, no envía orgs sin llamadas ni leads nuevos ese día */
  skipQuietOrgs?: boolean
}): Promise<DailySummarySendResult> {
  const service = createServiceRoleClient()
  let query = service.from('organizations').select('id, name, timezone').order('name')
  if (options?.organizationId?.trim()) {
    query = query.eq('id', options.organizationId.trim())
  }
  const { data: orgs, error } = await query.limit(500)
  if (error) {
    console.error('[daily-summary/telegram]', { message: error.message })
    throw new Error(error.message)
  }

  const result: DailySummarySendResult = {
    organizations: orgs?.length ?? 0,
    sent: 0,
    skippedNoTelegram: 0,
    skippedNoActivity: 0,
    failed: 0,
    details: [],
  }

  for (const org of orgs || []) {
    const orgId = String(org.id)
    const name = typeof org.name === 'string' ? org.name : 'Cliente'
    const timezone =
      typeof org.timezone === 'string' && org.timezone.trim() ? org.timezone.trim() : DEFAULT_TZ
    const dateKey = options?.dateKey?.trim() || todayDateKeyInTimezone(timezone)

    const delivery = await resolveTelegramDelivery(orgId)
    if (delivery.chatIds.length === 0) {
      result.skippedNoTelegram++
      result.details.push({ organizationId: orgId, name, ok: false, reason: 'no_telegram' })
      continue
    }

    const summary = await fetchDailyCallSummary(service, orgId, { dateKey, timezone })
    const hasActivity =
      summary.stats.totalCalls > 0 ||
      summary.stats.newLeads > 0 ||
      summary.followUpCalls.length > 0

    if (options?.skipQuietOrgs && !hasActivity) {
      result.skippedNoActivity++
      result.details.push({ organizationId: orgId, name, ok: false, reason: 'no_activity' })
      continue
    }

    const text = formatDailySummaryTelegramMessage({ organizationName: name, summary })
    const ok = await notifyDailyCallSummaryTelegram({
      organizationId: orgId,
      text,
      dateKey,
    })

    if (ok) {
      result.sent++
      result.details.push({ organizationId: orgId, name, ok: true })
    } else {
      result.failed++
      result.details.push({ organizationId: orgId, name, ok: false, reason: 'send_failed' })
    }
  }

  console.info('[daily-summary/telegram]', {
    organizations: result.organizations,
    sent: result.sent,
    skippedNoTelegram: result.skippedNoTelegram,
    skippedNoActivity: result.skippedNoActivity,
    failed: result.failed,
  })

  return result
}
