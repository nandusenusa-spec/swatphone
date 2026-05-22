import { verifyXAdminSecret } from '@/lib/admin/admin-secret-auth'
import { getTelegramChatIds } from '@/lib/notifications/telegram-chat-ids'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/telegram/test           → prueba a todos los chat IDs configurados
 * GET /api/telegram/test?msg=hola
 */
export async function GET(req: Request) {
  if (!verifyXAdminSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(req.url)
  const customMsg = url.searchParams.get('msg')

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatIds = getTelegramChatIds()

  if (!token || chatIds.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'env_missing',
        hasToken: Boolean(token),
        chatIdCount: chatIds.length,
        hint: 'TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (y opcional TELEGRAM_EXTRA_CHAT_IDS) en Vercel.',
      },
      { status: 500 },
    )
  }

  const base = `https://api.telegram.org/bot${token}`

  let botInfo: unknown = null
  try {
    const r = await fetch(`${base}/getMe`)
    botInfo = await r.json()
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'getMe_failed', detail: (e as Error).message },
      { status: 500 },
    )
  }

  const text = customMsg || `🧪 Test desde ALOHA — ${new Date().toLocaleString('es-US', { timeZone: 'America/New_York' })}`

  const deliveries: Array<{
    chat_id: string
    getChat_ok: boolean
    send_ok: boolean
    getChat?: unknown
    send?: unknown
  }> = []

  for (const chatId of chatIds) {
    let getChat_ok = false
    let getChat: unknown = null
    try {
      const r = await fetch(`${base}/getChat?chat_id=${encodeURIComponent(chatId)}`)
      getChat = await r.json()
      getChat_ok = (getChat as { ok?: boolean }).ok === true
    } catch {
      getChat_ok = false
    }

    let send_ok = false
    let send: unknown = null
    try {
      const r = await fetch(`${base}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      })
      send = await r.json()
      send_ok = (send as { ok?: boolean }).ok === true
    } catch {
      send_ok = false
    }

    deliveries.push({ chat_id: chatId, getChat_ok, send_ok, getChat, send })
  }

  const allOk = deliveries.every((d) => d.send_ok)
  const anyOk = deliveries.some((d) => d.send_ok)

  return NextResponse.json({
    ok: allOk,
    partial: anyOk && !allOk,
    botInfo,
    chat_ids: chatIds,
    deliveries,
    message: text,
  })
}
