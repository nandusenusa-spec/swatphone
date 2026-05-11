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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Lead {
  id: string
  name: string | null
  phone: string
  email: string | null
  company: string | null
  status: string
  score: number
}

export function EditLeadDialog({ lead }: { lead: Lead }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: lead.name || '',
    phone: lead.phone,
    email: lead.email || '',
    company: lead.company || '',
    status: lead.status,
    score: lead.score.toString(),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const payload = {
        name: formData.name || null,
        phone: formData.phone,
        email: formData.email || null,
        company: formData.company || null,
        status: formData.status,
        score: parseInt(formData.score) || 0,
        updated_at: new Date().toISOString(),
      }

      const isFromCall = lead.id.startsWith('call-')
      let updateData: any = null
      let updateError: any = null

      if (!isFromCall) {
        const { data, error } = await supabase
          .from('leads')
          .update(payload)
          .eq('id', lead.id)
          .select('id')
        updateData = data
        updateError = error
      }

      // Si la fila no era un lead real (id de call_log o de customer), insertamos
      if (isFromCall || (!updateError && (!updateData || updateData.length === 0))) {
        const { data: { user }, error: authErr } = await supabase.auth.getUser()
        if (authErr || !user) throw new Error(authErr?.message || 'Sesion expirada')

        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single()
        if (profErr || !profile?.organization_id) {
          throw new Error(profErr?.message || 'No se encontro tu organizacion')
        }

        const { data: inserted, error: insErr } = await supabase
          .from('leads')
          .insert({ ...payload, organization_id: profile.organization_id })
          .select('id')
          .single()

        if (insErr) {
          const code = (insErr as { code?: string }).code
          throw new Error(`${insErr.message}${code ? ` (${code})` : ''}`)
        }
        toast.success('Lead creado', { description: formData.name || formData.phone })
      } else if (updateError) {
        const code = (updateError as { code?: string }).code
        throw new Error(`${updateError.message}${code ? ` (${code})` : ''}`)
      } else {
        toast.success('Lead actualizado', { description: formData.name || formData.phone })
      }

      setOpen(false)
      router.refresh()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido'
      console.error('Error updating lead:', error)
      toast.error('No se pudo guardar', { description: msg, duration: 8000 })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Lead</DialogTitle>
          <DialogDescription>
            Actualiza la informacion del prospecto
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nombre del cliente"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefono</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 555 1234"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">Empresa</Label>
            <Input
              id="company"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="Nombre de la empresa"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Nuevo</SelectItem>
                  <SelectItem value="contacted">Contactado</SelectItem>
                  <SelectItem value="qualified">Calificado</SelectItem>
                  <SelectItem value="converted">Convertido</SelectItem>
                  <SelectItem value="lost">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="score">Score (0-100)</Label>
              <Input
                id="score"
                type="number"
                min="0"
                max="100"
                value={formData.score}
                onChange={(e) => setFormData({ ...formData, score: e.target.value })}
                placeholder="50"
              />
            </div>
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
                'Guardar Cambios'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
