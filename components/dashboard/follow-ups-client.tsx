'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { extractSwatCommercialPreview } from '@/lib/vapi/lead-classification'
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

export function FollowUpsClient({ initialFollowUps }: { initialFollowUps: FollowUp[] }) {
  const [rows, setRows] = useState(initialFollowUps)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const saveRow = async (row: FollowUp) => {
    try {
      setSavingId(row.id)
      await supabase
        .from('follow_ups')
        .update({
          status: row.status || 'pending',
          notes: row.notes || null,
          due_at: row.due_at || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      router.refresh()
    } finally {
      setSavingId(null)
    }
  }

  const deleteRow = async (id: string) => {
    const confirmed = window.confirm('¿Seguro que querés borrar este follow-up?')
    if (!confirmed) return
    setDeleteError(null)
    setDeletingId(id)
    try {
      const res = await fetch(`/api/dashboard/follow-ups/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        const msg = data?.message || data?.error || 'No se pudo borrar el follow-up'
        setDeleteError(msg)
        toast.error('No se pudo borrar el follow-up', { description: msg })
        return
      }
      toast.success('Follow-up borrado')
      router.refresh()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error de red al borrar follow-up'
      setDeleteError(msg)
      toast.error('No se pudo borrar el follow-up', { description: msg })
    } finally {
      setDeletingId(null)
    }
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No hay follow-ups registrados</p>
  }

  return (
    <div className="space-y-3">
      {deleteError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          {deleteError}
        </div>
      ) : null}
      {rows.map((item) => {
        const cust = customerFromRow(item)
        const commercial = extractSwatCommercialPreview(item.notes)
        return (
          <div key={item.id} className="rounded-lg border border-border p-3 space-y-2">
            <p className="font-medium">{humanizeFollowUpText(item)}</p>
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
              <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-2">
                {commercial}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Owner: {item.owner || 'Sin asignar'}</p>
            <div className="grid gap-2 md:grid-cols-4">
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
                value={item.due_at || ''}
                type="datetime-local"
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === item.id ? { ...r, due_at: e.target.value } : r)),
                  )
                }
              />
              <Button disabled={savingId === item.id} onClick={() => saveRow(item)}>
                {savingId === item.id ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button
                variant="destructive"
                disabled={deletingId === item.id}
                onClick={() => deleteRow(item.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deletingId === item.id ? 'Borrando...' : 'Borrar'}
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
    </div>
  )
}
