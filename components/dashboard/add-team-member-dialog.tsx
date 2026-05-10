'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function AddTeamMemberDialog() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    phone: '',
    email: '',
    extension: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Get organization_id from profile
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) {
        throw new Error(authErr?.message || 'Sesion expirada. Volve a iniciar sesion.')
      }

      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()
      if (profErr || !profile?.organization_id) {
        throw new Error(profErr?.message || 'No se encontro tu organizacion en el perfil.')
      }

      const { data: inserted, error: insErr } = await supabase
        .from('team_members')
        .insert({
          organization_id: profile.organization_id,
          name: formData.name,
          role: formData.role || null,
          phone: formData.phone || null,
          email: formData.email || null,
          extension: formData.extension || null,
          is_available: true,
        })
        .select()
        .single()
      if (insErr) {
        const code = (insErr as { code?: string }).code
        const detail = [insErr.message, insErr.details, insErr.hint, code ? `code=${code}` : '']
          .filter(Boolean)
          .join(' • ')
        throw new Error(detail || 'Error desconocido al guardar')
      }
      if (!inserted) {
        throw new Error('Insert sin error pero sin filas devueltas (posible RLS bloqueando lectura post-insert)')
      }

      await fetch('/api/dashboard/sync-team-transfer', { method: 'POST', credentials: 'include' }).catch(() => {})

      toast.success('Miembro agregado', { description: formData.name })
      setOpen(false)
      setFormData({
        name: '',
        role: '',
        phone: '',
        email: '',
        extension: '',
      })
      router.refresh()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido'
      console.error('Error adding team member:', error)
      toast.error('No se pudo agregar el miembro', { description: msg, duration: 8000 })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Miembro
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Miembro del Equipo</DialogTitle>
          <DialogDescription>
            Agrega un miembro del equipo para recibir transferencias de llamadas
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre Completo</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Juan Perez"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Rol / Cargo</Label>
            <Input
              id="role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              placeholder="Ej: Ventas, Soporte, Gerente"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1234567890"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="extension">Extension</Label>
              <Input
                id="extension"
                value={formData.extension}
                onChange={(e) => setFormData({ ...formData, extension: e.target.value })}
                placeholder="101"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="juan@empresa.com"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar Miembro'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
