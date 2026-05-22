/** IDs de chat Telegram que reciben todas las notificaciones del bot. */
export function getTelegramChatIds(): string[] {
  const ids = new Set<string>()

  const list = process.env.TELEGRAM_CHAT_IDS?.trim()
  if (list) {
    for (const part of list.split(/[,;\n\r]+/)) {
      const id = part.trim()
      if (id) ids.add(id)
    }
  }

  const primary = process.env.TELEGRAM_CHAT_ID?.trim()
  if (primary) ids.add(primary)

  const extra = process.env.TELEGRAM_EXTRA_CHAT_IDS?.trim()
  if (extra) {
    for (const part of extra.split(/[,;\n\r]+/)) {
      const id = part.trim()
      if (id) ids.add(id)
    }
  }

  return [...ids]
}
