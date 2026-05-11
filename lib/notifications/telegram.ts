export type LeadTemperature = 'hot' | 'lukewarm'
export type TelegramLeadPayload = {
  temperature: LeadTemperature; customerName: string; phone: string
  email?: string | null; need: string; priceRequested?: boolean
  dateNeeded?: string | null; category?: string | null
  summary?: string | null; nextAction?: string | null; organizationName?: string
}
function esc(t: string): string { return t.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&') }
function nowStr(): string { return new Date().toLocaleString('es-US',{timeZone:'America/New_York',dateStyle:'short',timeStyle:'short'}) }
async function sendMsg(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if(!token){ console.warn('[telegram] TELEGRAM_BOT_TOKEN no configurado'); return false }
  try {
    const res = await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({chat_id:chatId, text, parse_mode:'MarkdownV2'})
    })
    if(!res.ok){ console.error('[telegram] error',res.status); return false }
    return true
  } catch(e){ console.error('[telegram]',e); return false }
}
export function classifyLeadTemperature(p:{
  customerName?:string|null, phone?:string|null, email?:string|null,
  need?:string|null, priceRequested?:boolean, dateNeeded?:string|null
}): LeadTemperature {
  const hasName=(p.customerName||'').trim().split(/\s+/).length>=2
  const hasPhone=!!(p.phone||'').trim()
  const hasNeed=(p.need||'').trim().length>=5
  const hasExtra=!!(p.email||p.priceRequested||p.dateNeeded)
  return hasName&&hasPhone&&hasNeed&&hasExtra?'hot':'lukewarm'
}
export async function notifyLeadTelegram(payload: TelegramLeadPayload): Promise<boolean> {
  const chatId=process.env.TELEGRAM_CHAT_ID?.trim()
  if(!chatId){ console.warn('[telegram] TELEGRAM_CHAT_ID no configurado'); return false }
  const isHot = payload.temperature==='hot'
  const org=esc(payload.organizationName||'SWATWORKS')
  const header = isHot ? '🔥 *LEAD CALIENTE — '+org+'*' : '⚠️ *Lead tibio — '+org+'*'
  const lines=[
    header,'',
    '👤 *Nombre:* '+esc(payload.customerName),
    '📞 *Teléfono:* '+esc(payload.phone),
  ]
  if(payload.email) lines.push('📧 *Email:* '+esc(payload.email))
  lines.push('','💬 *Necesita:* '+esc(payload.need))
  if(payload.category) lines.push('🏷️ *Categoría:* '+esc(payload.category))
  if(payload.dateNeeded) lines.push('📅 *Cuándo:* '+esc(payload.dateNeeded))
  if(payload.priceRequested) lines.push('💰 *Pidió cotización: SÍ*')
  if(isHot && payload.nextAction) lines.push('','➡️ *Acción:* '+esc(payload.nextAction))
  if(isHot && payload.summary) lines.push('','📝 '+esc(payload.summary))
  if(!isHot) lines.push('','_Información mínima — revisar en CRM_')
  lines.push('','⏰ _'+esc(nowStr())+'_')
  return sendMsg(chatId, lines.join('\n'))
}
export async function notifyJobCompleteTelegram(params:{
  customerName:string, phone:string, jobTitle:string, organizationName?:string
}): Promise<boolean> {
  const chatId=process.env.TELEGRAM_CHAT_ID?.trim()
  if(!chatId) return false
  const org=esc(params.organizationName||'SWATWORKS')
  const text=[
    '✅ *TRABAJO LISTO — '+org+'*','',
    '👤 '+esc(params.customerName),
    '📞 '+esc(params.phone),
    '🖨️ *Trabajo:* '+esc(params.jobTitle),'',
    '_SMS enviado al cliente_',
    '⏰ _'+esc(nowStr())+'_'
  ].join('\n')
  return sendMsg(chatId,text)
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
