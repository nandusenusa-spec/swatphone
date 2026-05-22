import { verifyXAdminSecret } from '@/lib/admin/admin-secret-auth'
import { getTelegramChatIds } from '@/lib/notifications/telegram-chat-ids'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Lista chats que escribieron al bot (útil tras /start para obtener chat_id numérico).
 * GET /api/telegram/discover
 */
export async function GET(req: Request) {
  if (!verifyXAdminSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) {
    return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN missing' }, { status: 500 })
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=50`)
    const body = (await r.json()) as {
      ok?: boolean
      result?: Array<{
        update_id?: number
        message?: {
          chat?: { id?: number; type?: string; username?: string; first_name?: string; last_name?: string }
          from?: { id?: number; username?: string; first_name?: string }
          text?: string
        }
      }>
    }

    const seen = new Map<
      string,
      { chat_id: string; type?: string; username?: string; name?: string; last_text?: string }
    >()

    for (const u of body.result || []) {
      const chat = u.message?.chat
      const id = chat?.id
      if (id === undefined || id === null) continue
      const chatId = String(id)
      const name = [chat?.first_name, chat?.last_name].filter(Boolean).join(' ').trim()
      seen.set(chatId, {
        chat_id: chatId,
        type: chat?.type,
        username: chat?.username || u.message?.from?.username,
        name: name || undefined,
        last_text: u.message?.text,
      })
    }

    return NextResponse.json({
      ok: true,
      configured_chat_ids: getTelegramChatIds(),
      discovered: [...seen.values()],
      hint:
        'La otra persona debe abrir TU bot (mismo @username del token), enviar /start, y copiar su chat_id aquí en TELEGRAM_EXTRA_CHAT_IDS en Vercel. No se usa el número de teléfono.',
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'getUpdates_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
