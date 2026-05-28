'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DailyCallEntry, DailyCallSummary, DailyLeadEntry } from '@/lib/dashboard/daily-call-summary-types'
import {
  CalendarClock,
  Phone,
  UserPlus,
  ShieldAlert,
  ListChecks,
  PhoneMissed,
} from 'lucide-react'

function formatTime(iso: string) {
  try {
    return format(new Date(iso), 'HH:mm', { locale: es })
  } catch {
    return '—'
  }
}

function CallTable({ rows, empty }: { rows: DailyCallEntry[]; empty: string }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Hora</TableHead>
          <TableHead>Contacto</TableHead>
          <TableHead>Motivo</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">{formatTime(c.at)}</TableCell>
            <TableCell>
              <div className="font-medium">{c.contactName}</div>
              <div className="text-xs text-muted-foreground">{c.phone}</div>
            </TableCell>
            <TableCell className="max-w-md text-sm">{c.reason}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {c.followUp ? <Badge variant="default">Seguimiento</Badge> : null}
                {c.isNewLead ? <Badge variant="secondary">Lead nuevo</Badge> : null}
                {c.bucket === 'spam' ? <Badge variant="outline">Spam</Badge> : null}
                {c.bucket === 'missed' ? <Badge variant="outline">Perdida</Badge> : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function LeadsTable({ rows }: { rows: DailyLeadEntry[] }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No hubo leads nuevos este día.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Hora</TableHead>
          <TableHead>Nombre</TableHead>
          <TableHead>Teléfono</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((l) => (
          <TableRow key={l.id}>
            <TableCell className="text-muted-foreground">{formatTime(l.createdAt)}</TableCell>
            <TableCell>{l.name || '—'}</TableCell>
            <TableCell>{l.phone}</TableCell>
            <TableCell>{l.status || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function DailySummaryView({
  summary,
  initialDateKey,
}: {
  summary: DailyCallSummary
  initialDateKey: string
}) {
  const router = useRouter()
  const s = summary.stats

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resumen del día</h1>
          <p className="text-muted-foreground capitalize">{summary.dateLabel}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Zona horaria: {summary.timezone} · Solo lectura; no modifica el asistente de voz.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <Label htmlFor="summary-date">Fecha</Label>
          <Input
            id="summary-date"
            type="date"
            defaultValue={initialDateKey}
            onChange={(e) => {
              const v = e.target.value
              if (v) router.push(`/dashboard/resumen?date=${v}`)
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" /> Llamadas
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{s.totalCalls}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <ListChecks className="h-3.5 w-3.5" /> Seguimiento
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{s.needFollowUp}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <UserPlus className="h-3.5 w-3.5" /> Leads nuevos
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{s.newLeads}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" /> Spam / bot
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{s.spamOrBot}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <PhoneMissed className="h-3.5 w-3.5" /> Perdidas
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{s.missed}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" /> Sin seguimiento
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{s.noFollowUp}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prioridad: hacer seguimiento</CardTitle>
          <CardDescription>Quién llamó, por qué y qué conviene hacer hoy</CardDescription>
        </CardHeader>
        <CardContent>
          <CallTable rows={summary.followUpCalls} empty="Nada urgente marcado para seguimiento hoy." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leads nuevos del día</CardTitle>
          <CardDescription>Entraron por llamada o formulario en este período</CardDescription>
        </CardHeader>
        <CardContent>
          <LeadsTable rows={summary.newLeads} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Otras llamadas útiles</CardTitle>
          <CardDescription>Atendidas sin seguimiento pendiente explícito</CardDescription>
        </CardHeader>
        <CardContent>
          <CallTable rows={summary.normalCalls} empty="No hay otras llamadas clasificadas así hoy." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spam, bot o ruido</CardTitle>
          <CardDescription>No requieren seguimiento comercial</CardDescription>
        </CardHeader>
        <CardContent>
          <CallTable rows={summary.spamCalls} empty="Sin spam detectado hoy." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Llamadas perdidas / muy cortas</CardTitle>
          <CardDescription>Colgó rápido o sin datos útiles</CardDescription>
        </CardHeader>
        <CardContent>
          <CallTable rows={summary.missedCalls} empty="Sin llamadas perdidas hoy." />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Ver detalle completo en{' '}
        <Link href="/dashboard/calls" className="underline">
          Llamadas
        </Link>{' '}
        y{' '}
        <Link href="/dashboard/leads" className="underline">
          Leads
        </Link>
        .
      </p>
    </div>
  )
}
