import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import {
  findOrCreateCustomer,
  findWorkOrder,
  getCallLogOperatorHandoffJson,
  upsertCallLogOperatorHandoffJson,
} from '@/lib/voice-platform/repository'
import { normalizePhone } from '@/lib/phone'
import { buildIntentCue, resolveTransferTarget } from '@/lib/vapi/transfer-destinations'

export type OperatorHandoff = {
  customer_name: string | null
  customer_phone: string
  order_number: string | null
  intent: string | null
  short_summary: string | null
  first_message: string
  built_at: string
  transfer_extension: string | null
  transfer_label: string | null
  destination_phone_e164: string | null
}

function parseStoredHandoff(raw: Record<string, unknown> | null): OperatorHandoff | null {
  if (!raw) return null
  if (typeof raw.first_message !== 'string' || typeof raw.customer_phone !== 'string') return null
  return {
    customer_name: typeof raw.customer_name === 'string' ? raw.customer_name : null,
    customer_phone: raw.customer_phone,
    order_number: typeof raw.order_number === 'string' ? raw.order_number : null,
    intent: typeof raw.intent === 'string' ? raw.intent : null,
    short_summary: typeof raw.short_summary === 'string' ? raw.short_summary : null,
    first_message: raw.first_message,
    built_at: typeof raw.built_at === 'string' ? raw.built_at : new Date().toISOString(),
    transfer_extension: typeof raw.transfer_extension === 'string' ? raw.transfer_extension : null,
    transfer_label: typeof raw.transfer_label === 'string' ? raw.transfer_label : null,
    destination_phone_e164:
      typeof raw.destination_phone_e164 === 'string' ? raw.destination_phone_e164 : null,
  }
}

function buildOperatorFirstMessage(
  h: Pick<
    OperatorHandoff,
    | 'customer_name'
    | 'customer_phone'
    | 'order_number'
    | 'intent'
    | 'short_summary'
    | 'transfer_label'
    | 'transfer_extension'
  >,
): string {
  const name = h.customer_name?.trim() || 'Cliente'
  return `El cliente ${name} quiere hablar con usted. ¿Desea tomar la llamada?`
}

function buildTransferAssistantSystemPrompt(
  h: OperatorHandoff,
  operatorLabel: string,
): string {
  return `Sos el asistente de transferencia (warm transfer). Estás llamando a ${operatorLabel} para ofrecerle una llamada de un cliente que ya está en línea con el bot.

Datos confirmados por el sistema de la empresa (no inventes ni contradigas):
- Nombre cliente: ${h.customer_name ?? 'no informado'}
- Teléfono cliente: ${h.customer_phone}
- Número de orden: ${h.order_number ?? 'N/A'}
- Intención: ${h.intent ?? 'N/A'}
- Resumen: ${h.short_summary ?? 'N/A'}

Tu voz acaba de decir el mensaje inicial con este contexto. Ahora:
- Si ${operatorLabel} confirma que puede atender (persona humana), usá la herramienta transferSuccessful.
- Si es buzón de voz, mensaje automático, no contesta, rechaza o no estás seguro, usá transferCancel.
- Sé breve.`
}

export async function runPrepareWarmTransfer(input: {
  organizationId: string
  vapiCallId: string
  phone: string
  customerName?: string | null
  orderNumber?: string | null
  intent?: string | null
  shortSummary?: string | null
  transferExtension?: string | null
  transferDepartment?: string | null
}) {
  const rawPhoneIn = typeof input.phone === 'string' ? input.phone : ''
  const phone = normalizePhone(input.phone)
  console.log('[vapi/operator-handoff] prepare_warm_transfer step:normalize_phone', {
    organization_id: input.organizationId,
    call_id: input.vapiCallId || null,
    raw_phone_sample: rawPhoneIn ? `${rawPhoneIn.slice(0, 4)}…len=${rawPhoneIn.length}` : null,
    normalized_present: Boolean(phone),
    normalized_e164_suffix: phone.length >= 4 ? phone.slice(-4) : null,
  })
  if (!phone) {
    console.warn('[vapi/operator-handoff] prepare_warm_transfer failed: invalid_phone', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      raw_phone_len: input.phone?.length ?? 0,
      reason:
        !rawPhoneIn.trim()
          ? 'empty_after_trim'
          : 'normalizePhone_returned_empty (revisa formato: necesita dígitos o + y E.164)',
    })
    const intentCueEarly = buildIntentCue(null, input.intent, input.shortSummary)
    console.info('[vapi/transfer-routing]', {
      input:
        [input.transferDepartment, intentCueEarly].filter(Boolean).join(' ').trim() ||
        input.transferExtension ||
        null,
      matchedName: null,
      matchedRole: null,
      matchedDepartment: input.transferDepartment ?? null,
      transferExtension: input.transferExtension ?? null,
      transferPhone: null,
      prepared: false,
      transferred: false,
      error: 'invalid_phone',
    })
    return { error: 'invalid_phone' as const }
  }

  const runtime = await getOrganizationRuntimeConfig(input.organizationId)
  /** `department` ya va aparte; el cue solo lleva intent + resumen (evita duplicar "Diseño" y romper matching). */
  const intentCue = buildIntentCue(null, input.intent, input.shortSummary)
  const resolved = resolveTransferTarget(runtime, {
    extension: input.transferExtension ?? null,
    department: input.transferDepartment ?? null,
    intentCue,
  })

  console.log('[vapi/operator-handoff] prepare_warm_transfer step:resolve_target', {
    organization_id: input.organizationId,
    call_id: input.vapiCallId || null,
    transfer_extension: input.transferExtension ?? null,
    transfer_department: input.transferDepartment ?? null,
    intent_cue_preview: intentCue ? intentCue.slice(0, 120) : null,
    raw_destinations_count: (runtime.transferPolicy.transferDestinations || []).length,
    resolved: resolved
      ? {
          label: resolved.label,
          extension: resolved.extension,
          destination_suffix: resolved.phoneE164.length >= 4 ? resolved.phoneE164.slice(-4) : null,
        }
      : null,
    legacy_present: Boolean(
      runtime.transferPolicy.urgentTransferNumber ||
        runtime.transferPolicy.ramonTransferNumber ||
        runtime.transferPolicy.defaultTransferNumber,
    ),
  })

  if (!resolved) {
    const list = runtime.transferPolicy.transferDestinations || []
    console.warn('[vapi/operator-handoff] prepare_warm_transfer failed: transfer_target_unresolved', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      destinations_count: list.length,
      has_legacy:
        Boolean(
          runtime.transferPolicy.urgentTransferNumber ||
            runtime.transferPolicy.ramonTransferNumber ||
            runtime.transferPolicy.defaultTransferNumber,
        ),
      had_extension: Boolean(input.transferExtension?.trim()),
      had_department: Boolean(input.transferDepartment?.trim()),
      had_intent_cue: Boolean(intentCue.trim()),
    })
    console.info('[vapi/transfer-routing]', {
      input:
        [input.transferDepartment, intentCue].filter(Boolean).join(' ').trim() ||
        input.transferExtension ||
        null,
      matchedName: null,
      matchedRole: null,
      matchedDepartment: input.transferDepartment ?? null,
      transferExtension: input.transferExtension ?? null,
      transferPhone: null,
      prepared: false,
      transferred: false,
      error: 'transfer_target_unresolved',
    })
    return {
      error: 'transfer_target_unresolved' as const,
      message:
        'No se pudo resolver un destino de transferencia con E.164 válido. Revisá transfer_destinations y números legacy en routing, o pasá transfer_department / transfer_extension acorde al destino.',
      destinations: list.map((d) => ({
        extension: d.extension || null,
        name: d.name,
      })),
    }
  }

  let customerName =
    typeof input.customerName === 'string' ? input.customerName.trim() || null : null
  let orderNumber =
    typeof input.orderNumber === 'string' ? input.orderNumber.trim() || null : null
  const intent = typeof input.intent === 'string' ? input.intent.trim() || null : null
  const shortSummary =
    typeof input.shortSummary === 'string' ? input.shortSummary.trim() || null : null

  if (!customerName) {
    const customer = await findOrCreateCustomer({
      organizationId: input.organizationId,
      phone,
    })
    customerName = (customer.name as string) || null
  }

  if (!orderNumber) {
    const jobs = await findWorkOrder({
      organizationId: input.organizationId,
      phone,
    })
    const first = jobs.matches[0] as Record<string, unknown> | undefined
    if (first) {
      orderNumber =
        (typeof first.order_number === 'string' && first.order_number) ||
        (typeof first.work_order_number === 'string' && first.work_order_number) ||
        null
    }
  }

  const base = {
    customer_name: customerName,
    customer_phone: phone,
    order_number: orderNumber,
    intent,
    short_summary: shortSummary,
    transfer_label: resolved.label,
    transfer_extension: resolved.extension,
  }

  const handoff: OperatorHandoff = {
    ...base,
    destination_phone_e164: resolved.phoneE164,
    first_message: buildOperatorFirstMessage({
      ...base,
      transfer_label: resolved.label,
      transfer_extension: resolved.extension,
    }),
    built_at: new Date().toISOString(),
  }

  await upsertCallLogOperatorHandoffJson({
    organizationId: input.organizationId,
    vapiCallId: input.vapiCallId,
    phone,
    handoff: handoff as unknown as Record<string, unknown>,
  })

  console.log('[vapi/operator-handoff] prepare_warm_transfer ok', {
    organization_id: input.organizationId,
    call_id: input.vapiCallId || null,
    transfer_label: handoff.transfer_label,
    destination_suffix: resolved.phoneE164.length >= 4 ? resolved.phoneE164.slice(-4) : '****',
  })

  console.info('[vapi/transfer-routing]', {
    input:
      [input.transferDepartment, intentCue].filter(Boolean).join(' ').trim() ||
      input.transferExtension ||
      null,
    matchedName: resolved.label,
    matchedRole: null as string | null,
    matchedDepartment: input.transferDepartment ?? null,
    transferExtension: resolved.extension,
    transferPhone: resolved.phoneE164,
    found: true,
    prepared: true,
    transferred: false,
    error: null as string | null,
  })

  return {
    ok: true as const,
    handoff: {
      customer_name: handoff.customer_name,
      order_number: handoff.order_number,
      intent: handoff.intent,
      short_summary: handoff.short_summary,
      transfer_label: handoff.transfer_label,
      transfer_extension: handoff.transfer_extension,
      operator_first_message_preview: handoff.first_message,
    },
    instruction:
      'Contexto registrado. Ahora invocá la herramienta transfer_to_ramon para iniciar la transferencia en caliente.',
  }
}

/** Respuesta al webhook transfer-destination-request de Vapi (destino + warm transfer dinámico). */
export async function buildDynamicWarmTransferDestination(input: {
  organizationId: string
  vapiCallId: string
  callerPhone?: string
}): Promise<Record<string, unknown> | null> {
  const runtime = await getOrganizationRuntimeConfig(input.organizationId)
  if (!runtime.transferPolicy.allowLiveTransfer) {
    console.warn('[vapi/operator-handoff] transfer-destination-request blocked: allow_live_transfer=false', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
    })
    return null
  }

  let handoff = parseStoredHandoff(
    await getCallLogOperatorHandoffJson(input.organizationId, input.vapiCallId),
  )
  if (!handoff) {
    const phone = normalizePhone(input.callerPhone)
    if (!phone) {
      console.warn('[vapi/operator-handoff] transfer-destination-request no handoff and invalid caller phone', {
        organization_id: input.organizationId,
        call_id: input.vapiCallId || null,
      })
      return null
    }
    const base = {
      customer_name: null,
      customer_phone: phone,
      order_number: null,
      intent: 'transferencia a operador',
      short_summary: 'El cliente pidió hablar con una persona; no hay handoff previo en sistema.',
      transfer_label: null as string | null,
      transfer_extension: null as string | null,
    }
    handoff = {
      ...base,
      destination_phone_e164: null,
      first_message: buildOperatorFirstMessage(base),
      built_at: new Date().toISOString(),
    }
    await upsertCallLogOperatorHandoffJson({
      organizationId: input.organizationId,
      vapiCallId: input.vapiCallId,
      phone,
      handoff: handoff as unknown as Record<string, unknown>,
    })
  }

  let e164 =
    handoff.destination_phone_e164 ||
    runtime.transferPolicy.urgentTransferNumber ||
    runtime.transferPolicy.ramonTransferNumber ||
    runtime.transferPolicy.defaultTransferNumber
  const source = handoff.destination_phone_e164
    ? 'handoff.destination_phone_e164'
    : runtime.transferPolicy.urgentTransferNumber
      ? 'routing.urgent_transfer_number'
      : runtime.transferPolicy.ramonTransferNumber
        ? 'routing.ramon_transfer_number'
        : runtime.transferPolicy.defaultTransferNumber
          ? 'routing.default_transfer_number'
          : 'none'

  if (!e164) {
    const dests = runtime.transferPolicy.transferDestinations || []
    const desiredLabel =
      handoff.transfer_label?.trim().toLowerCase() ||
      runtime.transferPolicy.callbackDefaultOwner?.trim().toLowerCase() ||
      'ramon'
    const byName = dests.find((d) => d.name.trim().toLowerCase() === desiredLabel)
    const byNameContains = dests.find((d) => d.name.trim().toLowerCase().includes(desiredLabel))
    const byExtension =
      handoff.transfer_extension?.trim() &&
      dests.find((d) => d.extension.trim() === handoff.transfer_extension?.trim())
    const candidate = byExtension || byName || byNameContains || (dests.length > 0 ? dests[0] : null)
    if (candidate?.phoneE164) {
      e164 = candidate.phoneE164
      console.log(
        '[vapi/operator-handoff] transfer-destination-request E164 selected from transfer_destinations',
        {
          organization_id: input.organizationId,
          call_id: input.vapiCallId || null,
          selected_name: candidate.name,
          selected_extension: candidate.extension || null,
          selected_number: e164,
          selected_by: byExtension
            ? 'extension'
            : byName
              ? 'exact_name'
              : byNameContains
                ? 'contains_name'
                : 'first_destination_fallback',
        },
      )
    }
  }

  if (!e164) {
    console.warn('[vapi/operator-handoff] transfer-destination-request NO_VALID_E164', {
      organization_id: input.organizationId,
      call_id: input.vapiCallId || null,
      had_handoff_destination: Boolean(handoff.destination_phone_e164),
      transfer_destinations_count: (runtime.transferPolicy.transferDestinations || []).length,
    })
    return null
  }

  console.log('[vapi/operator-handoff] transfer-destination-request dynamic payload ok', {
    organization_id: input.organizationId,
    call_id: input.vapiCallId || null,
    selected_number: e164,
    selected_source: source,
    is_e164: /^\+[1-9]\d{7,14}$/.test(e164),
    e164_suffix: e164.length >= 4 ? e164.slice(-4) : '****',
  })

  const owner =
    handoff.transfer_label?.trim() ||
    runtime.transferPolicy.callbackDefaultOwner ||
    'Ramon'

  const destination: Record<string, unknown> = {
    type: 'number',
    number: e164,
    numberE164CheckEnabled: true,
    transferPlan: {
      mode: 'warm-transfer-experimental',
      transferAssistant: {
        firstMessage: handoff.first_message,
        firstMessageMode: 'assistant-speaks-first',
        maxDurationSeconds: 90,
        silenceTimeoutSeconds: 30,
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: buildTransferAssistantSystemPrompt(handoff, owner),
            },
          ],
        },
      },
    },
  }

  return {
    destination,
    message: {
      type: 'request-start',
      message:
        'Te comunico con el operador. Por favor esperá en línea; no cortes. En unos momentos intentamos la conexión.',
    },
  }
}
