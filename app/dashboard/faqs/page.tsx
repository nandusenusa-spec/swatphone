import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FaqsList } from '@/components/dashboard/faqs-list'
import { AddFaqDialog } from '@/components/dashboard/add-faq-dialog'
import { HelpCircle, MessageSquare } from 'lucide-react'

export default async function FaqsPage() {
  const supabase = await createClient()
  
  const { data: faqs } = await supabase
    .from('faqs')
    .select('*')
    .order('created_at', { ascending: false })
  
  const { count: totalFaqs } = await supabase
    .from('faqs')
    .select('*', { count: 'exact', head: true })
  
  const { count: activeFaqs } = await supabase
    .from('faqs')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Preguntas Frecuentes</h1>
          <p className="text-muted-foreground">
            Base de conocimiento para el asistente
          </p>
        </div>
        <AddFaqDialog />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total FAQs
            </CardTitle>
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFaqs || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              FAQs Activas
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeFaqs || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* FAQs list */}
      <Card>
        <CardHeader>
          <CardTitle>Base de Conocimiento</CardTitle>
          <CardDescription>
            El asistente usara estas respuestas para contestar preguntas frecuentes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FaqsList faqs={faqs || []} />
        </CardContent>
      </Card>
    </div>
  )
}
