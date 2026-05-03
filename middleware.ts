import { updateSession } from '@/lib/supabase/middleware'
import { timingSafeEqualUtf8 } from '@/lib/security/timing-safe'
import { pathRequiresVapiWebhookSecret } from '@/lib/security/vapi-webhook-paths'
import { NextResponse, type NextRequest } from 'next/server'

function readVapiSecretHeader(request: NextRequest): string {
  return (
    request.headers.get('x-vapi-secret')?.trim() ||
    request.headers.get('X-Vapi-Secret')?.trim() ||
    ''
  )
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  const vapiSecret = process.env.VAPI_WEBHOOK_SECRET?.trim()
  if (
    vapiSecret &&
    request.method === 'POST' &&
    pathRequiresVapiWebhookSecret(pathname)
  ) {
    const provided = readVapiSecretHeader(request)
    if (!timingSafeEqualUtf8(provided, vapiSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    return await updateSession(request)
  } catch (err) {
    console.error('[middleware] updateSession failed', err)
    return NextResponse.next({ request })
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
