import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FollowUpsClient } from '@/components/dashboard/follow-ups-client'

export default async function FollowUpsPage() {
  const supabase = await createClient()
  const service = createServiceRoleClient()
  const { data: authData } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', authData.user?.id || '')
    .maybeSingle()

  const orgId = profile?.organization_id
  let followUps: Record<string, unknown>[] = []
  if (orgId) {
    const baseSelect =
      'id, title, notes, owner, status, due_at, priority, callback_required, customers(name, phone)'
    let res = await service
      .from('follow_ups')
      .select(baseSelect)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (res.error) {
      console.error('[dashboard/follow-ups-query]', {
        status: 'error',
        code: res.error.code,
        message: res.error.message,
        details: (res.error as { details?: string }).details ?? null,
        hint: (res.error as { hint?: string }).hint ?? null,
        table: 'follow_ups',
        filtersUsed: { organization_id: orgId, limit: 100, order: 'created_at desc', embed: 'customers' },
      })
      res = await service
        .from('follow_ups')
        .select('id, title, notes, owner, status, due_at, priority, callback_required')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (res.error) {
        console.error('[dashboard/follow-ups-query]', {
          status: 'error',
          code: res.error.code,
          message: res.error.message,
          table: 'follow_ups',
          filtersUsed: { organization_id: orgId, fallback_no_embed: true },
        })
      }
    }
    followUps = (res.data || []) as Record<string, unknown>[]
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
