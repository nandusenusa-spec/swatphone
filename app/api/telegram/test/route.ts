import { verifyXAdminSecret } from '@/lib/admin/admin-secret-auth'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Endpoint de diagnóstico Telegram.
 * GET  /api/telegram/test                → manda mensaje de prueba al TELEGRAM_CHAT_ID
 * GET  /api/telegram/test?msg=hola       → manda "hola"
 *
 * Devuelve { ok, botInfo, chatInfo, sent } para validar configuración.
 */
export async function GET(req: Request) {
  if (!verifyXAdminSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(req.url)
  const customMsg = url.searchParams.get('msg')

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()

  if (!token || !chatId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'env_missing',
        hasToken: Boolean(token),
        hasChatId: Boolean(chatId),
        hint: 'Configurar TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Vercel.',
      },
      { status: 500 },
    )
  }

  const base = `https://api.telegram.org/bot${token}`

  // 1) Validar bot
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

  // 2) Validar chat
  let chatInfo: unknown = null
  try {
    const r = await fetch(`${base}/getChat?chat_id=${encodeURIComponent(chatId)}`)
    chatInfo = await r.json()
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'getChat_failed', detail: (e as Error).message, botInfo },
      { status: 500 },
    )
  }

  // 3) Mandar mensaje
  const text = customMsg || `🧪 Test desde ALOHA — ${new Date().toLocaleString('es-US', { timeZone: 'America/New_York' })}`
  let sendInfo: unknown = null
  try {
    const r = await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    sendInfo = await r.json()
    return NextResponse.json({
      ok: (sendInfo as { ok?: boolean }).ok === true,
      botInfo,
      chatInfo,
      sent: sendInfo,
      message: text,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'send_failed', detail: (e as Error).message, botInfo, chatInfo },
      { status: 500 },
    )
  }
}
