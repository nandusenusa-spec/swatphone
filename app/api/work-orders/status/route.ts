import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { isValidInternalApiKey } from '@/lib/security/internal-api-key'
import { WorkOrderStatusQuerySchema } from '@/lib/voice-platform/validation'
import { runGetJobStatus } from '@/lib/voice-platform/service'

/**
 * GET /api/work-orders/status?organization_id=UUID&phone=...
 *
 * Devuelve el mensaje de voz alineado con get_job_status.
 * 400: parámetros faltantes o inválidos.
 * 404: sin work_order para ese teléfono y organización.
 * 401: si INTERNAL_API_KEY está definida y la petición no la envía.
 */
export async function GET(request: NextRequest) {
  if (!isValidInternalApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  try {
    const q = WorkOrderStatusQuerySchema.parse({
      organization_id: sp.get('organization_id') || '',
      phone: sp.get('phone') || '',
    })

    const result = await runGetJobStatus({
      organizationId: q.organization_id,
      phone: q.phone.trim(),
    })

    if (!result.found) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const primary = result.primary_message_for_caller
    if (typeof primary !== 'string' || !primary.trim()) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    return NextResponse.json({ primary_message_for_caller: primary })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_query', details: error.flatten() }, { status: 400 })
    }
    console.error('[work-orders/status]', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
