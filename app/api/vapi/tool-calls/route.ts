import { NextRequest, NextResponse } from 'next/server'
import { POST as vapiEventsPost } from '@/app/api/vapi/events/route'

/**
 * Compat: algunos dashboards o plantillas apuntan a `/api/vapi/tool-calls`.
 * Es un alias de POST /api/vapi/events (mismo body, mismo `x-vapi-secret`).
 */
export async function POST(request: NextRequest) {
  console.info('[vapi/tool-calls] compat webhook → vapi/events', {
    url: request.url,
    organization_id: request.nextUrl.searchParams.get('organization_id'),
    path: request.nextUrl.pathname,
  })
  return vapiEventsPost(request)
}

/** Comprobación rápida en navegador / monitor: si esto 404, el deploy o la ruta están mal. */
export function GET() {
  return NextResponse.json({
    ok: true,
    path: '/api/vapi/tool-calls',
    use: 'POST with Vapi server messages (tool-calls, etc.); same as /api/vapi/events',
  })
}
