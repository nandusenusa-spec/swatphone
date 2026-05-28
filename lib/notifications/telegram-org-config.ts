import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getTelegramChatIds as getGlobalTelegramChatIds } from '@/lib/notifications/telegram-chat-ids'

export type TelegramDeliveryTarget = {
  chatIds: string[]
  botToken: string | null
  source: 'organization' | 'global_env'
}

let orgTelegramColumnsMissing = false

function isMissingOrgTelegramColumn(err: { code?: string; message?: string }): boolean {
  const m = (err.message || '').toLowerCase()
  return (
    err.code === '42703' ||
    err.code === 'PGRST204' ||
    m.includes('telegram_chat_ids') ||
    m.includes('telegram_bot_token')
  )
}

export function parseTelegramChatIdsField(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  const ids = new Set<string>()
  for (const part of raw.split(/[,;\n\r]+/)) {
    const id = part.trim()
    if (id) ids.add(id)
  }
  return [...ids]
}

/**
 * Si la org tiene telegram_chat_ids → solo esos chats (no mezcla con SWAT/global).
 * Si no → fallback a TELEGRAM_CHAT_ID / TELEGRAM_EXTRA_CHAT_IDS en Vercel (SWATWORKS, etc.).
 */
export async function resolveTelegramDelivery(
  organizationId?: string | null,
): Promise<TelegramDeliveryTarget> {
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || null
  const globalChatIds = getGlobalTelegramChatIds()

  const orgId = organizationId?.trim()
  if (!orgId || orgTelegramColumnsMissing) {
    return { chatIds: globalChatIds, botToken: envToken, source: 'global_env' }
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('telegram_chat_ids, telegram_bot_token')
    .eq('id', orgId)
    .maybeSingle()

  if (error) {
    if (isMissingOrgTelegramColumn(error)) {
      orgTelegramColumnsMissing = true
      console.warn('[telegram] org columns missing — run migration 028_organization_telegram.sql')
      return { chatIds: globalChatIds, botToken: envToken, source: 'global_env' }
    }
    console.error('[telegram] org_config_lookup_failed', {
      organization_id: orgId,
      message: error.message,
    })
    return { chatIds: globalChatIds, botToken: envToken, source: 'global_env' }
  }

  const orgChatIds = parseTelegramChatIdsField(
    typeof data?.telegram_chat_ids === 'string' ? data.telegram_chat_ids : null,
  )

  if (orgChatIds.length > 0) {
    const orgToken =
      typeof data?.telegram_bot_token === 'string' && data.telegram_bot_token.trim()
        ? data.telegram_bot_token.trim()
        : envToken
    return { chatIds: orgChatIds, botToken: orgToken, source: 'organization' }
  }

  return { chatIds: globalChatIds, botToken: envToken, source: 'global_env' }
}
