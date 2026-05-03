import type { TransferDestination } from '@/lib/vapi/transfer-destinations'
import { transferDestinationsSummary } from '@/lib/vapi/transfer-destinations'

/** Frase única para comprobar en logs/GET de Vapi que el prompt sincronizado es el nuevo. */
export const JOB_STATUS_SYNC_VERIFICATION_PHRASE =
  'omite phone si no lo ves; el backend intentará extraerlo del payload de Vapi'

type PromptInput = {
  basePrompt: string
  fallbackMessage: string
  hasCatalog: boolean
  hasTransferPhone: boolean
  transferDestinations?: TransferDestination[]
  /** UUID del tenant (solo para reglas internas; el modelo no debe inventar organization_id). */
  organizationId?: string
}

/**
 * Quita del system_prompt guardado en DB instrucciones viejas que contradicen get_job_status opcional.
 * El sync concatena basePrompt + Reglas operativas; si el base repite "organization_id = UUID…", el modelo prioriza eso.
 */
export function sanitizeAssistantBasePromptForSync(base: string): {
  cleaned: string
  removedLabels: string[]
} {
  let t = base
  const removedLabels: string[] = []

  const steps: Array<{ label: string; replace: (s: string) => string }> = [
    {
      label: 'organization_id_uuid_esta_org_line',
      replace: (s) =>
        s.replace(
          /^\s*[^\n]*organization_id\s*=\s*UUID\s+de\s+esta\s+organizaci[oó]n[^\n]*\n?/gim,
          '',
        ),
    },
    {
      label: 'uuid_de_esta_organizacion',
      replace: (s) => s.replace(/UUID\s+de\s+esta\s+organizaci[oó]n/gi, ''),
    },
    {
      label: 'get_job_status_obliga_phone_e164_line',
      replace: (s) =>
        s.replace(
          /^\s*[^\n]*(get_job_status|estado\s+(del\s+)?pedido)[^\n]*(phone|tel[eé]fono)[^\n]*(E\.?164|obligatorio|siempre|debes)[^\n]*\n?/gim,
          '',
        ),
    },
  ]

  for (const { label, replace } of steps) {
    const before = t
    t = replace(t)
    if (t !== before) removedLabels.push(label)
  }

  t = t.replace(/\n{3,}/g, '\n\n').trim()
  return { cleaned: t, removedLabels }
}

export function extractReglasOperativasFragment(full: string): string {
  const start = full.indexOf('Reglas operativas:')
  if (start === -1) return full.length > 1200 ? `${full.slice(0, 1200)}…` : full
  const end = full.indexOf('\n\nFallback:', start)
  const block = end === -1 ? full.slice(start) : full.slice(start, end)
  return block.length > 1800 ? `${block.slice(0, 1800)}…` : block
}

export function auditSystemPromptForSync(full: string): {
  hasVerificationPhrase: boolean
  forbiddenHits: string[]
  reglasFragment: string
} {
  const forbidden: Array<{ id: string; test: (s: string) => boolean }> = [
    { id: 'uuid_esta_organizacion', test: (s) => /UUID\s+de\s+esta\s+organizaci/i.test(s) },
    { id: 'organization_id_equals_uuid', test: (s) => /organization_id\s*=\s*UUID/i.test(s) },
  ]
  return {
    hasVerificationPhrase: full.includes(JOB_STATUS_SYNC_VERIFICATION_PHRASE),
    forbiddenHits: forbidden.filter((f) => f.test(full)).map((f) => f.id),
    reglasFragment: extractReglasOperativasFragment(full),
  }
}

export function extractRawSystemPromptFromVapiAssistant(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const rec = payload as Record<string, unknown>
  const model = rec.model
  if (!model || typeof model !== 'object') return null
  const m = model as Record<string, unknown>
  if (typeof m.systemPrompt === 'string') return m.systemPrompt
  if (typeof m.system_prompt === 'string') return m.system_prompt
  return null
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
    ? `(1) Estado de pedido u orden: llamá de inmediato a get_job_status. Nunca llames find_customer antes para ese caso. No pidas nombre, teléfono ni ningún dato antes. No inventes organization_id. Omití phone en la tool si no lo tenés; ${JOB_STATUS_SYNC_VERIFICATION_PHRASE}. El backend resuelve organization_id desde configuración (no lo escribas ni lo pidas al cliente). Podés pasar solo job_number u order_number si el cliente los dijo. Respondé al cliente solo con primary_message_for_caller.`
    : `(1) Estado de pedido u orden: llamá de inmediato a get_job_status. Nunca find_customer antes para ese caso. No pidas nombre, teléfono ni ningún dato antes. No inventes organization_id. Omití phone si no lo tenés; ${JOB_STATUS_SYNC_VERIFICATION_PHRASE}. El backend resuelve organization_id desde configuración. Respondé solo con primary_message_for_caller.`

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
      ? `get_job_status: sin find_customer antes solo por estado. parameters.required debe tratarse como vacío: no pidas phone ni organization_id al cliente. Backend usa org configurada y Caller ID. No inventes UUID. Opcional: job_number u order_number. Varias órdenes: primary_message_for_caller del primero o aclaración.`
      : 'get_job_status: sin find_customer antes solo por estado. No pidas phone ni organization_id; el backend los resuelve. Opcional: job_number u order_number.',
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
