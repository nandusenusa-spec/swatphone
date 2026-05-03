import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import {
  getCallLogIdByVapiCallId,
  insertTransferEvent,
  patchCallLogTransferState,
  upsertCallLogTransferRequested,
} from '@/lib/voice-platform/repository'
import { runCreateFollowUp } from '@/lib/voice-platform/service'

type Json = Record<string, unknown>

function str(obj: Json, key: string): string {
  const v = obj[key]
  return typeof v === 'string' ? v : ''
}

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

/** Razones Vapi asociadas a transferencia en caliente fallida o cancelada (ver docs call-ended-reason). */
export function isWarmTransferFailureEndedReason(endedReason: string): boolean {
  if (!endedReason) return false
  const r = endedReason.toLowerCase()
  if (r.includes('assistant-forwarded')) return false
  return (
    r.includes('error-warm-transfer') ||
    r.includes('error-transfer-failed') ||
    r.includes('after-warm-transfer') ||
    r.includes('before-warm-transfer') ||
    r === 'call.forwarding.operator-busy'
  )
}

export async function onStatusUpdate(input: {
  organizationId: string
  vapiCallId: string
  status: string
  phone?: string
}): Promise<{ patched: boolean }> {
  if (!input.vapiCallId) return { patched: false }
  if (input.status === 'forwarding') {
    if (input.phone) {
      await upsertCallLogTransferRequested({
        organizationId: input.organizationId,
        vapiCallId: input.vapiCallId,
        phone: input.phone,
      })
    } else {
      await patchCallLogTransferState({
        organizationId: input.organizationId,
        vapiCallId: input.vapiCallId,
        transferRequested: true,
      })
    }
    return { patched: true }
  }
  return { patched: false }
}

export async function onTransferUpdate(input: {
  organizationId: string
  vapiCallId: string
  destination: Json
}): Promise<{ logged: boolean }> {
  if (!input.vapiCallId) return { logged: false }

  await patchCallLogTransferState({
    organizationId: input.organizationId,
    vapiCallId: input.vapiCallId,
    transferCompleted: true,
  })

  const dest = input.destination
  const num = str(dest, 'number') || str(dest, 'phoneNumber') || ''
  const callLogId = await getCallLogIdByVapiCallId(input.organizationId, input.vapiCallId)

  const runtime = await getOrganizationRuntimeConfig(input.organizationId)
  const owner = runtime.transferPolicy.callbackDefaultOwner || 'Ramon'

  await insertTransferEvent({
    organizationId: input.organizationId,
    callLogId,
    requestedTo: owner,
    transferNumber: num || null,
    status: 'completed',
    reason: 'transfer-update',
  })

  return { logged: true }
}

export async function onWarmTransferFailureFollowUp(input: {
  organizationId: string
  vapiCallId: string
  phone: string
  endedReason: string
}): Promise<{ follow_up_created: boolean }> {
  if (!isWarmTransferFailureEndedReason(input.endedReason)) {
    return { follow_up_created: false }
  }

  const runtime = await getOrganizationRuntimeConfig(input.organizationId)
  const callLogId = await getCallLogIdByVapiCallId(input.organizationId, input.vapiCallId)

  await insertTransferEvent({
    organizationId: input.organizationId,
    callLogId,
    requestedTo: runtime.transferPolicy.callbackDefaultOwner || 'Ramon',
    transferNumber:
      runtime.transferPolicy.ramonTransferNumber || runtime.transferPolicy.defaultTransferNumber,
    status: 'failed',
    reason: input.endedReason,
  })

  await runCreateFollowUp({
    organizationId: input.organizationId,
    callLogId: callLogId || undefined,
    phone: input.phone,
    title: 'Callback: transferencia no completada',
    notes: `Vapi endedReason=${input.endedReason}. Ofrecer callback al cliente.`,
    owner: runtime.transferPolicy.callbackDefaultOwner || 'Ramon',
    priority: 'high',
    callbackRequired: true,
    dueAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  })

  return { follow_up_created: true }
}

export { asRecord, str }
