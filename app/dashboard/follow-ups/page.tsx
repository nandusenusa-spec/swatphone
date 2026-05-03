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
  const followUps = orgId
    ? (
        await service
          .from('follow_ups')
          .select('id, title, notes, owner, status, due_at, priority, callback_required, customers(name, phone)')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(100)
      ).data || []
    : []

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
