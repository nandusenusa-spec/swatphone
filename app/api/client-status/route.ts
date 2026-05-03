import { NextRequest, NextResponse } from 'next/server'
import { isValidInternalApiKey } from '@/lib/security/internal-api-key'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getClientStatusPayload } from '@/lib/print-shop/service'

export async function GET(request: NextRequest) {
  if (!isValidInternalApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const phoneRaw = request.nextUrl.searchParams.get('phone')
  const organizationId = request.nextUrl.searchParams.get('organization_id')

  if (!phoneRaw?.trim()) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()
    const payload = await getClientStatusPayload(
      supabase,
      phoneRaw,
      organizationId || undefined,
    )
    return NextResponse.json(payload)
  } catch (e) {
    console.error('[client-status]', e)
    return NextResponse.json({ error: 'status lookup failed' }, { status: 500 })
  }
}
