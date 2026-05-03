'use client'

import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Play } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'

interface Call {
  id: string
  phone_number: string
  direction: 'inbound' | 'outbound'
  status: string
  duration_seconds: number
  recording_url?: string | null
  transcript?: string | null
  created_at: string
  leads: {
    name: string | null
    phone: string
  } | null
}

export function RecentCallsList({ calls }: { calls: Call[] }) {
  if (calls.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No hay llamadas recientes
      </div>
    )
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusIcon = (direction: string, status: string) => {
    if (status === 'no-answer' || status === 'failed') {
      return <PhoneMissed className="h-4 w-4 text-destructive" />
    }
    if (direction === 'inbound') {
      return <PhoneIncoming className="h-4 w-4 text-green-600" />
    }
    return <PhoneOutgoing className="h-4 w-4 text-primary" />
  }

  return (
    <div className="space-y-4">
      {calls.map((call) => (
        <div
          key={call.id}
          className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              {getStatusIcon(call.direction, call.status)}
            </div>
            <div>
              <p className="text-sm font-medium">
                {call.leads?.name || call.phone_number}
              </p>
              <p className="text-xs text-muted-foreground">
                {call.phone_number}
              </p>
              {call.transcript && (
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {call.transcript}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">
              {formatDuration(call.duration_seconds || 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(call.created_at), { 
                addSuffix: true,
                locale: es 
              })}
            </p>
            <div className="mt-1 flex justify-end gap-1">
              {call.recording_url && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => window.open(call.recording_url!, '_blank')}
                  title="Ver grabación"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
