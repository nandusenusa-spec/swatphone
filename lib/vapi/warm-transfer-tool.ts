import type { VapiRuntimeConfig } from '@/lib/vapi/runtime-config'

/**
 * Herramienta servidor: persiste operator_handoff (mensaje y datos) antes del transferCall.
 * El destino y el transfer assistant se arman en transfer-destination-request (sin hardcode en Vapi).
 */
export function buildPrepareWarmTransferServerTool(organizationId: string): Record<string, unknown> | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').trim()
  if (!base) return null
  const url = `${base.replace(/\/$/, '')}/api/vapi/events?organization_id=${encodeURIComponent(organizationId)}`

  return {
    type: 'function',
    async: false,
    function: {
      name: 'prepare_warm_transfer',
      description:
        'OBLIGATORIO antes de transfer_to_ramon: registra contexto para el operador y el destino de transferencia (interno/nombre de área). Si hay varias líneas en la empresa, incluí transfer_extension o transfer_department según lo que dijo el cliente. El servidor enriquece datos desde CRM si faltan. Después de éxito, llamá transfer_to_ramon.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'Nombre del cliente si se conoce' },
          order_number: { type: 'string', description: 'Número de orden o trabajo si existe' },
          intent: { type: 'string', description: 'Motivo principal en una frase' },
          short_summary: { type: 'string', description: 'Resumen breve para quien atiende' },
          transfer_extension: {
            type: 'string',
            description:
              'Interno marcado al cliente (ej. 90, 91). Usar si el cliente lo dice o si ya está claro el destino.',
          },
          transfer_department: {
            type: 'string',
            description:
              'Nombre del área o persona destino (ej. Diseño, Administración, Ramón), como figura en la lista de transferencias de la empresa.',
          },
        },
      },
    },
    server: { url },
    messages: [
      {
        type: 'request-start',
        content: 'Preparo la transferencia con el operador. Por favor esperá en línea.',
      },
    ],
  }
}

/** Tool nativo Vapi: transferencia en caliente; destino y briefing los responde transfer-destination-request. */
export function buildWarmTransferCallTool(
  runtime: VapiRuntimeConfig,
  options?: { holdAudioUrl?: string },
): Record<string, unknown> | null {
  if (!runtime.transferPolicy.allowLiveTransfer) return null

  const hasListedDestinations = (runtime.transferPolicy.transferDestinations?.length ?? 0) > 0
  if (
    !hasListedDestinations &&
    !runtime.transferPolicy.ramonTransferNumber &&
    !runtime.transferPolicy.defaultTransferNumber &&
    !runtime.transferPolicy.urgentTransferNumber
  ) {
    return null
  }

  const owner = runtime.transferPolicy.callbackDefaultOwner || 'Ramon'
  const holdUrl = options?.holdAudioUrl?.trim()

  return {
    type: 'transferCall',
    function: {
      name: 'transfer_to_ramon',
      description: `Transferir en vivo a ${owner}. Antes DEBÉS llamar prepare_warm_transfer con el contexto del cliente. El cliente queda en espera mientras el asistente de transferencia habla con ${owner}; no cuelgues.`,
    },
    destinations: [],
    messages: [
      {
        type: 'request-start',
        content:
          'Te paso con el operador. Quedate en línea un momento, vas a escuchar tono de espera; no cortes.',
      },
      ...(holdUrl
        ? ([{ type: 'request-complete', content: holdUrl }] as Record<string, unknown>[])
        : []),
      {
        type: 'request-failed',
        content:
          'No pudimos completar la transferencia en este momento. Puedo dejar anotado tu número para que te llamen. ¿Te parece bien?',
      },
    ],
  }
}
