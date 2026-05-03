'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Appointment = {
  id: string
  date?: string | null
  time?: string | null
  status?: string | null
  notes?: string | null
  source?: string | null
  customers?: {
    name?: string | null
    phone?: string | null
  } | null
}

export function AppointmentsClient({ initialAppointments }: { initialAppointments: Appointment[] }) {
  const [rows, setRows] = useState(initialAppointments)
  const [savingId, setSavingId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const saveRow = async (row: Appointment) => {
    try {
      setSavingId(row.id)
      await supabase
        .from('appointments')
        .update({
          status: row.status || 'scheduled',
          notes: row.notes || null,
          date: row.date || null,
          time: row.time || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      router.refresh()
    } finally {
      setSavingId(null)
    }
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No hay citas registradas</p>
  }

  return (
    <div className="space-y-3">
      {rows.map((item) => (
        <div key={item.id} className="rounded-lg border border-border p-3 space-y-2">
          <p className="font-medium">{item.customers?.name || 'Cliente sin nombre'}</p>
          <p className="text-sm text-muted-foreground">
            Tel: {item.customers?.phone || 'N/A'} · Motivo: {item.notes || 'Sin detalle'}
          </p>
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              value={item.date || ''}
              type="date"
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r) => (r.id === item.id ? { ...r, date: e.target.value } : r)),
                )
              }
            />
            <Input
              value={item.time || ''}
              type="time"
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r) => (r.id === item.id ? { ...r, time: e.target.value } : r)),
                )
              }
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={item.status || 'scheduled'}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r) => (r.id === item.id ? { ...r, status: e.target.value } : r)),
                )
              }
            >
              <option value="scheduled">scheduled</option>
              <option value="confirmed">confirmed</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
            <Button disabled={savingId === item.id} onClick={() => saveRow(item)}>
              {savingId === item.id ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Fuente: {item.source || 'asistente'}</p>
        </div>
      ))}
    </div>
  )
}
