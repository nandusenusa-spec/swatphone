import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'

type TransferContext = {
  urgent: boolean
  transferRequested: boolean
}

export async function resolveTransferDestination(
  organizationId: string,
  context: TransferContext,
) {
  const runtime = await getOrganizationRuntimeConfig(organizationId)
  const policy = runtime.transferPolicy

  if (!policy.allowLiveTransfer || !context.transferRequested) {
    return {
      shouldTransfer: false,
      number: null as string | null,
      reason: 'live_transfer_disabled_or_not_requested',
    }
  }

  if (context.urgent && policy.urgentTransferNumber) {
    return {
      shouldTransfer: true,
      number: policy.urgentTransferNumber,
      reason: 'urgent_transfer',
    }
  }

  const ramon = policy.ramonTransferNumber || policy.defaultTransferNumber
  if (!ramon) {
    return {
      shouldTransfer: false,
      number: null as string | null,
      reason: 'no_transfer_number_configured',
    }
  }

  return {
    shouldTransfer: true,
    number: ramon,
    reason: 'standard_transfer',
  }
}
