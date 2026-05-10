import {
  getDashboardDataClient,
  requireDashboardOrganizationId,
} from '@/lib/auth/dashboard-session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamTable } from '@/components/dashboard/team-table'
import { AddTeamMemberDialog } from '@/components/dashboard/add-team-member-dialog'
import { Users, UserCheck, Phone, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function TeamPage() {
  const orgId = await requireDashboardOrganizationId()
  const { db, applyOrgFilter } = await getDashboardDataClient(orgId)

  let membersQ = db.from('team_members').select('*').order('created_at', { ascending: false })
  if (applyOrgFilter) membersQ = membersQ.eq('organization_id', orgId)
  const { data: teamMembers } = await membersQ

  let totalQ = db.from('team_members').select('*', { count: 'exact', head: true })
  if (applyOrgFilter) totalQ = totalQ.eq('organization_id', orgId)
  const { count: totalMembers } = await totalQ

  let availQ = db
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('is_available', true)
  if (applyOrgFilter) availQ = availQ.eq('organization_id', orgId)
  const { count: availableMembers } = await availQ

  const stats = [
    { title: 'Total Miembros', value: totalMembers || 0, icon: Users },
    { title: 'Disponibles', value: availableMembers || 0, icon: UserCheck },
    { title: 'Con Telefono', value: teamMembers?.filter((m) => m.phone).length || 0, icon: Phone },
    { title: 'Con Extension', value: teamMembers?.filter((m) => m.extension).length || 0, icon: Clock },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipo</h1>
          <p className="text-muted-foreground">
            Gestiona los miembros del equipo para transferencias de llamadas
          </p>
        </div>
        <AddTeamMemberDialog />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team table */}
      <Card>
        <CardHeader>
          <CardTitle>Miembros del Equipo</CardTitle>
          <CardDescription>
            El asistente puede transferir llamadas a estos miembros
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamTable members={teamMembers || []} />
        </CardContent>
      </Card>
    </div>
  )
}
