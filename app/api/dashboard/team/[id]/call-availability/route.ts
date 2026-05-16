import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

type RouteContext = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: memberId } = await context.params
    if (!memberId || !UUID_RE.test(memberId)) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
    }

    const body = (await request.json()) as {
      receives_calls?: unknown
      call_priority?: unknown
    }

    if (typeof body.receives_calls !== 'boolean') {
      return NextResponse.json(
        { error: 'invalid_payload', message: 'receives_calls must be a boolean' },
        { status: 400 },
      )
    }

    let callPriority: number | undefined
    if (body.call_priority !== undefined && body.call_priority !== null) {
      const n = Number(body.call_priority)
      if (!Number.isInteger(n) || n < 0 || n > 10000) {
        return NextResponse.json(
          { error: 'invalid_payload', message: 'call_priority must be an integer between 0 and 10000' },
          { status: 400 },
        )
      }
      callPriority = n
    }

    const svc = createServiceRoleClient()
    const { data: member, error: findErr } = await svc
      .from('team_members')
      .select('id, organization_id')
      .eq('id', memberId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (findErr) {
      console.error('[api/dashboard/team/call-availability] lookup', findErr)
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (!member) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const patch: Record<string, unknown> = {
      receives_calls: body.receives_calls,
      updated_at: new Date().toISOString(),
    }
    if (callPriority !== undefined) {
      patch.call_priority = callPriority
    }

    const { data: updated, error: updateErr } = await svc
      .from('team_members')
      .update(patch)
      .eq('id', memberId)
      .eq('organization_id', organizationId)
      .select('id, receives_calls, call_priority')
      .single()

    if (updateErr) {
      const msg = (updateErr.message || '').toLowerCase()
      if (msg.includes('receives_calls') || msg.includes('call_priority')) {
        return NextResponse.json(
          {
            error: 'migration_required',
            message: 'Apply supabase/migrations/023_team_call_availability.sql before updating call routing.',
          },
          { status: 503 },
        )
      }
      console.error('[api/dashboard/team/call-availability] update', updateErr)
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      member: {
        id: updated.id,
        receives_calls: updated.receives_calls,
        call_priority: updated.call_priority,
      },
    })
  } catch (e) {
    console.error('[api/dashboard/team/call-availability]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
