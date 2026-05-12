'use client'

import { useState } from 'react'
import Link from 'next/link'
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
import { PhoneIncoming, PhoneOutgoing, Play, FileText, Download, Loader, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Call {
  id: string
  vapi_call_id?: string | null
  phone_number: string
  customer_name?: string | null
  intent?: string | null
  next_action?: string | null
  direction: 'inbound' | 'outbound'
  status: string
  duration_seconds: number
  recording_url: string | null
  transcript: string | null
  summary: string | null
  sentiment: string | null
  ended_reason?: string | null
  created_at: string
  leads: {
    id?: string
    name: string | null
    email: string | null
    phone: string
  } | null
  related_follow_up?: {
    id: string
    title: string
    status: string
    due_at: string | null
  } | null
  team_members: {
    name: string
  } | null
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  'in-progress': 'bg-blue-100 text-blue-800',
  ringing: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  'no-answer': 'bg-gray-100 text-gray-800',
  busy: 'bg-orange-100 text-orange-800',
}

const sentimentColors: Record<string, string> = {
  positive: 'bg-green-100 text-green-800',
  neutral: 'bg-gray-100 text-gray-800',
  negative: 'bg-red-100 text-red-800',
}

export function CallsTable({ calls }: { calls: Call[] }) {
  const router = useRouter()
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [audioLoading, setAudioLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Call | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handlePlayClick = (call: Call) => {
    if (!call.recording_url) return
    setSelectedCall(call)
    setAudioLoading(true)
    setIsPlayingAudio(true)
  }

  const handleTranscriptClick = (call: Call) => {
    setIsPlayingAudio(false)
    setSelectedCall(call)
  }

  const handleDownload = (recordingUrl: string) => {
    window.open(recordingUrl, '_blank')
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget?.id) return
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/dashboard/calls/${deleteTarget.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof body.error === 'string' ? body.error : 'No se pudo eliminar la llamada')
        return
      }
      toast.success('Llamada eliminada del historial')
      setDeleteTarget(null)
      setSelectedCall((c) => (c?.id === deleteTarget.id ? null : c))
      router.refresh()
    } catch {
      toast.error('Error de red al eliminar')
    } finally {
      setDeleteBusy(false)
    }
  }

  if (calls.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No hay llamadas registradas
      </div>
    )
  }

  return (
    <>
      <div className="w-full overflow-x-auto">
        <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Duracion</TableHead>
            <TableHead>Sentimiento</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.map((call) => (
            <TableRow key={call.id}>
              <TableCell>
                {call.direction === 'inbound' ? (
                  <PhoneIncoming className="h-4 w-4 text-green-600" />
                ) : (
                  <PhoneOutgoing className="h-4 w-4 text-primary" />
                )}
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">
                    {call.leads?.name || call.customer_name || call.phone_number}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {call.phone_number}
                  </p>
                  {call.intent && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tema: <span className="font-medium text-foreground">{call.intent}</span>
                    </p>
                  )}
                  {call.next_action && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      Seguimiento: {call.next_action}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge className={cn('capitalize', statusColors[call.status])}>
                  {call.status}
                </Badge>
              </TableCell>
              <TableCell>{formatDuration(call.duration_seconds || 0)}</TableCell>
              <TableCell>
                {call.sentiment && (
                  <Badge className={cn('capitalize', sentimentColors[call.sentiment])}>
                    {call.sentiment === 'positive' ? 'Positivo' : 
                     call.sentiment === 'negative' ? 'Negativo' : 'Neutral'}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <div>
                  <p className="text-sm">
                    {format(new Date(call.created_at), 'dd/MM/yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(call.created_at), 'HH:mm')}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {call.recording_url && (
                    <>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handlePlayClick(call)}
                        title="Reproducir grabación"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleDownload(call.recording_url!)}
                        title="Descargar grabación"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {(call.transcript ||
                    call.summary ||
                    call.recording_url ||
                    call.ended_reason) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTranscriptClick(call)}
                      title="Ver resumen y transcripción"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(call)}
                    title="Eliminar del historial"
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

      {/* Audio Player Dialog */}
      <Dialog open={isPlayingAudio && !!selectedCall} onOpenChange={(open) => {
        if (!open) {
          setSelectedCall(null)
          setIsPlayingAudio(false)
        }
      }}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reproducir Grabación</DialogTitle>
            <DialogDescription>
              {selectedCall?.leads?.name || selectedCall?.phone_number} • {formatDuration(selectedCall?.duration_seconds || 0)}
            </DialogDescription>
          </DialogHeader>
          {selectedCall?.recording_url && (
            <div className="space-y-4">
              <audio
                key={selectedCall.id}
                controls
                autoPlay
                crossOrigin="anonymous"
                className="w-full"
                onLoadStart={() => setAudioLoading(true)}
                onCanPlay={() => setAudioLoading(false)}
                onError={() => setAudioLoading(false)}
              >
                <source src={selectedCall.recording_url} type="audio/mpeg" />
                Tu navegador no soporta reproducción de audio.
              </audio>
              {audioLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader className="w-4 h-4 animate-spin" />
                  Cargando grabación...
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Si no reproduce en el navegador, usá «Descargar» o abrí el enlace desde el resumen
                (ícono de documento).
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(selectedCall.recording_url!)}
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transcript Dialog */}
      <Dialog open={!isPlayingAudio && !!selectedCall} onOpenChange={(open) => {
        if (!open) setSelectedCall(null)
      }}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transcripcion de Llamada</DialogTitle>
            <DialogDescription>
              {selectedCall?.leads?.name ||
                selectedCall?.customer_name ||
                selectedCall?.phone_number}{' '}
              - {selectedCall && format(new Date(selectedCall.created_at), 'dd/MM/yyyy HH:mm')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedCall?.vapi_call_id && (
              <div className="rounded-lg border p-3 text-sm font-mono text-xs break-all">
                <span className="font-medium font-sans">ID llamada: </span>
                {selectedCall.vapi_call_id}
              </div>
            )}
            {selectedCall?.intent && (
              <div className="rounded-lg border p-3 text-sm">
                <span className="font-medium">Tema / intención: </span>
                {selectedCall.intent}
              </div>
            )}
            {selectedCall?.ended_reason && (
              <div className="rounded-lg border p-3 text-sm">
                <span className="font-medium">Motivo de cierre: </span>
                <span className="font-mono text-xs">{selectedCall.ended_reason}</span>
              </div>
            )}
            {selectedCall?.recording_url && (
              <div className="rounded-lg border p-3 text-sm">
                <span className="font-medium">Grabación: </span>
                <a
                  href={selectedCall.recording_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline break-all"
                >
                  Abrir enlace
                </a>
              </div>
            )}
            {selectedCall?.leads && (
              <div className="rounded-lg border p-3 text-sm">
                <span className="font-medium">Lead relacionado: </span>
                <Link href="/dashboard/leads" className="text-primary underline">
                  {selectedCall.leads.name || selectedCall.leads.phone}
                </Link>
              </div>
            )}
            {selectedCall?.related_follow_up && (
              <div className="rounded-lg border p-3 text-sm">
                <span className="font-medium">Seguimiento: </span>
                {selectedCall.related_follow_up.title}
                <span className="text-muted-foreground">
                  {' '}
                  ({selectedCall.related_follow_up.status}
                  {selectedCall.related_follow_up.due_at
                    ? ` · ${format(new Date(selectedCall.related_follow_up.due_at), 'dd/MM/yyyy', { locale: es })}`
                    : ''}
                  )
                </span>
              </div>
            )}
            {selectedCall?.next_action && (
              <div className="rounded-lg border p-3 text-sm">
                <span className="font-medium">Próximo paso: </span>
                {selectedCall.next_action}
              </div>
            )}
            {selectedCall?.summary && (
              <div className="rounded-lg bg-muted p-4">
                <h4 className="mb-2 font-medium">Resumen</h4>
                <p className="text-sm">{selectedCall.summary}</p>
              </div>
            )}
            {selectedCall?.transcript && (
              <div className="max-h-96 overflow-y-auto rounded-lg border p-4">
                <h4 className="mb-2 font-medium">Transcripcion Completa</h4>
                <p className="whitespace-pre-wrap text-sm">{selectedCall.transcript}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleteBusy && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar llamada</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra solo el registro de esta llamada en el panel (transcripción, resumen, vínculo a
              grabación). No elimina al cliente ni el lead en «Leads».
              {deleteTarget && (
                <span className="mt-2 block font-medium text-foreground">
                  {deleteTarget.leads?.name || deleteTarget.customer_name || deleteTarget.phone_number}
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
                void handleDeleteConfirm()
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
