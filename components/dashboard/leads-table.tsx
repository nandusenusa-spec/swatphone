'use client'

import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Eye, Phone, Mail, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { EditLeadDialog } from './edit-lead-dialog'

interface Lead {
  id: string
  rowKind?: 'lead' | 'customer' | 'call'
  name: string | null
  email: string | null
  phone: string
  company: string | null
  status: string
  score: number
  /** Score efectivo para UI (clasificación / metadata si la columna score sigue en 0). */
  display_score?: number
  category?: string | null
  priority?: string | null
  summary?: string | null
  next_action?: string | null
  score_reasons: string[]
  interests: string[]
  notes: string | null
  created_at: string
  team_members: {
    name: string
  } | null
}

interface TeamMember {
  id: string
  name: string
}

const statusConfig: Record<string, { label: string; color: string }> = {
  new: { label: 'Nuevo', color: 'bg-blue-100 text-blue-800' },
  contacted: { label: 'Contactado', color: 'bg-yellow-100 text-yellow-800' },
  qualified: { label: 'Calificado', color: 'bg-green-100 text-green-800' },
  unqualified: { label: 'No Calificado', color: 'bg-gray-100 text-gray-800' },
  converted: { label: 'Convertido', color: 'bg-emerald-100 text-emerald-800' },
  lost: { label: 'Perdido', color: 'bg-red-100 text-red-800' },
}

export function LeadsTable({ leads, teamMembers }: { leads: Lead[]; teamMembers: TeamMember[] }) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleStatusChange = async (lead: Lead, newStatus: string) => {
    if (lead.id.startsWith('call-') || lead.rowKind === 'call') {
      toast.error('Este registro vino de una llamada, no es un lead aún', {
        description: 'Editalo desde el botón "lápiz" para convertirlo en lead.',
        duration: 6000,
      })
      return
    }
    if (lead.rowKind === 'customer') {
      toast.error('Este contacto está en clientes, no en leads', {
        description: 'Usá el lápiz para crear o actualizar el lead formal.',
        duration: 6000,
      })
      return
    }
    const { data, error } = await supabase
      .from('leads')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', lead.id)
      .select('id')
    if (error) {
      toast.error('No se pudo actualizar el estado', { description: error.message })
      return
    }
    if (!data || data.length === 0) {
      // El id no existe en `leads` (probablemente vino de `customers`). Avisar.
      toast.error('Este contacto aún no es un lead real', {
        description: 'Click en el lápiz para editarlo y se creará automáticamente.',
        duration: 6000,
      })
      return
    }
    toast.success('Estado actualizado')
    router.refresh()
  }

  const handleDeleteLeadConfirm = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      const rk = deleteTarget.rowKind
      let url: string | null = null
      if (rk === 'lead' || (!rk && !deleteTarget.id.startsWith('call-'))) {
        url = `/api/dashboard/leads/${deleteTarget.id}`
      } else if (rk === 'call' || deleteTarget.id.startsWith('call-')) {
        const raw = deleteTarget.id.replace(/^call-/i, '')
        if (!raw || !/^[0-9a-f-]{36}$/i.test(raw)) {
          toast.error('ID de llamada inválido')
          return
        }
        url = `/api/dashboard/calls/${raw}`
      } else {
        toast.error('Eliminá contactos desde administración o creá primero un lead con el lápiz.')
        return
      }
      const res = await fetch(url, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof body.error === 'string' ? body.error : 'No se pudo eliminar')
        return
      }
      toast.success(rk === 'call' || deleteTarget.id.startsWith('call-') ? 'Llamada quitada del listado' : 'Lead eliminado')
      setDeleteTarget(null)
      router.refresh()
    } catch {
      toast.error('Error de red')
    } finally {
      setDeleteBusy(false)
    }
  }

  const effScore = (lead: Lead) =>
    typeof lead.display_score === 'number' ? lead.display_score : lead.score

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600'
    if (score >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (leads.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No hay leads registrados
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contacto</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Prioridad</TableHead>
            <TableHead>Motivo / resumen</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Asignado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{lead.name || 'Sin nombre'}</p>
                  <p className="text-xs text-muted-foreground">{lead.phone}</p>
                </div>
              </TableCell>
              <TableCell>
                {lead.category ? (
                  <Badge variant="outline" className="font-normal">
                    {lead.category}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {lead.priority ? (
                  <Badge
                    variant="secondary"
                    className={cn(
                      'font-normal',
                      lead.priority === 'high' || lead.priority === 'urgent'
                        ? 'border-amber-600/30 bg-amber-500/10 text-amber-900 dark:text-amber-100'
                        : '',
                    )}
                  >
                    {lead.priority}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="max-w-[220px]">
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {lead.summary || lead.notes?.replace(/\[swat_commercial\][\s\S]*?\[\/swat_commercial\]/i, '').trim() || '—'}
                </p>
                {lead.next_action ? (
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">Próximo paso:</span> {lead.next_action}
                  </p>
                ) : null}
              </TableCell>
              <TableCell>{lead.company || '-'}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        effScore(lead) >= 70 ? 'bg-green-500' :
                        effScore(lead) >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      )}
                      style={{ width: `${effScore(lead)}%` }}
                    />
                  </div>
                  <span className={cn('text-sm font-medium', getScoreColor(effScore(lead)))}>
                    {effScore(lead)}%
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Select
                  value={lead.status}
                  onValueChange={(value) => void handleStatusChange(lead, value)}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {lead.team_members?.name || '-'}
              </TableCell>
              <TableCell>
                {format(new Date(lead.created_at), 'dd/MM/yyyy')}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {lead.rowKind !== 'call' && !lead.id.startsWith('call-') && <EditLeadDialog lead={lead} />}
                  <Button size="sm" variant="ghost" asChild>
                    <a href={`tel:${lead.phone}`}>
                      <Phone className="h-4 w-4" />
                    </a>
                  </Button>
                  {lead.email && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`mailto:${lead.email}`}>
                        <Mail className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  {(lead.rowKind === 'lead' || lead.rowKind === 'call' || lead.id.startsWith('call-')) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      title={
                        lead.rowKind === 'call' || lead.id.startsWith('call-')
                          ? 'Quitar esta llamada del listado'
                          : 'Eliminar lead'
                      }
                      onClick={() => setDeleteTarget(lead)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Lead details dialog */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedLead?.name || 'Lead'}</DialogTitle>
            <DialogDescription>
              Detalles completos del lead
            </DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Telefono</p>
                  <p className="font-medium">{selectedLead.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedLead.email || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Empresa</p>
                  <p className="font-medium">{selectedLead.company || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Score</p>
                  <p className={cn('font-medium', getScoreColor(effScore(selectedLead)))}>
                    {effScore(selectedLead)}%
                  </p>
                </div>
              </div>

              {(selectedLead.category || selectedLead.priority || selectedLead.summary || selectedLead.next_action) && (
                <div className="grid grid-cols-1 gap-2 rounded-md border p-3 text-sm">
                  {selectedLead.category ? (
                    <p>
                      <span className="text-muted-foreground">Categoría: </span>
                      {selectedLead.category}
                    </p>
                  ) : null}
                  {selectedLead.priority ? (
                    <p>
                      <span className="text-muted-foreground">Prioridad: </span>
                      {selectedLead.priority}
                    </p>
                  ) : null}
                  {selectedLead.summary ? (
                    <p>
                      <span className="text-muted-foreground">Resumen: </span>
                      {selectedLead.summary}
                    </p>
                  ) : null}
                  {selectedLead.next_action ? (
                    <p>
                      <span className="text-muted-foreground">Próxima acción: </span>
                      {selectedLead.next_action}
                    </p>
                  ) : null}
                </div>
              )}

              {selectedLead.interests && selectedLead.interests.length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Intereses</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedLead.interests.map((interest, i) => (
                      <Badge key={i} variant="secondary">{interest}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedLead.score_reasons && selectedLead.score_reasons.length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Razones del Score</p>
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {selectedLead.score_reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedLead.notes && (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Notas</p>
                  <p className="text-sm">{selectedLead.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleteBusy && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.rowKind === 'call' || deleteTarget?.id.startsWith('call-')
                ? 'Quitar llamada del listado'
                : 'Eliminar lead'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.rowKind === 'call' || deleteTarget?.id.startsWith('call-')
                ? 'Se borra el registro de la llamada en el panel (no el lead en CRM si ya existe).'
                : 'Se elimina el lead de la base. Esta acción no se puede deshacer.'}
              {deleteTarget && (
                <span className="mt-2 block font-medium text-foreground">
                  {deleteTarget.name || deleteTarget.phone}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void handleDeleteLeadConfirm()
              }}
            >
              {deleteBusy ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
