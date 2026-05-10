import type { VapiRuntimeConfig } from '@/lib/vapi/runtime-config'

/**
 * Server tool: persists operator handoff context before transferCall.
 * The destination and transfer assistant are built in transfer-destination-request.
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
        'Required before transfer_to_ramon: stores operator context and the transfer destination. When the caller asks for a department/person, always pass transfer_department or transfer_person. For English "graphic design", "design", "logo", or "branding", pass transfer_department="graphic design" or "design" and language="en"; include transfer_extension only if it is present in the active routing data. After ok, call transfer_to_ramon immediately.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'Customer name if known.' },
          order_number: { type: 'string', description: 'Order or work order number if known.' },
          intent: { type: 'string', description: 'Main reason in one short phrase.' },
          short_summary: { type: 'string', description: 'Brief summary for the person receiving the call.' },
          transfer_extension: {
            type: 'string',
            description:
              'Internal extension only when present in active routing data, e.g. 90 or 105 for design.',
          },
          transfer_department: {
            type: 'string',
            description:
              'Destination department/person as the caller said it, e.g. "graphic design", "design", "Diseno", "Administracion", "Ramon". Required when caller requested a destination.',
          },
          transfer_person: {
            type: 'string',
            description: 'Destination person if the caller requested a person by name.',
          },
          language: {
            type: 'string',
            description: 'Caller language: en or es.',
          },
        },
      },
    },
    server: { url },
    messages: [
      {
        type: 'request-start',
        content: "One moment, I'll transfer you now.",
      },
    ],
  }
}

/** Native Vapi tool: warm transfer; destination is supplied by transfer-destination-request. */
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
      description: `Live transfer to ${owner}. You must call prepare_warm_transfer first with the caller context and destination. Keep the caller on the line while the warm transfer assistant speaks with ${owner}.`,
    },
    destinations: [],
    messages: [
      {
        type: 'request-start',
        content: "One moment, I'll transfer you now. Please stay on the line.",
      },
      ...(holdUrl
        ? ([{ type: 'request-complete', content: holdUrl }] as Record<string, unknown>[])
        : []),
      {
        type: 'request-failed',
        content:
          "I couldn't complete the transfer right now. I can leave your number so the team can call you back.",
      },
    ],
  }
}
