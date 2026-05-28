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
    organizationId: wo.organization_id,
    customerName: customer.name || 'Cliente',
    phone,
    jobTitle: wo.title || 'trabajo',
    organizationName: org?.name || 'SWATWORKS',
  })
  return NextResponse.json({ok:true, sms_sent:smsResult.ok, sms_error:smsResult.error||null})
}