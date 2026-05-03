import type { TransferDestination } from '@/lib/vapi/transfer-destinations'
import { transferDestinationsSummary } from '@/lib/vapi/transfer-destinations'

type PromptInput = {
  basePrompt: string
  fallbackMessage: string
  hasCatalog: boolean
  hasTransferPhone: boolean
  transferDestinations?: TransferDestination[]
}

function transferRoutingRules(destinations: TransferDestination[]): string[] {
  if (destinations.length === 0) {
    return [
      'Si piden persona humana: (1) prepare_warm_transfer con customer_name, order_number (si hay), intent y short_summary; (2) si ok, transfer_to_ramon.',
    ]
  }
  if (destinations.length === 1) {
    const d = destinations[0]
    return [
      `Solo hay una línea de transferencia: ${d.extension ? `interno ${d.extension} — ` : ''}${d.name}.`,
      'Antes de transferir: (1) prepare_warm_transfer incluyendo transfer_extension o transfer_department si el cliente lo mencionó (opcional con un solo destino); (2) transfer_to_ramon.',
    ]
  }
  const list = destinations
    .map((d) =>
      d.extension
        ? `- Interno ${d.extension}: ${d.name}`
        : `- ${d.name}`,
    )
    .join('\n')
  return [
    'Hay varias áreas/personas con transferencia. Lista interna (usala para enrutar según lo que diga el cliente):',
    list,
    'Si el cliente no aclaró a quién llamar, preguntá una sola vez ofreciendo las opciones por nombre (y el interno si ayuda).',
    'Cuando sepas el destino, en prepare_warm_transfer enviá obligatoriamente transfer_department (nombre del área o persona) o transfer_extension (número interno, ej. 90).',
    'Después de prepare_warm_transfer ok, llamá transfer_to_ramon.',
  ]
}

export function buildSystemPrompt(input: PromptInput): string {
  const dest = input.transferDestinations || []
  const routingExtra =
    input.hasTransferPhone && dest.length > 0
      ? `\nTransferencias internas:\n${transferDestinationsSummary(dest)}.`
      : ''

  const policy = [
    'Nunca inventes precios, fechas ni estados.',
    'Cliente existente vs nuevo (seguí este orden; no contradigas reglas posteriores):',
    '(1) Si preguntan por el estado de un pedido u orden: llamá de inmediato a get_job_status (nunca get_client_status) con organization_id = UUID de esta organización y phone en E.164 (del llamante o contexto). No pidas nombre, teléfono ni ningún dato antes. Al hablar con el cliente, usá exactamente el texto primary_message_for_caller.',
    '(2) Si get_job_status devuelve found true: el cliente es existente para este fin. No pidas nombre, teléfono ni motivo salvo que el cliente pida otro trámite distinto del estado.',
    '(3) Si get_job_status devuelve found false (sin pedido / not_found): tratá al cliente como nuevo. Pedí nombre, teléfono y motivo de la llamada (una pregunta por turno); cuando los tengas, llamá save_lead_info.',
    '(4) Si la consulta no es sobre estado de pedido: no llames get_job_status hasta que el cliente lo pida. Para cotizar, agendar o transferir, si aún no tenés nombre, teléfono y motivo confirmados, pedilos (una pregunta por turno) y luego save_lead_info cuando corresponda.',
    'Obligatorio: si le decís al cliente que alguien del equipo lo va a contactar, que le mandarán presupuesto/cotización, o que lo llaman en un plazo (ej. 24 horas), antes de despedirte llamá create_follow_up con title, notes (pedido + datos), due_at en ISO-8601 (ej. mañana misma hora) y callback_required true. No prometas seguimiento sin ejecutar esa herramienta.',
    'Si no existe dato en base, dilo claramente y ofrece seguimiento.',
    'Si el caller falla validacion dos veces, corta escalado y marca spam_or_invalid.',
    input.hasCatalog
      ? 'Para precios usa get_price_quote (service_name) o get_product_price (product_name): solo datos devueltos por la herramienta. Si must_confirm_price_with_team es true, un miembro del equipo debe confirmar.'
      : 'No hay catalogo cargado; no intentes cotizar.',
    'get_job_status: usá organization_id de esta organización; opcionalmente job_number u order_number si el cliente los menciona; si la respuesta lista varios jobs, usá primary_message_for_caller del primero o pedí aclaración.',
    ...(input.hasTransferPhone
      ? [
          ...transferRoutingRules(dest),
          'El operador recibe warm transfer con el contexto. Si la transferencia falla o vuelve al bot, ofrece callback y create_follow_up.',
        ]
      : ['Si no hay linea de transferencia, ofrece callback y create_follow_up.']),
    'Conversation style requirements (mandatory): keep replies very brief; one short sentence at a time; ask one question at a time; no filler; conversational but professional.',
  ]
  return `${input.basePrompt}${routingExtra}\n\nReglas operativas:\n- ${policy.join('\n- ')}\n\nFallback: ${input.fallbackMessage}`
}
