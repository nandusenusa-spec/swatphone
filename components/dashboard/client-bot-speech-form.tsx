'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mic, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { CLIENT_WELCOME_MESSAGE_MAX } from '@/lib/vapi/client-speech-prompt'

type Props = {
  organizationName: string
  initialWelcomeMessage: string
  initialClientSpeechNotes: string
}

export function ClientBotSpeechForm({
  organizationName,
  initialWelcomeMessage,
  initialClientSpeechNotes,
}: Props) {
  const [welcomeMessage, setWelcomeMessage] = useState(initialWelcomeMessage)
  const [clientSpeechNotes, setClientSpeechNotes] = useState(initialClientSpeechNotes)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = welcomeMessage.trim()
    if (!trimmed) {
      toast.error('Escribí el mensaje de bienvenida')
      return
    }
    if (trimmed.length > CLIENT_WELCOME_MESSAGE_MAX) {
      toast.error(`El saludo puede tener como máximo ${CLIENT_WELCOME_MESSAGE_MAX} caracteres`)
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/bot-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          welcome_message: trimmed,
          client_speech_notes: clientSpeechNotes.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(
          data.error === 'welcome_message_required'
            ? 'El mensaje de bienvenida es obligatorio'
            : 'No se pudo guardar. Intentá de nuevo.',
        )
        return
      }
      setWelcomeMessage(String(data.welcome_message || trimmed))
      toast.success(
        typeof data.sync_message === 'string'
          ? data.sync_message
          : 'Cambios guardados',
      )
    } catch {
      toast.error('Error de red al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleSyncAssistant = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/dashboard/sync-assistant', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      const msg =
        typeof data.message === 'string'
          ? data.message
          : 'No se pudo actualizar. Probá de nuevo o contactá a SWAT.'
      if (res.ok && data.ok) {
        toast.success(msg)
      } else {
        toast.error(msg)
      }
    } catch {
      toast.error('Error de red. Probá de nuevo en un minuto.')
    } finally {
      setSyncing(false)
    }
  }

  const charsLeft = CLIENT_WELCOME_MESSAGE_MAX - welcomeMessage.trim().length

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Lo que dice el bot al contestar
          </CardTitle>
          <CardDescription>
            Editá el saludo de {organizationName}. Nosotros aplicamos los cambios al asistente de voz; no
            necesitás entrar a Vapi ni ver claves técnicas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="welcome_message">Mensaje de bienvenida</Label>
            <Textarea
              id="welcome_message"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder={`Hola, gracias por llamar a ${organizationName}. ¿En qué puedo ayudarte?`}
              rows={3}
              maxLength={CLIENT_WELCOME_MESSAGE_MAX}
            />
            <p className="text-xs text-muted-foreground">
              Corto y claro (máx. {CLIENT_WELCOME_MESSAGE_MAX} caracteres). Quedan {Math.max(0, charsLeft)}.
              Es lo primero que escucha quien llama.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_speech_notes">Tono y estilo (opcional)</Label>
            <Textarea
              id="client_speech_notes"
              value={clientSpeechNotes}
              onChange={(e) => setClientSpeechNotes(e.target.value)}
              placeholder="Ej.: Formal pero cercano. Siempre ofrecer cita. No prometer precios sin revisar."
              rows={5}
              maxLength={1200}
            />
            <p className="text-xs text-muted-foreground">
              En tus palabras: cómo querés que hable. Las reglas de transferencias y herramientas las
              configura el equipo SWAT en Admin.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button type="submit" disabled={saving || syncing}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar texto'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving || syncing}
              onClick={handleSyncAssistant}
            >
              {syncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Actualizando…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Actualizar asistente de voz
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Primero guardá el texto. Después tocá <strong>Actualizar asistente de voz</strong> para que
            suene en el teléfono. Si no sabés usar la PC, guardá y pedile a SWAT que pulse el mismo botón
            desde Admin.
          </p>
        </CardContent>
      </Card>
    </form>
  )
}
