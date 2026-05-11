'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CalendarClock, Loader2 } from 'lucide-react'

type GoogleCalendarIntegrationCardProps = {
  connected: boolean
  calendarName: string | null
  timezone: string | null
}

export function GoogleCalendarIntegrationCard({
  connected,
  calendarName,
  timezone,
}: GoogleCalendarIntegrationCardProps) {
  const router = useRouter()
  const [disconnecting, setDisconnecting] = useState(false)

  const disconnect = async () => {
    try {
      setDisconnecting(true)
      await fetch('/api/integrations/google-calendar/disconnect', {
        method: 'POST',
        credentials: 'include',
      })
      router.refresh()
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Google Calendar</h2>
            <p className="text-sm text-muted-foreground">
              {connected ? 'Connected' : 'Not connected'}
            </p>
            {connected ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {calendarName || 'Calendar'}{timezone ? ` · ${timezone}` : ''}
              </p>
            ) : null}
          </div>
        </div>
        {connected ? (
          <Button variant="outline" onClick={disconnect} disabled={disconnecting}>
            {disconnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Disconnecting
              </>
            ) : (
              'Disconnect'
            )}
          </Button>
        ) : (
          <Button asChild>
            <a href="/api/integrations/google-calendar/connect">Connect</a>
          </Button>
        )}
      </div>
    </div>
  )
}
