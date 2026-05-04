import type { TransferDestination } from '@/lib/vapi/transfer-destinations'
import { transferDestinationsSummary } from '@/lib/vapi/transfer-destinations'

/** Frase única para comprobar en logs/GET de Vapi que el prompt sincronizado es el nuevo. */
export const JOB_STATUS_SYNC_VERIFICATION_PHRASE =
  'Omite phone si no lo ves; el backend extrae phone del payload de Vapi.'

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
      label: 'organization_id_uuid_phrase_inline',
      replace: (s) =>
        s.replace(/organization_id\s*=\s*UUID\s+de\s+esta\s+organizaci[oó]n/gi, ''),
    },
    {
      label: 'uuid_de_esta_organizacion',
      replace: (s) => s.replace(/UUID\s+de\s+esta\s+organizaci[oó]n/gi, ''),
    },
    {
      label: 'organization_id_con_organizationid_uuid_phone',
      replace: (s) =>
        s.replace(
          /^\s*[^\n]*OrganizationID[^\n]*UUID[^\n]*(phone|tel[eé]fono|E\.?164)?[^\n]*\n?/gim,
          '',
        ),
    },
    {
      label: 'legacy_get_job_status_org_phone_line',
      replace: (s) =>
        s.replace(
          /^\s*[^\n]*\b(get_job_status|Get Job Status|estado\s+(del\s+)?pedido)[^\n]*(organization_id|OrganizationID|UUID)[^\n]*(phone|tel[eé]fono|E\.?164)[^\n]*\n?/gim,
          '',
        ),
    },
    {
      label: 'get_job_status_obliga_phone_e164_line',
      replace: (s) =>
        s.replace(
          /^\s*[^\n]*(get_job_status|estado\s+(del\s+)?pedido)[^\n]*(phone|tel[eé]fono)[^\n]*(E\.?164|obligatorio|siempre|debes|requerido)[^\n]*\n?/gim,
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
    {
      id: 'organizationid_uuid_phone_e164',
      test: (s) =>
        /OrganizationID/i.test(s) &&
        /UUID/i.test(s) &&
        /(phone|tel[eé]fono|E\.?164)/i.test(s),
    },
  ]
  return {
    hasVerificationPhrase: full.includes(JOB_STATUS_SYNC_VERIFICATION_PHRASE),
    forbiddenHits: forbidden.filter((f) => f.test(full)).map((f) => f.id),
    reglasFragment: extractReglasOperativasFragment(full),
  }
}

/** Limpia FAQs que repiten instrucciones viejas de get_job_status (solo patrones muy concretos). */
export function sanitizeFaqTextForSync(text: string): string {
  let t = text
  t = t.replace(/organization_id\s*=\s*UUID\s+de\s+esta\s+organizaci[oó]n/gi, '')
  t = t.replace(/UUID\s+de\s+esta\s+organizaci[oó]n/gi, '')
  t = t.replace(/\bOrganizationID\b[^.]*UUID[^.]*(phone|E\.?164)[^.]*\./gi, '')
  return t.replace(/\s{2,}/g, ' ').trim()
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
      'Transferencia: confirmá con el cliente a quién o qué área busca (una pregunta corta si hace falta).',
      'Luego (1) prepare_warm_transfer con customer_name, order_number (si hay), intent y short_summary; (2) si la herramienta responde ok, transfer_to_ramon.',
    ]
  }
  if (destinations.length === 1) {
    const d = destinations[0]
    return [
      `Solo hay una línea de transferencia: ${d.extension ? `interno ${d.extension} — ` : ''}${d.name}.`,
      'Confirmá en voz alta que ese es el destino si hubo ambigüedad.',
      'Orden: (1) prepare_warm_transfer (transfer_extension o transfer_department según corresponda); (2) si ok, transfer_to_ramon.',
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
    'Si el cliente no aclaró a quién llamar, preguntá una sola vez: en español: «¿Querés hablar con Diseño, Administración, Producción, CNC o Ramón?»; en inglés: «Would you like Design, Administration, Production, CNC, or Ramon?» (adaptá la lista si algún nombre no está en la lista anterior).',
    'Confirmá el destino elegido antes de llamar herramientas.',
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

  const transferClearDestinationRule =
    input.hasTransferPhone && dest.length > 0
      ? [
          'Transferencia con destino claro (prioridad sobre captura de lead): si el cliente pide hablar con un área o rol que coincide con la lista de transferencias (por ejemplo «diseño gráfico», «diseñador gráfico», «Diseño», «Administración», etc.), NO pidas nombre ni teléfono primero. Respondé en una frase breve: «Claro, te comunico con Diseño.» (adaptá el nombre del área) y llamá enseguida prepare_warm_transfer con transfer_extension y/o transfer_department según corresponda, luego transfer_to_ramon. Reglas de internos: si dice «diseño gráfico» o equivalente, preferí interno 105 (Fernando / diseño gráfico) si existe en la lista; si solo dice «Diseño» o el área genérica de diseño sin «gráfico», usá interno 90. Si prepare_warm_transfer o la transferencia falla, recién ahí pedí nombre y teléfono, usá save_lead_info y create_follow_up con el motivo transferencia fallida.',
        ]
      : []

  const orgId = input.organizationId?.trim()
  const jobStatusOrgLine = `(1) Si preguntan por estado de pedido u orden, llamá inmediatamente get_job_status. No llames find_customer antes. No pidas nombre, teléfono ni datos antes. No inventes organization_id. ${JOB_STATUS_SYNC_VERIFICATION_PHRASE} El backend resuelve organization_id desde configuración. Opcional en la tool: job_number u order_number si el cliente los dijo. Respondé al cliente solo con primary_message_for_caller.`

  const policy = [
    'Rol: secretaria comercial 24/7 (no solo filtrar llamadas): atendés con intención clara, idioma estable, cotizás desde catálogo con tools, registrás leads accionables y seguimientos visibles para el equipo.',
    'Nunca inventes precios, fechas ni estados.',
    'Flujo ideal de la llamada: detectá intención → resolvé con la tool adecuada si alcanza → si no se puede resolver solo con herramientas, tomá datos mínimos → save_lead_info (con clasificación comercial en los parámetros que correspondan) → create_follow_up cuando aplique (obligatorio en varios casos; ver más abajo) → confirmá el próximo paso y despedite.',
    'Cliente existente vs nuevo (seguí este orden; no contradigas reglas posteriores):',
    jobStatusOrgLine,
    '(2) Si get_job_status devuelve found true y hay pedido claro: el cliente es existente para este fin. No pidas nombre, teléfono ni motivo salvo que pida otro trámite distinto del estado.',
    '(3) Cliente nuevo (misma rama si get_job_status devuelve found false, not_found, no hay pedido, o el mensaje indica que no se encontró pedido). Si el cliente pidió transferencia a un área concreta y ya aplica la regla «transferencia con destino claro», no sigas este orden hasta intentar prepare_warm_transfer. En los demás casos: una pregunta por turno, en este orden: (a) nombre y apellido (podés pedir ambos en una sola pregunta), (b) teléfono de contacto si no tenés Caller ID confiable, (c) qué necesita o en qué podés ayudarlo. No llames save_lead_info hasta tener nombre y apellido, teléfono (o Caller ID) y necesidad claros, salvo que el cliente corte o se niegue a dar datos. Cuando tengas esos datos, llamá save_lead_info pasando siempre que puedas: full_name o name, phone, need o motivo, y además category, intent, priority, estimated_value_level, summary, next_action, source="vapi_call". Para wrap vehicular usá category=wrap, intent=quote_request, priority=high, estimated_value_level=high, callback_required=true, summary y next_action concretos (ver reglas wrap). Si prometés contacto humano, cotización formal o devolución de llamada, antes de despedirte llamá create_follow_up (title, notes, due_at ISO-8601, priority, callback_required, category alineada al lead); el backend también puede crear seguimiento automático tras guardar lead si aplica.',
    '(4) Si la consulta no es sobre estado de pedido: no llames get_job_status hasta que el cliente lo pida. Para cotizar, agendar o transferir, si faltan datos de (3), pedilos una cosa por turno y luego save_lead_info cuando corresponda.',
    'Promesas: nunca digas que lo van a llamar, mandar presupuesto o hacer seguimiento sin haber ejecutado create_follow_up en ese mismo flujo antes de cerrar. Si create_follow_up falla (ok false), no digas que quedó agendado; ofrecé reintentar o dejar constancia verbal sin mentir.',
    'create_follow_up obligatorio cuando: pedido de cotización, pide que lo llamen, prometés contacto o cotización, no hay precio confirmado del catálogo, oportunidad de alto valor, transferencia fallida, o categoría wrap. Para wrap: siempre create_follow_up además de save_lead_info (prioridad high, callback_required true, due_at hoy o mañana ISO-8601, notas con nombre, teléfono, vehículo si se sabe, resumen). Para Business Cards: si solo diste precio y el cliente no pidió contacto ni cotización formal, el follow-up puede omitirse; si pidió cotización o contacto, creá follow-up.',
    'Si no existe dato en base, dilo claro y ofrecé seguimiento con herramientas (lead y/o follow-up), no inventes.',
    'Si el caller falla validacion dos veces, corta escalado y marca spam_or_invalid.',
    input.hasCatalog
      ? 'Cotización o precio: prohibido decir "no pude cotizar", "no tengo precio" o excusas sin haber llamado antes get_product_price (product_name) o get_price_quote (service_name) con lo que dijo el cliente (incluso si es vago: probá con lo que tengas). Solo después de la respuesta de la tool podés hablar de precio o de falta de match. Los montos salen solo de la tool/DB; no hardcodees precios en voz. Si la tool devuelve varias variantes del mismo producto (lista en quotes con nombres y precios del catálogo), ofrecelas todas con nombre y monto exactos de quotes y una sola pregunta por turno para que elija; no inventes variantes ni precios. Business Cards (BC, tarjetas de presentación, tarjetas de visita, etc.): si dice "BC" sin cantidad, la tool debe listar variantes reales del catálogo; si ya hablaron de BC y dice "las 500", "500", "quinientas" o "five hundred", interpretá Business Cards - 500 y confirmá precio con la tool. Si la tool dice found false o must_confirm_price_with_team: decí "No tengo un precio confirmado para eso. Te tomo los datos y el equipo te envía una cotización." Luego save_lead_info y create_follow_up si prometés envío o contacto. No inventes cifra.'
      : 'No hay catalogo cargado; no intentes cotizar con cifras; ofrecé que un humano lo contacte y usá save_lead_info + create_follow_up si aplica.',
    orgId
      ? `get_job_status: sin find_customer antes solo por estado. parameters.required debe tratarse como vacío: no pidas phone ni organization_id al cliente. Backend usa org configurada y Caller ID. No inventes UUID. Opcional: job_number u order_number. Varias órdenes: primary_message_for_caller del primero o aclaración.`
      : 'get_job_status: sin find_customer antes solo por estado. No pidas phone ni organization_id; el backend los resuelve. Opcional: job_number u order_number.',
    ...(input.hasTransferPhone
      ? [
          ...transferClearDestinationRule,
          ...transferRoutingRules(dest),
          'El operador recibe warm transfer con el contexto. Si prepare_warm_transfer o transfer_to_ramon falla o la llamada vuelve al bot, decí que no pudiste transferir, pedí nombre y teléfono si faltan, y usá save_lead_info + create_follow_up antes de cerrar.',
        ]
      : ['Si no hay linea de transferencia, ofrece callback y create_follow_up.']),
    'Experiencia del cliente: respuestas muy breves; una pregunta por turno; sin relleno. Antes de despedirte, confirmá en una frase lo registrado (nombre, teléfono, necesidad o próximo paso) cuando hayas usado save_lead_info o follow-up.',
    'Identidad y tono: actuá como secretaria bilingüe español/inglés, mujer, profesional y clara; la síntesis de voz en Vapi debe sonar femenina y natural (no mezclar acentos raros entre idiomas).',
    'Reglas de idioma y voz: detectá el idioma principal del cliente al inicio. Si habla español, respondé en español; si habla inglés, respondé en inglés. No mezclés idiomas salvo que el cliente lo haga o pida traducción. Mantené el mismo idioma durante la llamada salvo cambio claro del cliente. No cambies a inglés solo porque un producto tenga nombre en inglés (Business Cards, wrap): mantené el idioma de la llamada; el nombre del producto puede quedar en inglés con explicación en el idioma del cliente (ej. español: "Perfecto, te tomo los datos para una cotización de wrap vehicular."). Si no entendés si dijo "wrap" u otra palabra (p. ej. suena "rap"), no cambies de idioma: en español preguntá "¿Te referís a un wrap vehicular o rotulación para un vehículo?"; en inglés "Do you mean a vehicle wrap or vehicle graphics?".',
    'Wrap / rotulación vehicular: tratá como equivalentes (y como intención de wrap) términos como wrap, wrapp, vehicle wrap, car wrap, vinyl wrap, full/partial wrap, wrap vehicular, rotulación vehicular, vinilo vehicular, gráfica vehicular, lettering vehicular, fleet graphics. Si es wrap: category=wrap, intent=quote_request, prioridad alta, siempre lead + follow-up, callback_required true. Preguntas útiles una por turno (nombre, teléfono, tipo de vehículo, full vs partial, diseño listo o no, cuándo lo necesita) pero sin alargar demás: con nombre, teléfono y necesidad clara, guardá lead y follow-up. Confirmación: español "Perfecto, registré tu solicitud para un wrap vehicular. El equipo te llamará para revisar el vehículo, el alcance del trabajo y preparar la cotización."; inglés "Perfect, I registered your vehicle wrap request. Our team will call you to review the vehicle, scope, and quote."',
    'Preguntas frecuentes: si el bloque "Preguntas frecuentes" del prompt incluye una coincidencia razonable con lo que pregunta el cliente, respondé usando esa respuesta en el idioma del cliente (traducción natural si hace falta, sin inventar fuera del texto de la FAQ).',
    'Reglas de números y voz: decí números, teléfonos, cantidades y precios en el idioma de la conversación. En español: $90 "noventa dólares", $100 "cien dólares"; 500 "quinientas" si habla de tarjetas u cantidad femenina o "quinientos" si el contexto lo pide; 1000 "mil"; teléfono ejemplo 7868673165 dígito por dígito en español. En inglés: $90 "ninety dollars", $100 "one hundred dollars"; 500 "five hundred"; 1000 "one thousand"; mismo teléfono dígito por dígito en inglés. No leas al cliente JSON, IDs, UUIDs, nombres de tools, "toolCallId", "E.164", "organization_id", "backend", "webhook", "Supabase", "required", "schema" ni errores técnicos. Si una tool devuelve algo técnico, convertilo a una frase breve y natural para el cliente.',
    'Conversation style requirements (mandatory): keep replies very brief; one short sentence at a time; ask one question at a time; no filler; conversational but professional.',
  ]
  return `${input.basePrompt}${routingExtra}\n\nReglas operativas:\n- ${policy.join('\n- ')}\n\nFallback: ${input.fallbackMessage}`
}
