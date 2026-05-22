export type LeadTemperature = 'hot' | 'lukewarm'
export type TelegramLeadPayload = {
  temperature: LeadTemperature
  customerName: string
  phone: string
  email?: string | null
  company?: string | null
  need: string
  priceRequested?: boolean
  dateNeeded?: string | null
  category?: string | null
  summary?: string | null
  nextAction?: string | null
  organizationName?: string
}

function esc(t: string): string {
  return t.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}

function nowStr(): string {
  return new Date().toLocaleString('es-US', {
    timeZone: 'America/New_York',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function dashboardCallsUrl(): string | null {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : '')
  if (!base) return null
  return `${base.replace(/\/$/, '')}/dashboard/calls`
}

async function postTelegram(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; detail: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN no configurado')
    return { ok: false, status: 0, detail: 'missing_token' }
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const detail = await res.text().catch(() => '')
    if (!res.ok) {
      console.error('[telegram] send_failed', {
        status: res.status,
        detail: detail.slice(0, 600),
      })
      return { ok: false, status: res.status, detail }
    }
    return { ok: true, status: res.status, detail }
  } catch (e) {
    console.error('[telegram] send_exception', e)
    return { ok: false, status: 0, detail: e instanceof Error ? e.message : String(e) }
  }
}

async function sendMsg(
  chatId: string,
  text: string,
  options?: { replyMarkup?: Record<string, unknown> },
): Promise<boolean> {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'MarkdownV2' }
  if (options?.replyMarkup) body.reply_markup = options.replyMarkup
  const first = await postTelegram(body)
  if (first.ok) return true

  const plainBody: Record<string, unknown> = { chat_id: chatId, text: text.replace(/\\/g, '') }
  if (options?.replyMarkup) plainBody.reply_markup = options.replyMarkup
  const second = await postTelegram(plainBody)
  if (second.ok) {
    console.info('[telegram] sent_plain_fallback_after_markdown_error')
  }
  return second.ok
}

export function classifyLeadTemperature(p: {
  customerName?: string | null
  phone?: string | null
  email?: string | null
  company?: string | null
  need?: string | null
  priceRequested?: boolean
  dateNeeded?: string | null
}): LeadTemperature {
  const nameWords = (p.customerName || '').trim().split(/\s+/).filter(Boolean).length
  const hasName =
    nameWords >= 2 ||
    (nameWords === 1 &&
      ((p.email || '').trim().length > 5 ||
        (p.company || '').trim().length > 1 ||
        (p.need || '').trim().length >= 10))
  const hasPhone = !!(p.phone || '').trim()
  const hasNeed = (p.need || '').trim().length >= 5
  const hasExtra = !!(p.email || p.priceRequested || p.dateNeeded)
  return hasName && hasPhone && hasNeed && hasExtra ? 'hot' : 'lukewarm'
}

function telegramCallerDisplayName(payload: TelegramLeadPayload): string {
  const fullName = (payload.customerName || '').trim()
  const words = fullName.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return fullName
  const company = (payload.company || '').trim()
  const email = (payload.email || '').trim()
  if (company) return `${fullName} (${company})`
  if (email.includes('@')) return `${fullName} (${email})`
  return fullName
}

export async function notifyLeadTelegram(payload: TelegramLeadPayload): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (!chatId) {
    console.warn('[telegram] TELEGRAM_CHAT_ID no configurado')
    return false
  }

  const fullName = (payload.customerName || '').trim()
  const words = fullName.split(/\s+/).filter(Boolean)
  const emailTrim = (payload.email || '').trim()
  const companyTrim = (payload.company || '').trim()
  const needTrim = (payload.need || '').trim()
  const hasStrongContextForSingleName =
    emailTrim.length > 5 ||
    companyTrim.length > 1 ||
    needTrim.length >= 10 ||
    Boolean(payload.priceRequested) ||
    Boolean((payload.dateNeeded || '').trim()) ||
    Boolean((payload.category || '').trim())

  if (!fullName || fullName.toLowerCase() === 'sin nombre') {
    console.warn('[telegram] skip_notify_missing_name', { preview: fullName.slice(0, 48) })
    return false
  }
  if (words.length < 2 && !hasStrongContextForSingleName) {
    console.warn('[telegram] skip_notify_incomplete_caller_name', {
      preview: fullName.slice(0, 48),
      words: words.length,
      has_email: emailTrim.length > 0,
      has_company: companyTrim.length > 0,
      need_len: needTrim.length,
    })
    return false
  }

  const displayName = telegramCallerDisplayName(payload)
  const isHot = payload.temperature === 'hot'
  const org = esc(payload.organizationName || 'SWATWORKS')
  const header = isHot ? '🔥 *LEAD — ' + org + '*' : '⚠️ *Lead — ' + org + '*'
  const subjectRaw =
    (payload.need || '').trim() ||
    (payload.summary || '').trim() ||
    (payload.nextAction || '').trim() ||
    'Consulta'
  const subject = subjectRaw.length > 600 ? subjectRaw.slice(0, 597) + '…' : subjectRaw
  const lines = [header, '', '👤 ' + esc(displayName), '📋 ' + esc(subject), '', '⏰ _' + esc(nowStr()) + '_']

  const panelUrl = dashboardCallsUrl()
  const replyMarkup = panelUrl
    ? { inline_keyboard: [[{ text: 'Abrir panel de llamadas', url: panelUrl }]] }
    : undefined

  return sendMsg(chatId, lines.join('\n'), replyMarkup ? { replyMarkup } : undefined)
}

/** Envía Telegram tras guardar lead (misma lógica que save_lead_info). */
export async function notifySavedLeadTelegram(input: {
  organizationName?: string | null
  customerName: string
  phone: string
  email?: string | null
  company?: string | null
  need: string
  priceRequested?: boolean
  dateNeeded?: string | null
  category?: string | null
  summary?: string | null
  nextAction?: string | null
}): Promise<boolean> {
  const temperature = classifyLeadTemperature({
    customerName: input.customerName,
    phone: input.phone,
    email: input.email,
    company: input.company,
    need: input.need,
    priceRequested: input.priceRequested,
    dateNeeded: input.dateNeeded,
  })
  return notifyLeadTelegram({
    temperature,
    customerName: input.customerName,
    phone: input.phone,
    email: input.email,
    company: input.company,
    need: input.need,
    priceRequested: input.priceRequested,
    dateNeeded: input.dateNeeded,
    category: input.category,
    summary: input.summary,
    nextAction: input.nextAction,
    organizationName: input.organizationName || undefined,
  })
}

export async function notifyJobCompleteTelegram(params: {
  customerName: string
  phone: string
  jobTitle: string
  organizationName?: string
}): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (!chatId) return false
  const org = esc(params.organizationName || 'SWATWORKS')
  const text = [
    '✅ *TRABAJO LISTO — ' + org + '*',
    '',
    '👤 ' + esc(params.customerName),
    '📞 ' + esc(params.phone),
    '🖨️ *Trabajo:* ' + esc(params.jobTitle),
    '',
    '_SMS enviado al cliente_',
    '⏰ _' + esc(nowStr()) + '_',
  ].join('\n')
  return sendMsg(chatId, text)
}

export async function notifyAppointmentTelegram(params: {
  customerName: string
  phone: string
  appointmentAt: string
  reason?: string | null
  calendarStatus: string
  googleEventId?: string | null
  organizationName?: string | null
}): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (!chatId) return false
  const org = esc(params.organizationName || 'SWATWORKS')
  const lines = [
    '*CITA CREADA - ' + org + '*',
    '',
    '*Nombre:* ' + esc(params.customerName || 'Cliente'),
    '*Telefono:* ' + esc(params.phone || 'N/A'),
    '*Fecha/hora:* ' + esc(params.appointmentAt),
  ]
  if (params.reason) lines.push('*Motivo:* ' + esc(params.reason))
  lines.push('*Calendar:* ' + esc(params.calendarStatus))
  if (params.googleEventId) lines.push('*Google event:* ' + esc(params.googleEventId))
  lines.push('', '_' + esc(nowStr()) + '_')
  return sendMsg(chatId, lines.join('\n'))
}
