import { NextRequest, NextResponse } from 'next/server'
import { createRecado, searchTrabajos } from '@/lib/mvp/repository'
import { detectIntent } from '@/lib/mvp/intents'
import { gather, say, voiceResponse, dial } from '@/lib/twilio/twiml'
import { normalizePhone } from '@/lib/phone'

function extractText(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTrabajoNumber(raw: string): string {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9\-]/g, '')
}

function formatDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function menuPrompt(): string {
  return 'Hola. Soy el asistente de imprenta. Puedes decir: estado de trabajo, fecha de entrega, dejar un recado, o hablar con una persona.'
}

function twiml(xml: string): NextResponse {
  return new NextResponse(xml, { headers: { 'content-type': 'text/xml; charset=utf-8' } })
}

export async function POST(request: NextRequest) {
  const step = request.nextUrl.searchParams.get('step') || 'menu'
  const attempts = Number(request.nextUrl.searchParams.get('attempts') || '0')
  const intentHint = request.nextUrl.searchParams.get('intent')
  const organizationId = request.nextUrl.searchParams.get('organization_id') || null

  const form = await request.formData()
  const fromPhoneRaw = extractText(form, 'From')
  const fromPhone = normalizePhone(fromPhoneRaw)
  const speech = extractText(form, 'SpeechResult')
  const digits = extractText(form, 'Digits')
  const forwardNumber = process.env.TWILIO_FORWARD_NUMBER || ''

  if (step === 'menu') {
    const utterance = speech || digits
    if (!utterance) {
      const xml = voiceResponse([
        gather({
          action: `/api/twilio/voice/incoming?step=menu&attempts=${attempts}`,
          say: menuPrompt(),
        }),
        say('No recibimos respuesta. Gracias por llamar.'),
      ])
      return twiml(xml)
    }

    const intentRes = detectIntent(utterance, attempts)
    if (intentRes.intent === 'hablar_humano') {
      if (forwardNumber) {
        return twiml(voiceResponse([say('Te transfiero con una persona de nuestro equipo.'), dial(forwardNumber)]))
      }
      if (fromPhone) {
        await createRecado({
          organizationId,
          telefono: fromPhone,
          mensaje: 'Cliente solicita hablar con persona.',
          destinatario: 'Atencion al cliente',
          callback_required: true,
          origen_llamada: 'twilio',
          urgencia: 'alta',
        })
      }
      return twiml(voiceResponse([say('Ahora no hay un agente disponible. Ya registramos tu callback. Te contactamos a la brevedad.')]))
    }

    if (intentRes.intent === 'dejar_recado') {
      return twiml(
        voiceResponse([
          gather({
            action: '/api/twilio/voice/incoming?step=leave_message',
            say: 'Perfecto. Por favor deja tu recado después del tono.',
            input: 'speech',
            timeout: 6,
          }),
          say('No pudimos tomar el recado. Inténtalo nuevamente más tarde.'),
        ]),
      )
    }

    if (intentRes.intent === 'consultar_estado' || intentRes.intent === 'consultar_entrega') {
      return twiml(
        voiceResponse([
          gather({
            action: `/api/twilio/voice/incoming?step=ask_job_number&intent=${intentRes.intent}${organizationId ? `&organization_id=${organizationId}` : ''}`,
            say: 'Indícame tu número de trabajo. Si no lo tienes, di continuar para buscar por teléfono.',
            input: 'speech dtmf',
            timeout: 6,
          }),
          say('No recibimos el número de trabajo. Gracias por llamar.'),
        ]),
      )
    }

    if (intentRes.fallback) {
      return twiml(
        voiceResponse([
          gather({
            action: '/api/twilio/voice/incoming?step=leave_message',
            say: 'No logré entenderte. Te tomo un recado para que te contactemos.',
            input: 'speech',
            timeout: 6,
          }),
        ]),
      )
    }

    return twiml(
      voiceResponse([
        gather({
          action: `/api/twilio/voice/incoming?step=menu&attempts=${intentRes.attempts}`,
          say: 'No te entendí. Puedes decir estado, entrega, recado o humano.',
        }),
      ]),
    )
  }

  if (step === 'ask_job_number') {
    const rawNumber = normalizeTrabajoNumber(speech || digits)
    const intent = intentHint === 'consultar_entrega' ? 'consultar_entrega' : 'consultar_estado'
    const result = await searchTrabajos({
      numero: rawNumber || undefined,
      telefono: rawNumber ? undefined : fromPhone,
      organizationId,
    })

    if (!result.matches.length) {
      return twiml(
        voiceResponse([
          gather({
            action: '/api/twilio/voice/incoming?step=leave_message',
            say: 'No encontramos tu trabajo. Si quieres, deja un recado y te llamamos.',
            input: 'speech',
            timeout: 6,
          }),
        ]),
      )
    }

    if (result.ambiguous) {
      return twiml(
        voiceResponse([
          gather({
            action: `/api/twilio/voice/incoming?step=ask_job_number&intent=${intent}${organizationId ? `&organization_id=${organizationId}` : ''}`,
            say: 'Encontramos varios trabajos con ese teléfono. Por favor dicta el número de trabajo.',
            input: 'speech dtmf',
            timeout: 6,
          }),
        ]),
      )
    }

    const t = result.matches[0] as Record<string, unknown>
    const numeroTrabajo = String(t.numero_trabajo || '')
    const estado = String(t.estado || 'sin estado')
    const fechaConfirmada = formatDate((t.fecha_entrega_confirmada as string | null) || null)
    const fechaEstimada = formatDate((t.fecha_entrega_estimada as string | null) || null)

    let answer = `Trabajo ${numeroTrabajo}. Estado actual: ${estado}.`
    if (intent === 'consultar_entrega') {
      if (fechaConfirmada) {
        answer += ` Fecha de entrega confirmada: ${fechaConfirmada}.`
      } else if (fechaEstimada) {
        answer += ` Aún no hay entrega confirmada. La fecha estimada es ${fechaEstimada}.`
      } else {
        answer += ' Aún no hay fecha de entrega confirmada.'
      }
    }

    return twiml(voiceResponse([say(answer), say('¿Necesitas algo más? Puedes volver a llamar cuando gustes. Gracias.')]))
  }

  if (step === 'leave_message') {
    const message = speech || digits
    if (!message) {
      return twiml(
        voiceResponse([
          gather({
            action: '/api/twilio/voice/incoming?step=leave_message',
            say: 'No escuché el recado. Puedes repetirlo ahora.',
            input: 'speech',
            timeout: 6,
          }),
          say('No pudimos registrar el recado. Gracias por llamar.'),
        ]),
      )
    }

    if (fromPhone) {
      await createRecado({
        organizationId,
        telefono: fromPhone,
        mensaje: message,
        callback_required: true,
        urgencia: 'normal',
        origen_llamada: 'twilio',
      })
    }

    return twiml(voiceResponse([say('Listo, tu recado quedó registrado. Te contactaremos a la brevedad. Gracias por llamar.')]))
  }

  return twiml(voiceResponse([say('Ruta no válida.'), say('Gracias por llamar.')]))
}
