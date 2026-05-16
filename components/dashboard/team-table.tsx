'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Pencil, Trash2, Phone, Mail } from 'lucide-react'
import { EditTeamMemberDialog } from './edit-team-member-dialog'

interface TeamMember {
  id: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
  extension: string | null
  is_available: boolean
  receives_calls?: boolean
  call_priority?: number
}

export function TeamTable({ members }: { members: TeamMember[] }) {
  const router = useRouter()
  const supabase = createClient()

  const syncRouting = () =>
    fetch('/api/dashboard/sync-team-transfer', { method: 'POST', credentials: 'include' }).catch(() => {})

  const handleToggleAvailable = async (id: string, isAvailable: boolean) => {
    await supabase
      .from('team_members')
      .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
      .eq('id', id)
    await syncRouting()
    router.refresh()
  }

  const handleToggleReceivesCalls = async (member: TeamMember, receivesCalls: boolean) => {
    const res = await fetch(`/api/dashboard/team/${member.id}/call-availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        receives_calls: receivesCalls,
        call_priority: member.call_priority ?? 100,
      }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string }
      alert(json.message || 'No se pudo actualizar la disponibilidad para llamadas')
      return
    }
    await syncRouting()
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (confirm('Estas seguro de eliminar este miembro?')) {
      await supabase.from('team_members').delete().eq('id', id)
      await fetch('/api/dashboard/sync-team-transfer', { method: 'POST', credentials: 'include' }).catch(() => {})
      router.refresh()
    }
  }

  if (members.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No hay miembros del equipo. Agrega tu primer miembro.
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Contacto</TableHead>
          <TableHead>Extension</TableHead>
          <TableHead>Disponible</TableHead>
          <TableHead>Recibir llamadas</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{member.name}</span>
              </div>
            </TableCell>
            <TableCell>
              {member.role ? (
                <Badge variant="secondary">{member.role}</Badge>
              ) : (
                '-'
              )}
            </TableCell>
            <TableCell>
              <div className="flex gap-2">
                {member.phone && (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={`tel:${member.phone}`}>
                      <Phone className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                {member.email && (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={`mailto:${member.email}`}>
                      <Mail className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </TableCell>
            <TableCell>
              {member.extension || '-'}
            </TableCell>
            <TableCell>
              <Switch
                checked={member.is_available}
                onCheckedChange={(checked) => handleToggleAvailable(member.id, checked)}
              />
            </TableCell>
            <TableCell>
              <Switch
                checked={member.receives_calls !== false}
                onCheckedChange={(checked) => handleToggleReceivesCalls(member, checked)}
              />
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <EditTeamMemberDialog member={member} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => handleDelete(member.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  )
}
