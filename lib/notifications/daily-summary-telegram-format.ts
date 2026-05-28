import type { DailyCallEntry, DailyCallSummary } from '@/lib/dashboard/daily-call-summary-types'

function esc(t: string): string {
  return t.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}

function formatCallLine(c: DailyCallEntry): string {
  const time = new Date(c.at).toLocaleTimeString('es-US', { hour: '2-digit', minute: '2-digit' })
  const name = c.contactName || c.phone || 'Desconocido'
  const reason = c.reason.length > 90 ? `${c.reason.slice(0, 87)}…` : c.reason
  return `• ${time} — ${name} — ${reason}`
}

function sectionLines(title: string, rows: DailyCallEntry[], max: number): string[] {
  if (!rows.length) return []
  const out = ['', `*${title}* (${rows.length})`]
  for (const c of rows.slice(0, max)) {
    out.push(esc(formatCallLine(c)))
  }
  if (rows.length > max) {
    out.push(esc(`… y ${rows.length - max} más en el panel`))
  }
  return out
}

/** Texto MarkdownV2 para Telegram (máx. ~4000 caracteres). */
export function formatDailySummaryTelegramMessage(input: {
  organizationName: string
  summary: DailyCallSummary
}): string {
  const { summary: s } = input
  const org = esc(input.organizationName || 'Cliente')
  const stats = s.stats

  const lines: string[] = [
    `📊 *Resumen del día — ${org}*`,
    '',
    `_${esc(s.dateLabel)}_`,
    '',
    `📞 Llamadas: *${stats.totalCalls}* · Seguimiento: *${stats.needFollowUp}* · Leads: *${stats.newLeads}*`,
    `🚫 Spam/bot: *${stats.spamOrBot}* · Perdidas: *${stats.missed}* · Sin seguimiento: *${stats.noFollowUp}*`,
  ]

  lines.push(...sectionLines('Seguimiento prioritario', s.followUpCalls, 6))
  lines.push(...sectionLines('Leads nuevos', s.newLeads.map((l) => ({
    id: l.id,
    at: l.createdAt,
    phone: l.phone,
    contactName: l.name || l.phone,
    contactHint: null,
    reason: l.status ? `Estado: ${l.status}` : 'Lead nuevo',
    intent: null,
    nextAction: null,
    bucket: 'normal' as const,
    followUp: false,
    isNewLead: true,
    durationSeconds: 0,
  })), 5))
  lines.push(...sectionLines('Spam / ruido', s.spamCalls, 4))
  lines.push(...sectionLines('Perdidas', s.missedCalls, 4))
  lines.push('', '_Usá el botón del mensaje para abrir el panel._')

  let text = lines.join('\n')
  if (text.length > 3900) {
    text = `${text.slice(0, 3850)}\n\n…`
  }
  return text
}
