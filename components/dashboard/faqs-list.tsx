'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { EditFAQDialog } from './edit-faq-dialog'

interface Faq {
  id: string
  question: string
  answer: string
  category: string | null
  keywords: string[] | null
  is_active: boolean
}

export function FaqsList({ faqs }: { faqs: Faq[] }) {
  const router = useRouter()
  const supabase = createClient()

  const handleToggleActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from('faqs')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      toast.error('No se pudo actualizar el estado', { description: error.message })
      return
    }
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Estas seguro de eliminar esta FAQ?')) return
    const { error } = await supabase.from('faqs').delete().eq('id', id)
    if (error) {
      toast.error('No se pudo eliminar', { description: error.message })
      return
    }
    toast.success('FAQ eliminada')
    router.refresh()
  }

  if (faqs.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No hay FAQs registradas. Agrega tu primera pregunta frecuente.
      </div>
    )
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      {faqs.map((faq) => (
        <AccordionItem key={faq.id} value={faq.id}>
          <AccordionTrigger className="text-left">
            <div className="flex flex-1 items-center justify-between pr-4">
              <span className={faq.is_active ? '' : 'text-muted-foreground line-through'}>
                {faq.question}
              </span>
              {faq.category && (
                <Badge variant="secondary" className="ml-2">
                  {faq.category}
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              <p className="text-sm">{faq.answer}</p>
              
              {faq.keywords && faq.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {faq.keywords.map((keyword, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between border-t pt-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={faq.is_active}
                    onCheckedChange={(checked) => handleToggleActive(faq.id, checked)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {faq.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <div className="flex gap-1">
                  <EditFAQDialog faq={faq} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDelete(faq.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
