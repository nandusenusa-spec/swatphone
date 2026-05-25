import { verifyXAdminSecret } from '@/lib/admin/admin-secret-auth'
import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import { organizationHasTransferCapacity } from '@/lib/vapi/transfer-dial'
import { isPlausibleE164, usableDestinations } from '@/lib/vapi/transfer-destinations'
import { useWarmTransferExperimental } from '@/lib/vapi/transfer-plan'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** GET /api/vapi/transfer-diagnostic?organization_id=UUID */
export async function GET(req: Request) {
  if (!verifyXAdminSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = new URL(req.url).searchParams.get('organization_id')?.trim()
  if (!orgId) {
    return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
  }

  const runtime = await getOrganizationRuntimeConfig(orgId)
  const usable = usableDestinations(runtime.transferPolicy.transferDestinations || [])
  const hasCapacity = await organizationHasTransferCapacity(orgId, runtime)

  return NextResponse.json({
    ok: hasCapacity && usable.length > 0,
    organization_id: orgId,
    allow_live_transfer: runtime.transferPolicy.allowLiveTransfer,
    transfer_mode: useWarmTransferExperimental() ? 'warm-transfer-experimental' : 'blind-transfer',
    destinations_count: usable.length,
    destinations: usable.map((d) => ({
      name: d.name,
      extension: d.extension || null,
      phone_suffix: d.phoneE164.length >= 4 ? d.phoneE164.slice(-4) : null,
      valid_e164: isPlausibleE164(d.phoneE164),
    })),
    legacy_numbers: {
      ramon: runtime.transferPolicy.ramonTransferNumber
        ? `***${runtime.transferPolicy.ramonTransferNumber.slice(-4)}`
        : null,
      default: runtime.transferPolicy.defaultTransferNumber
        ? `***${runtime.transferPolicy.defaultTransferNumber.slice(-4)}`
        : null,
      urgent: runtime.transferPolicy.urgentTransferNumber
        ? `***${runtime.transferPolicy.urgentTransferNumber.slice(-4)}`
        : null,
    },
    callback_default_owner: runtime.transferPolicy.callbackDefaultOwner,
    tools_enabled_includes_transfer: runtime.toolsEnabled.includes('transfer_to_ramon'),
    hint:
      usable.length === 0
        ? 'Configurá destinos en Admin (interno + teléfono +1...) y Sync assistant.'
        : 'Tras Sync, probá llamada pidiendo Ramón o diseño. Modo blind por defecto (más fiable).',
  })
}
