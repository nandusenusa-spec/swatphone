'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Plan = 'starter' | 'pro' | 'enterprise'

export function BillingActions() {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout(plan: Plan, includeSetup: boolean) {
    setBusy(plan)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, include_setup: includeSetup }),
      })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) {
        setError(json.error || 'No se pudo iniciar el checkout')
        setBusy(null)
        return
      }
      window.location.href = json.url
    } catch {
      setError('Error de red')
      setBusy(null)
    }
  }

  async function openPortal() {
    setBusy('portal')
    setError(null)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) {
        setError(json.error || 'No se pudo abrir el portal')
        setBusy(null)
        return
      }
      window.location.href = json.url
    } catch {
      setError('Error de red')
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!!busy} onClick={() => startCheckout('starter', false)}>
          {busy === 'starter' ? 'Redirigiendo…' : 'Starter'}
        </Button>
        <Button disabled={!!busy} variant="secondary" onClick={() => startCheckout('pro', false)}>
          {busy === 'pro' ? 'Redirigiendo…' : 'Pro'}
        </Button>
        <Button disabled={!!busy} variant="secondary" onClick={() => startCheckout('enterprise', false)}>
          {busy === 'enterprise' ? 'Redirigiendo…' : 'Enterprise'}
        </Button>
        <Button disabled={!!busy} variant="outline" onClick={() => startCheckout('starter', true)}>
          Starter + setup
        </Button>
      </div>
      <Button disabled={!!busy} variant="outline" onClick={openPortal}>
        {busy === 'portal' ? 'Abriendo…' : 'Gestionar suscripción'}
      </Button>
    </div>
  )
}
