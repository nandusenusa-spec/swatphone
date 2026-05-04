import { requireDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FollowUpsClient } from '@/components/dashboard/follow-ups-client'

export default async function FollowUpsPage() {
  const orgId = await requireDashboardOrganizationId()
  const service = createServiceRoleClient()
  let followUps: Record<string, unknown>[] = []
  if (orgId) {
    const filtersBase = { organization_id: orgId, limit: 100, order: 'created_at desc' }
    const attempts = [
      'id, organization_id, title, notes, due_at, status, priority, category, callback_required, metadata, created_at, customer_id, call_log_id',
      'id, title, notes, owner, status, due_at, priority, callback_required, created_at',
      'id, title, notes, status, due_at, created_at',
    ]
    let lastError: { code?: string; message?: string } | null = null
    for (const cols of attempts) {
      const res = await service
        .from('follow_ups')
        .select(cols)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!res.error && res.data) {
        followUps = res.data as Record<string, unknown>[]
        lastError = null
        break
      }
      lastError = res.error ?? null
      console.error('[dashboard/follow-ups-query]', {
        status: 400,
        code: res.error?.code ?? null,
        message: res.error?.message ?? null,
        details: (res.error as { details?: string } | undefined)?.details ?? null,
        hint: (res.error as { hint?: string } | undefined)?.hint ?? null,
        table: 'follow_ups',
        filtersUsed: { ...filtersBase, attempted_select: cols },
      })
    }
    if (lastError && followUps.length === 0) {
      console.error('[dashboard/follow-ups-query]', {
        status: 'error',
        code: lastError.code ?? null,
        message: lastError.message ?? null,
        details: null,
        hint: null,
        table: 'follow_ups',
        filtersUsed: { ...filtersBase, note: 'all_select_attempts_failed' },
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Follow-ups</h1>
        <p className="text-muted-foreground">Tareas pendientes y callbacks por empresa</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lista de Follow-ups ({followUps.length})</CardTitle>
          <CardDescription>Se crean automáticamente en fallos de transferencia o manualmente</CardDescription>
        </CardHeader>
        <CardContent>
          <FollowUpsClient initialFollowUps={followUps as any[]} />
        </CardContent>
      </Card>
    </div>
  )
}
