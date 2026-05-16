import { NextRequest, NextResponse } from 'next/server'
import { searchTrabajos } from '@/lib/mvp/repository'
import { isValidInternalApiKey } from '@/lib/security/internal-api-key'

export async function GET(request: NextRequest) {
  if (!isValidInternalApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const numero = request.nextUrl.searchParams.get('numero')
  const telefono = request.nextUrl.searchParams.get('telefono')
  const organizationId = request.nextUrl.searchParams.get('organization_id')

  if (!numero && !telefono) {
    return NextResponse.json(
      { error: 'Debes enviar numero o telefono' },
      { status: 400 },
    )
  }

  try {
    const result = await searchTrabajos({
      numero,
      telefono,
      organizationId,
    })

    if (result.matches.length === 0) {
      return NextResponse.json({ found: false, matches: [] })
    }

    return NextResponse.json({
      found: true,
      ambiguous: result.ambiguous,
      mode: result.mode,
      matches: result.matches,
    })
  } catch (error) {
    console.error('[trabajos/search] failed', error)
    return NextResponse.json({ error: 'search failed' }, { status: 500 })
  }
}
