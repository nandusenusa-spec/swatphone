import { NextResponse } from 'next/server'
import { verifyXAdminSecret } from '@/lib/admin/admin-secret-auth'
import { sendDailySummariesToTelegram } from '@/lib/dashboard/send-daily-summaries'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function authorized(request: Request): boolean {
  if (verifyXAdminSecret(request)) return true
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const auth = request.headers.get('authorization')?.trim()
  return auth === `Bearer ${secret}`
}

/**
 * Cron (Vercel): envía resumen del día por Telegram a cada org con chat configurado.
 * GET/POST /api/cron/daily-summary
 * Manual: header x-admin-secret o Authorization: Bearer $CRON_SECRET
 * Query: ?organization_id=uuid&date=YYYY-MM-DD&skip_quiet=1
 */
export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const organizationId = url.searchParams.get('organization_id')?.trim() || undefined
  const dateKey = url.searchParams.get('date')?.trim() || undefined
  const skipQuiet = url.searchParams.get('skip_quiet') === '1'

  try {
    const result = await sendDailySummariesToTelegram({
      organizationId,
      dateKey,
      skipQuietOrgs: skipQuiet,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[cron/daily-summary]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
