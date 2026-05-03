import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getClientStatusPayload } from '@/lib/print-shop/service'

function hasValidInternalKey(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY
  if (!expected) return true
  const provided = request.headers.get('x-internal-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return !!provided && provided === expected
}

export async function GET(request: NextRequest) {
  if (!hasValidInternalKey(request)) {
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
