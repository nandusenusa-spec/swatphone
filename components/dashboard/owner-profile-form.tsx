'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, User } from 'lucide-react'
import { toast } from 'sonner'

export function OwnerProfileForm({
  initialFullName,
  initialEmail,
  demoMode = false,
}: {
  initialFullName: string
  initialEmail: string
  demoMode?: boolean
}) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [fullName, setFullName] = useState(initialFullName)
  const [email, setEmail] = useState(initialEmail)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (demoMode) {
      toast.error('Modo demo: el perfil no se puede editar')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/api/dashboard/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof body.message === 'string' ? body.message : body.error || 'Error al guardar')
      }
      toast.success('Perfil actualizado')
      router.refresh()
    } catch (err) {
      toast.error('No se pudo guardar el perfil', {
        description: err instanceof Error ? err.message : 'Error desconocido',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="owner-full-name">Nombre visible (dueño / cuenta)</Label>
        <Input
          id="owner-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Tu nombre"
          disabled={demoMode}
        />
        <p className="text-xs text-muted-foreground">
          Aparece en el menú lateral y en la cabecera del panel.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="owner-email">Email de la cuenta</Label>
        <Input
          id="owner-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@empresa.com"
          required
          disabled={demoMode}
        />
      </div>
      <Button type="submit" disabled={isLoading || demoMode}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Guardar perfil
          </>
        )}
      </Button>
    </form>
  )
}

export function OwnerProfileCardTitle() {
  return (
    <span className="flex items-center gap-2">
      <User className="h-5 w-5" />
      Tu cuenta
    </span>
  )
}
