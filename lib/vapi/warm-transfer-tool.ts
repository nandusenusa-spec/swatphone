import type { VapiRuntimeConfig } from '@/lib/vapi/runtime-config'
import { legacyPhone, usableDestinations } from '@/lib/vapi/transfer-destinations'
import { useWarmTransferExperimental } from '@/lib/vapi/transfer-plan'

function buildStaticTransferDestinations(runtime: VapiRuntimeConfig): Record<string, unknown>[] {
  const list = usableDestinations(runtime.transferPolicy.transferDestinations || [])
  const out: Record<string, unknown>[] = []
  for (const d of list) {
    out.push({
      type: 'number',
      number: d.phoneE164,
      description: d.extension ? `${d.name} (ext ${d.extension})` : d.name,
      transferPlan: { mode: 'blind-transfer' },
    })
  }
  const legacy = legacyPhone(runtime)
  if (legacy && !out.some((x) => (x as { number?: string }).number === legacy)) {
    out.push({
      type: 'number',
      number: legacy,
      description: runtime.transferPolicy.callbackDefaultOwner || 'Operador',
      transferPlan: { mode: 'blind-transfer' },
    })
  }
  return out
}

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

  const useWarm = useWarmTransferExperimental()
  const staticDestinations = buildStaticTransferDestinations(runtime)
  if (staticDestinations.length === 0) return null

  const owner = runtime.transferPolicy.callbackDefaultOwner || 'Ramon'
  const holdUrl = options?.holdAudioUrl?.trim()

  return {
    type: 'transferCall',
    function: {
      name: 'transfer_to_ramon',
      description: useWarm
        ? `Live transfer to ${owner}. Call prepare_warm_transfer first with transfer_department or transfer_person, then call this tool immediately.`
        : `Transfer the caller to ${owner} or the requested department. Call prepare_warm_transfer first with transfer_department (e.g. design, Ramon, Administration), then call this tool immediately.`,
    },
    destinations: useWarm ? [] : staticDestinations,
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
