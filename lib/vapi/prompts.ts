import type { TransferDestination } from '@/lib/vapi/transfer-destinations'
import { transferDestinationsSummary } from '@/lib/vapi/transfer-destinations'

type PromptInput = {
  basePrompt: string
  fallbackMessage: string
  hasCatalog: boolean
  hasTransferPhone: boolean
  transferDestinations?: TransferDestination[]
  /** UUID del tenant: se inyecta en reglas de get_job_status para que el modelo no invente el valor. */
  organizationId?: string
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

  const orgId = input.organizationId?.trim()
  const jobStatusOrgLine = orgId
    ? `(1) Si el cliente pregunta por el estado de su pedido u orden: el primer paso exacto es llamar get_job_status de inmediato. Prohibido llamar find_customer antes de get_job_status para ese fin. No pidas nombre, teléfono ni datos antes. Podés invocar get_job_status sin argumentos o solo con job_number u order_number si el cliente los menciona. No inventes organization_id: si la herramienta lo acepta vacío, omití ese argumento; el backend usa ${orgId} desde configuración. Respondé al cliente solo con primary_message_for_caller.`
    : '(1) Si el cliente pregunta por el estado de su pedido u orden: el primer paso exacto es get_job_status de inmediato. Prohibido find_customer antes de get_job_status para ese fin. No pidas nombre ni teléfono antes. No inventes organization_id: omitilo si la tool lo permite; el backend lo resuelve desde configuración. Respondé solo con primary_message_for_caller.'

  const policy = [
    'Nunca inventes precios, fechas ni estados.',
    'Cliente existente vs nuevo (seguí este orden; no contradigas reglas posteriores):',
    jobStatusOrgLine,
    '(2) Si get_job_status devuelve found true: el cliente es existente para este fin. No pidas nombre, teléfono ni motivo salvo que el cliente pida otro trámite distinto del estado.',
    '(3) Si get_job_status devuelve found false (sin pedido / not_found): tratá al cliente como nuevo. Pedí nombre, teléfono y motivo de la llamada (una pregunta por turno); cuando los tengas, llamá save_lead_info.',
    '(4) Si la consulta no es sobre estado de pedido: no llames get_job_status hasta que el cliente lo pida. Para cotizar, agendar o transferir, si aún no tenés nombre, teléfono y motivo confirmados, pedilos (una pregunta por turno) y luego save_lead_info cuando corresponda.',
    'Obligatorio: si le decís al cliente que alguien del equipo lo va a contactar, que le mandarán presupuesto/cotización, o que lo llaman en un plazo (ej. 24 horas), antes de despedirte llamá create_follow_up con title, notes (pedido + datos), due_at en ISO-8601 (ej. mañana misma hora) y callback_required true. No prometas seguimiento sin ejecutar esa herramienta.',
    'Si no existe dato en base, dilo claramente y ofrece seguimiento.',
    'Si el caller falla validacion dos veces, corta escalado y marca spam_or_invalid.',
    input.hasCatalog
      ? 'Para precios usa get_price_quote (service_name) o get_product_price (product_name): solo datos devueltos por la herramienta. Si must_confirm_price_with_team es true, un miembro del equipo debe confirmar.'
      : 'No hay catalogo cargado; no intentes cotizar.',
    orgId
      ? `get_job_status: no llames find_customer solo para consultar estado. organization_id y phone son opcionales en la tool; backend usa ${orgId} y el Caller ID. No inventes UUID. Opcional: job_number u order_number. Varias órdenes: primary_message_for_caller del primero o aclaración.`
      : 'get_job_status: sin find_customer antes para estado de pedido. Omití organization_id y phone si la tool lo permite; el backend los resuelve. Opcional: job_number u order_number.',
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
