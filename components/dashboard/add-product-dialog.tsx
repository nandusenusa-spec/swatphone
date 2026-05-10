'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Product } from '@/components/dashboard/products-page-client'

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  price_type: 'fixed',
  price_min: '',
  price_max: '',
  currency: 'USD',
}

export function AddProductDialog({ onAdded }: { onAdded?: (product: Product) => void }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser()
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

      const { data: inserted, error } = await supabase
        .from('products')
        .insert({
          organization_id: profile.organization_id,
          name: formData.name,
          description: formData.description || null,
          price: formData.price ? parseFloat(formData.price) : null,
          price_type: formData.price_type,
          price_min: formData.price_min ? parseFloat(formData.price_min) : null,
          price_max: formData.price_max ? parseFloat(formData.price_max) : null,
          currency: formData.currency,
          is_active: true,
        })
        .select()
        .single()

      if (error) {
        const code = (error as { code?: string }).code
        const detail = [error.message, error.details, error.hint, code ? `code=${code}` : '']
          .filter(Boolean)
          .join(' • ')
        throw new Error(detail || 'Error desconocido al guardar')
      }

      toast.success('Producto agregado', { description: formData.name })
      setOpen(false)
      setFormData(EMPTY_FORM)

      if (onAdded && inserted) {
        onAdded(inserted as Product)
      }
      router.refresh()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido'
      console.error('Error adding product:', error)
      toast.error('No se pudo agregar el producto', { description: msg, duration: 8000 })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Producto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Producto</DialogTitle>
          <DialogDescription>
            Agrega un nuevo producto o servicio para que el asistente pueda cotizar
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del Producto</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Consultoria SEO"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripcion</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripcion breve del producto..."
              rows={3}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de Precio</Label>
              <Select
                value={formData.price_type}
                onValueChange={(value) => setFormData({ ...formData, price_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Precio Fijo</SelectItem>
                  <SelectItem value="hourly">Por Hora</SelectItem>
                  <SelectItem value="range">Rango de Precios</SelectItem>
                  <SelectItem value="quote">A Cotizar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Moneda</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData({ ...formData, currency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="ARS">ARS ($)</SelectItem>
                  <SelectItem value="MXN">MXN ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(formData.price_type === 'fixed' || formData.price_type === 'hourly') && (
            <div className="space-y-2">
              <Label htmlFor="price">Precio</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
              />
            </div>
          )}

          {formData.price_type === 'range' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price_min">Precio Minimo</Label>
                <Input
                  id="price_min"
                  type="number"
                  step="0.01"
                  value={formData.price_min}
                  onChange={(e) => setFormData({ ...formData, price_min: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price_max">Precio Maximo</Label>
                <Input
                  id="price_max"
                  type="number"
                  step="0.01"
                  value={formData.price_max}
                  onChange={(e) => setFormData({ ...formData, price_max: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

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
                'Guardar Producto'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
