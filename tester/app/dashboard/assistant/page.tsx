import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AssistantConfigForm } from '@/components/dashboard/assistant-config-form'
import { Bot, Mic, Globe, MessageSquare } from 'lucide-react'

export default async function AssistantPage() {
  const supabase = await createClient()
  
  const { data: config } = await supabase
    .from('assistant_configs')
    .select('*')
    .eq('is_active', true)
    .single()
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('organizations(vapi_api_key, vapi_assistant_id, vapi_phone_number)')
    .single()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuracion del Asistente</h1>
        <p className="text-muted-foreground">
          Personaliza como tu asistente de voz responde llamadas
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main config */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Configuracion Principal
              </CardTitle>
              <CardDescription>
                Define el comportamiento y personalidad del asistente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AssistantConfigForm config={config} />
            </CardContent>
          </Card>
        </div>

        {/* Status & Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estado de Conexion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">API Key</span>
                <span className={`flex items-center gap-2 text-sm ${profile?.organizations?.vapi_api_key ? 'text-green-600' : 'text-red-500'}`}>
                  <span className={`h-2 w-2 rounded-full ${profile?.organizations?.vapi_api_key ? 'bg-green-500' : 'bg-red-500'}`} />
                  {profile?.organizations?.vapi_api_key ? 'Configurada' : 'No configurada'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Assistant ID</span>
                <span className={`flex items-center gap-2 text-sm ${profile?.organizations?.vapi_assistant_id ? 'text-green-600' : 'text-yellow-600'}`}>
                  <span className={`h-2 w-2 rounded-full ${profile?.organizations?.vapi_assistant_id ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  {profile?.organizations?.vapi_assistant_id ? 'Configurado' : 'Pendiente'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Numero</span>
                <span className="text-sm font-medium">
                  {profile?.organizations?.vapi_phone_number || 'No asignado'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Voces Disponibles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">OpenAI - Alloy</p>
                    <p className="text-xs text-muted-foreground">Voz neutral y profesional</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">OpenAI - Nova</p>
                    <p className="text-xs text-muted-foreground">Voz femenina amigable</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">ElevenLabs - Rachel</p>
                    <p className="text-xs text-muted-foreground">Voz natural premium</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Idiomas Soportados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1">
                  <Globe className="h-3 w-3" />
                  <span className="text-sm">Espanol</span>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1">
                  <Globe className="h-3 w-3" />
                  <span className="text-sm">English</span>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1">
                  <Globe className="h-3 w-3" />
                  <span className="text-sm">Portugues</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
