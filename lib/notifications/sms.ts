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