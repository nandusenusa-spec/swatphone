'use client'

import { useState } from 'react'
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
import { PhoneIncoming, PhoneOutgoing, Play, FileText, Download, Loader } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface Call {
  id: string
  phone_number: string
  direction: 'inbound' | 'outbound'
  status: string
  duration_seconds: number
  recording_url: string | null
  transcript: string | null
  summary: string | null
  sentiment: string | null
  created_at: string
  leads: {
    name: string | null
    email: string | null
    phone: string
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
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [audioLoading, setAudioLoading] = useState(false)

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
    setSelectedCall(call)
    setIsPlayingAudio(false)
  }

  const handleDownload = (recordingUrl: string) => {
    window.open(recordingUrl, '_blank')
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
      <Table>
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
                    {call.leads?.name || call.phone_number}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {call.phone_number}
                  </p>
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
                  {call.transcript && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTranscriptClick(call)}
                      title="Ver transcripción"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Audio Player Dialog */}
      <Dialog open={isPlayingAudio && !!selectedCall} onOpenChange={(open) => {
        if (!open) {
          setSelectedCall(null)
          setIsPlayingAudio(false)
        }
      }}>
        <DialogContent className="max-w-2xl">
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
                className="w-full"
                onLoadStart={() => setAudioLoading(true)}
                onCanPlay={() => setAudioLoading(false)}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transcripcion de Llamada</DialogTitle>
            <DialogDescription>
              {selectedCall?.leads?.name || selectedCall?.phone_number} -{' '}
              {selectedCall && format(new Date(selectedCall.created_at), 'dd/MM/yyyy HH:mm')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
    </>
  )
}
