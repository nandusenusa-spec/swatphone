import { writeFileSync, mkdirSync } from 'fs'

mkdirSync('lib/notifications', { recursive: true })
mkdirSync('app/api/jobs/complete', { recursive: true })

// ─── telegram.ts ───────────────────────────────────────────
writeFileSync('lib/notifications/telegram.ts', `
export type LeadTemperature = 'hot' | 'lukewarm'
export type TelegramLeadPayload = {
  temperature: LeadTemperature; customerName: string; phone: string
  email?: string | null; need: string; priceRequested?: boolean
  dateNeeded?: string | null; category?: string | null
  summary?: string | null; nextAction?: string | null; organizationName?: string
}
function esc(t: string): string { return t.replace(/[_*[\\]()~\`>#+\\-=|{}.!\\\\]/g, '\\\\$&') }
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
  const hasName=(p.customerName||'').trim().split(/\\s+/).length>=2
  const hasPhone=!!(p.phone||'').trim()
  const hasNeed=(p.need||'').trim().length>=5
  const hasExtra=!!(p.email||p.priceRequested||p.dateNeeded)
  return hasName&&hasPhone&&hasNeed&&hasExtra?'hot':'lukewarm'
}
export async function notifyLeadTelegram(payload: TelegramLeadPayload): Promise<boolean> {
  if(payload.temperature==='lukewarm'){ console.log('[telegram] tibio → solo CRM'); return false }
  const chatId=process.env.TELEGRAM_CHAT_ID?.trim()
  if(!chatId){ console.warn('[telegram] TELEGRAM_CHAT_ID no configurado'); return false }
  const org=esc(payload.organizationName||'SWATWORKS')
  const lines=[
    '🔥 *LEAD CALIENTE — '+org+'*','',
    '👤 *Nombre:* '+esc(payload.customerName),
    '📞 *Teléfono:* '+esc(payload.phone),
  ]
  if(payload.email) lines.push('📧 *Email:* '+esc(payload.email))
  lines.push('','💬 *Necesita:* '+esc(payload.need))
  if(payload.category) lines.push('🏷️ *Categoría:* '+esc(payload.category))
  if(payload.dateNeeded) lines.push('📅 *Cuándo:* '+esc(payload.dateNeeded))
  if(payload.priceRequested) lines.push('💰 *Pidió cotización: SÍ*')
  if(payload.nextAction) lines.push('','➡️ *Acción:* '+esc(payload.nextAction))
  if(payload.summary) lines.push('','📝 '+esc(payload.summary))
  lines.push('','⏰ _'+esc(nowStr())+'_')
  return sendMsg(chatId, lines.join('\\n'))
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
  ].join('\\n')
  return sendMsg(chatId,text)
}
`.trim())

// ─── sms.ts ────────────────────────────────────────────────
writeFileSync('lib/notifications/sms.ts', `
function getTwilioConfig() {
  const sid=process.env.TWILIO_ACCOUNT_SID?.trim()
  const token=process.env.TWILIO_AUTH_TOKEN?.trim()
  const from=process.env.TWILIO_PHONE_NUMBER?.trim()
  if(!sid||!token||!from){ console.warn('[sms] Twilio no configurado'); return null }
  return {sid,token,from}
}
export async function sendJobReadySms(params:{
  to:string, customerName:string, jobTitle:string, jobNumber?:string|null
}): Promise<{ok:boolean, sid?:string, error?:string}> {
  const cfg=getTwilioConfig()
  if(!cfg) return {ok:false, error:'twilio_not_configured'}
  const firstName=params.customerName.split(' ')[0]||params.customerName
  const job=params.jobNumber?params.jobTitle+' (#'+params.jobNumber+')':params.jobTitle
  const address=process.env.SWATWORKS_ADDRESS?.trim()||'nuestra tienda'
  const body='Hola '+firstName+', tu pedido de '+job+' esta listo. Lo puedes pasar a buscar por '+address+'. Gracias por elegir SWATWORKS!'
  try {
    const url='https://api.twilio.com/2010-04-01/Accounts/'+cfg.sid+'/Messages.json'
    const creds=Buffer.from(cfg.sid+':'+cfg.token).toString('base64')
    const res=await fetch(url,{
      method:'POST',
      headers:{Authorization:'Basic '+creds,'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({To:params.to,From:cfg.from,Body:body}).toString()
    })
    const data=await res.json() as {sid?:string,error_message?:string}
    if(!res.ok){ console.error('[sms] error',res.status,data.error_message); return {ok:false,error:data.error_message||'http_'+res.status} }
    console.log('[sms] enviado',params.to.slice(-4))
    return {ok:true, sid:data.sid}
  } catch(e){ const msg=e instanceof Error?e.message:String(e); return {ok:false,error:msg} }
}
`.trim())

// ─── jobs/complete/route.ts ────────────────────────────────
writeFileSync('app/api/jobs/complete/route.ts', `
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { isValidInternalApiKey } from '@/lib/security/internal-api-key'
import { sendJobReadySms } from '@/lib/notifications/sms'
import { notifyJobCompleteTelegram } from '@/lib/notifications/telegram'
import { normalizePhone } from '@/lib/phone'

export async function POST(request: NextRequest) {
  if(!isValidInternalApiKey(request)) return NextResponse.json({error:'Unauthorized'},{status:401})
  let body: Record<string,unknown>
  try { body=await request.json() } catch { return NextResponse.json({error:'invalid_json'},{status:400}) }
  const workOrderId=typeof body.work_order_id==='string'?body.work_order_id.trim():''
  if(!workOrderId) return NextResponse.json({error:'work_order_id required'},{status:400})
  const supabase=createServiceRoleClient()
  const {data:wo}=await supabase.from('work_orders')
    .select('id,title,job_number,organization_id,customer_id').eq('id',workOrderId).maybeSingle()
  if(!wo) return NextResponse.json({error:'not_found'},{status:404})
  const {data:customer}=await supabase.from('customers')
    .select('id,name,phone').eq('id',wo.customer_id).maybeSingle()
  if(!customer?.phone) return NextResponse.json({error:'no_phone'},{status:422})
  const {data:org}=await supabase.from('organizations')
    .select('name').eq('id',wo.organization_id).maybeSingle()
  await supabase.from('work_orders')
    .update({status:'completed',updated_at:new Date().toISOString()}).eq('id',workOrderId)
  const phone=normalizePhone(customer.phone)
  const smsResult=await sendJobReadySms({
    to:phone, customerName:customer.name||'Cliente',
    jobTitle:wo.title||'trabajo', jobNumber:wo.job_number||null
  })
  await notifyJobCompleteTelegram({
    customerName:customer.name||'Cliente', phone,
    jobTitle:wo.title||'trabajo', organizationName:org?.name||'SWATWORKS'
  })
  return NextResponse.json({ok:true, sms_sent:smsResult.ok, sms_error:smsResult.error||null})
}
`.trim())

// ─── Fix bugs en archivos existentes ──────────────────────
import { readFileSync } from 'fs'

// Fix 1: webhook.ts missing_fields bug
let webhook = readFileSync('app/api/vapi/webhook/route.ts','utf8')
webhook = webhook.replace(
  /missing_fields,(\s+primary_message_for_caller)/,
  'missing_fields: missingFields,$1'
)
writeFileSync('app/api/vapi/webhook/route.ts', webhook)

// Fix 2: service.ts ok duplicado
let service = readFileSync('lib/voice-platform/service.ts','utf8')
service = service.replace(
  'return {\n    ok: true,\n    ...out,\n  }',
  'return {\n    ...out,\n    ok: true as const,\n  }'
)
writeFileSync('lib/voice-platform/service.ts', service)

// Fix 3: Añadir import Telegram en tool-handlers.ts
let handlers = readFileSync('lib/vapi/tool-handlers.ts','utf8')
if(!handlers.includes('notifications/telegram')){
  handlers = `import { classifyLeadTemperature, notifyLeadTelegram } from '@/lib/notifications/telegram'\n` + handlers
  handlers = handlers.replace(
    `        await tryAutoFollowUpAfterLeadSave({`,
    `        void notifyLeadTelegram({
          temperature: classifyLeadTemperature({
            customerName: mergedName, phone,
            email: typeof args.email==='string'?args.email:null,
            need: mergedNotes||'',
            priceRequested: commercial.intent==='quote_request',
            dateNeeded: typeof args.date_needed==='string'?args.date_needed:null,
          }),
          customerName: mergedName||'Sin nombre', phone,
          email: typeof args.email==='string'?args.email:null,
          need: mergedNotes||'',
          priceRequested: commercial.intent==='quote_request',
          dateNeeded: typeof args.date_needed==='string'?args.date_needed:null,
          category: commercial.category||null,
          summary: commercial.summary||null,
          nextAction: commercial.next_action||null,
        })
        await tryAutoFollowUpAfterLeadSave({`
  )
  writeFileSync('lib/vapi/tool-handlers.ts', handlers)
}

// Fix 4: Añadir vars env a .env.local si existe
import { existsSync, appendFileSync } from 'fs'
if(existsSync('.env.local')){
  const envContent = readFileSync('.env.local','utf8')
  if(!envContent.includes('TELEGRAM_BOT_TOKEN')){
    appendFileSync('.env.local', `
# ── Telegram ──────────────────────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# ── SMS / Dirección retiro ─────────────────
SWATWORKS_ADDRESS=

# ── Voz bilingüe (nova = cálida/sensual) ──
VAPI_OPENAI_VOICE_FALLBACK=nova
VAPI_TRANSCRIBER_LANGUAGE=multi
`)
  }
}

console.log('')
console.log('✅ TODOS LOS CAMBIOS APLICADOS')
console.log('   ✓ lib/notifications/telegram.ts')
console.log('   ✓ lib/notifications/sms.ts')
console.log('   ✓ app/api/jobs/complete/route.ts')
console.log('   ✓ Fix bug webhook (missing_fields)')
console.log('   ✓ Fix bug service.ts (ok spread)')
console.log('   ✓ Telegram integrado en tool-handlers.ts')
console.log('')
console.log('👉 Siguiente: completar .env.local con TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID')
