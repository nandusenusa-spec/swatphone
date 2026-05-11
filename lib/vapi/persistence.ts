import {
  runCreateFollowUp,
  runMarkSpamCall,
  runSaveCallOutcome,
  runTransferToRamon,
} from '@/lib/voice-platform/service'
import type { StructuredExtraction } from '@/lib/voice-platform/types'

export async function persistCallArtifacts(input: {
  organizationId: string
  vapiCallId?: string
  phone: string
  customerName?: string
  transcript?: string
  summary?: string
  intent?: string
  outcome?: string
  nextAction?: string
  callbackRequired?: boolean
  followUpDate?: string
  spamScore?: number
  ended?: boolean
  vapiStartedAtIso?: string
  vapiEndedAtIso?: string
  structuredExtractionFromEvent?: Record<string, unknown>
}) {
  const base: StructuredExtraction = {
    customer_name: input.customerName || null,
    phone: input.phone,
    intent: input.intent as StructuredExtraction['intent'],
    callback_required: input.callbackRequired === true,
    follow_up_date: input.followUpDate || null,
    summary: input.summary || null,
    next_action: input.nextAction || null,
  }
  const merged: StructuredExtraction = {
    ...base,
    ...(input.structuredExtractionFromEvent
      ? (input.structuredExtractionFromEvent as StructuredExtraction)
      : {}),
  }

  return runSaveCallOutcome({
    organizationId: input.organizationId,
    vapiCallId: input.vapiCallId,
    phone: input.phone,
    customerName: input.customerName,
    transcript: input.transcript,
    summary: input.summary,
    intent: input.intent,
    result: input.outcome,
    nextAction: input.nextAction,
    followUpDate: input.followUpDate,
    spamScore: input.spamScore,
    structuredExtraction: merged,
    ended: input.ended,
    vapiStartedAtIso: input.vapiStartedAtIso,
    vapiEndedAtIso: input.vapiEndedAtIso,
  })
}

export async function persistFollowUp(input: {
  organizationId: string
  callLogId?: string
  phone?: string
  customerId?: string
  leadId?: string
  title: string
  notes?: string
  owner?: string
  dueAt?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  callbackRequired?: boolean
}) {
  return runCreateFollowUp({
    organizationId: input.organizationId,
    callLogId: input.callLogId,
    phone: input.phone,
    customerId: input.customerId,
    leadId: input.leadId,
    title: input.title,
    notes: input.notes,
    owner: input.owner,
    dueAt: input.dueAt,
    priority: input.priority,
    callbackRequired: input.callbackRequired,
  })
}

export async function persistTransfer(input: {
  organizationId: string
  callLogId: string
  reason: string
  urgent?: boolean
}) {
  return runTransferToRamon({
    organizationId: input.organizationId,
    callLogId: input.callLogId,
    reason: input.reason,
    urgent: input.urgent,
  })
}

export async function persistSpamRejection(input: {
  organizationId: string
  vapiCallId: string
  phone: string
  reason: string
  spamScore?: number
}) {
  return runMarkSpamCall({
    organizationId: input.organizationId,
    vapiCallId: input.vapiCallId,
    phone: input.phone,
    reason: input.reason,
    spamScore: input.spamScore,
  })
}
