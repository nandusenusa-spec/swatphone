'use client'

import { useState } from 'react'
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
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function AddFaqDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    category: '',
    keywords: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const keywords = formData.keywords
        ? formData.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : []

      const res = await fetch('/api/dashboard/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: formData.question,
          answer: formData.answer,
          category: formData.category || null,
          keywords,
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof body.error === 'string'
            ? body.error
            : 'No se pudo guardar la FAQ. ¿Ejecutaste la migración 025 en Supabase?'
        throw new Error(msg)
      }

      toast.success('FAQ guardada')
      setOpen(false)
      setFormData({
        question: '',
        answer: '',
        category: '',
        keywords: '',
      })
      router.refresh()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido'
      console.error('Error adding FAQ:', error)
      toast.error('No se pudo guardar la FAQ', { description: msg, duration: 8000 })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Agregar FAQ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar Pregunta Frecuente</DialogTitle>
          <DialogDescription>
            Agrega una pregunta y respuesta para que el asistente pueda usar
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="question">Pregunta</Label>
            <Input
              id="question"
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              placeholder="Ej: Cual es el horario de atencion?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="answer">Respuesta</Label>
            <Textarea
              id="answer"
              value={formData.answer}
              onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
              placeholder="Escribe la respuesta que el asistente debe dar..."
              rows={4}
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Ej: Horarios, Precios, Servicios"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">Palabras Clave</Label>
              <Input
                id="keywords"
                value={formData.keywords}
                onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                placeholder="horario, atencion, abierto"
              />
              <p className="text-xs text-muted-foreground">Separadas por coma</p>
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
                'Guardar FAQ'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
