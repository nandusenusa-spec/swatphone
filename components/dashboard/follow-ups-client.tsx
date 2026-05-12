'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { extractSwatCommercialPreview } from '@/lib/vapi/lead-classification'
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
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type CustomerJoin = { name: string | null; phone: string | null } | null

export type FollowUp = {
  id: string
  title?: string | null
  notes?: string | null
  owner?: string | null
  status?: string | null
  due_at?: string | null
  priority?: string | null
  callback_required?: boolean | null
  customers?: CustomerJoin | CustomerJoin[] | null
}

function customerFromRow(item: FollowUp): { name: string | null; phone: string | null } {
  const c = item.customers
  if (!c) return { name: null, phone: null }
  const row = Array.isArray(c) ? c[0] : c
  return { name: row?.name ?? null, phone: row?.phone ?? null }
}

function humanizeFollowUpText(item: FollowUp) {
  const base = (item.title || item.notes || 'Seguimiento pendiente').trim()
  const lower = base.toLowerCase()
  if (lower.includes('customer-ended-call-before-warm-transfer')) {
    return 'El cliente cortó antes de completar la transferencia. Conviene devolver la llamada.'
  }
  if (lower.includes('customer-ended-call-after-warm-transfer-attempt')) {
    return 'La transferencia no se completó. Conviene contactar al cliente para retomar.'
  }
  if (lower.includes('transferencia no completada')) {
    return 'Transferencia no completada. Se requiere seguimiento.'
  }
  return base
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function FollowUpsClient({ initialFollowUps }: { initialFollowUps: FollowUp[] }) {
  const [rows, setRows] = useState(initialFollowUps)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FollowUp | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setRows(initialFollowUps)
  }, [initialFollowUps])

  const saveRow = async (row: FollowUp) => {
    setSavingId(row.id)
    try {
      const res = await fetch(`/api/dashboard/follow-ups/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: row.status || 'pending',
          notes: row.notes ?? null,
          due_at: row.due_at && String(row.due_at).trim() ? row.due_at : null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof body.error === 'string' ? body.error : 'No se pudo guardar')
        return
      }
      toast.success('Seguimiento guardado')
      router.refresh()
    } catch {
      toast.error('Error de red al guardar')
    } finally {
      setSavingId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/dashboard/follow-ups/${deleteTarget.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof body.error === 'string' ? body.error : 'No se pudo eliminar')
        return
      }
      toast.success('Seguimiento eliminado')
      setDeleteTarget(null)
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      router.refresh()
    } catch {
      toast.error('Error de red')
    } finally {
      setDeleteBusy(false)
    }
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No hay follow-ups registrados</p>
  }

  return (
    <div className="space-y-3">
      {rows.map((item) => {
        const cust = customerFromRow(item)
        const commercial = extractSwatCommercialPreview(item.notes)
        return (
          <div key={item.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium">{humanizeFollowUpText(item)}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                title="Eliminar seguimiento"
                onClick={() => setDeleteTarget(item)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {(cust.name || cust.phone) && (
              <p className="text-sm text-muted-foreground">
                Cliente: {[cust.name, cust.phone].filter(Boolean).join(' · ') || '—'}
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              {item.priority && (
                <span className="rounded-md bg-muted px-2 py-0.5">Prioridad: {item.priority}</span>
              )}
              {item.callback_required ? (
                <span className="rounded-md bg-amber-950/30 px-2 py-0.5 text-amber-200">
                  Callback requerido
                </span>
              ) : null}
              {item.due_at && (
                <span className="rounded-md bg-muted px-2 py-0.5">
                  Vence: {new Date(item.due_at).toLocaleString()}
                </span>
              )}
            </div>
            {commercial && (
              <p className="border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">{commercial}</p>
            )}
            <p className="text-xs text-muted-foreground">Owner: {item.owner || 'Sin asignar'}</p>
            <div className="grid gap-2 md:grid-cols-3">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={item.status || 'pending'}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === item.id ? { ...r, status: e.target.value } : r)),
                  )
                }
              >
                <option value="pending">pending</option>
                <option value="in_progress">in_progress</option>
                <option value="done">done</option>
                <option value="cancelled">cancelled</option>
              </select>
              <Input
                value={toDatetimeLocalValue(item.due_at)}
                type="datetime-local"
                onChange={(e) => {
                  const v = e.target.value
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === item.id
                        ? {
                            ...r,
                            due_at: v ? new Date(v).toISOString() : null,
                          }
                        : r,
                    ),
                  )
                }}
              />
              <Button type="button" disabled={savingId === item.id} onClick={() => void saveRow(item)}>
                {savingId === item.id ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
            <Input
              value={item.notes || ''}
              placeholder="Notas de seguimiento"
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r) => (r.id === item.id ? { ...r, notes: e.target.value } : r)),
                )
              }
            />
          </div>
        )
      })}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleteBusy && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar seguimiento</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra esta tarea de la lista. No elimina al cliente ni el lead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleteBusy ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
