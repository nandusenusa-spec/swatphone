import { NextRequest, NextResponse } from 'next/server'
import { isValidInternalApiKey } from '@/lib/security/internal-api-key'
import { normalizePhone } from '@/lib/phone'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { clientLookupResponse, findClientByNormalizedPhone } from '@/lib/print-shop/service'

export async function GET(request: NextRequest) {
  if (!isValidInternalApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const phoneRaw = request.nextUrl.searchParams.get('phone')
  const organizationId = request.nextUrl.searchParams.get('organization_id')

  if (!phoneRaw?.trim()) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 })
  }

  const phone = normalizePhone(phoneRaw)
  if (!phone) {
    return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()
    const client = await findClientByNormalizedPhone(
      supabase,
      phone,
      organizationId || undefined,
    )
    return NextResponse.json(clientLookupResponse(!!client, client))
  } catch (e) {
    console.error('[client-lookup]', e)
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  }
}
