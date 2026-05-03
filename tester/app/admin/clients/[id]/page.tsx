'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Package, Users, HelpCircle, Settings, Copy, Check, Sparkles } from 'lucide-react'

export default function AdminClientDetailPage() {
  const params = useParams()
  const clientId = params.id as string

  const [organization, setOrganization] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [faqs, setFaqs] = useState<any[]>([])
  const [assistantConfig, setAssistantConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Vapi config form
  const [vapiApiKey, setVapiApiKey] = useState('')
  const [vapiAssistantId, setVapiAssistantId] = useState('')
  const [vapiPhoneNumber, setVapiPhoneNumber] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [firstMessage, setFirstMessage] = useState('')

  useEffect(() => {
    loadClientData()
  }, [clientId])

  async function loadClientData() {
    setLoading(true)

    try {
      // Fetch organization
      const orgRes = await fetch(`/api/admin/data?type=organization&id=${clientId}`)
      const { data: org } = await orgRes.json()
      if (org) {
        setOrganization(org)
        setVapiApiKey(org.vapi_api_key || '')
        setVapiAssistantId(org.vapi_assistant_id || '')
        setVapiPhoneNumber(org.vapi_phone_number || '')
      }

      // Fetch products
      const prodsRes = await fetch(`/api/admin/data?type=products&id=${clientId}`)
      const { data: prods } = await prodsRes.json()
      if (prods) setProducts(prods)

      // Fetch team
      const teamRes = await fetch(`/api/admin/data?type=team&id=${clientId}`)
      const { data: members } = await teamRes.json()
      if (members) setTeam(members)

      // Fetch FAQs
      const faqsRes = await fetch(`/api/admin/data?type=faqs&id=${clientId}`)
      const { data: faqsData } = await faqsRes.json()
      if (faqsData) setFaqs(faqsData)

      // Fetch assistant config
      const configRes = await fetch(`/api/admin/data?type=assistant_config&id=${clientId}`)
      const { data: config } = await configRes.json()
      if (config) {
        setAssistantConfig(config)
        setSystemPrompt(config.system_prompt || '')
        setFirstMessage(config.first_message || '')
      }
    } catch (error) {
      console.error('Error loading client data:', error)
    }

    setLoading(false)
  }

  async function saveVapiConfig() {
    setSaving(true)

    try {
      // Update organization
      await fetch('/api/admin/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'update_organization',
          id: clientId,
          data: {
            vapi_api_key: vapiApiKey,
            vapi_assistant_id: vapiAssistantId,
            vapi_phone_number: vapiPhoneNumber
          }
        })
      })

      // Update assistant config
      await fetch('/api/admin/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'update_assistant_config',
          id: clientId,
          data: {
            system_prompt: systemPrompt,
            first_message: firstMessage
          }
        })
      })

      alert('Configuracion guardada!')
    } catch (error) {
      console.error('Error saving config:', error)
      alert('Error al guardar')
    }

    setSaving(false)
  }

  function generatePromptFromData() {
    let prompt = `Eres un asistente virtual profesional para ${organization?.name || 'la empresa'}.\n\n`
    
    prompt += `## Tu rol\n`
    prompt += `- Contestar llamadas de forma amable y profesional\n`
    prompt += `- Responder preguntas sobre productos y servicios\n`
    prompt += `- Capturar informacion de contacto de los clientes\n`
    prompt += `- Transferir llamadas cuando el cliente lo solicite\n\n`

    if (products.length > 0) {
      prompt += `## Productos y Precios\n`
      products.forEach(p => {
        const price = p.price ? `$${p.price}` : 'Consultar'
        prompt += `- ${p.name}: ${price}${p.description ? ` - ${p.description}` : ''}\n`
      })
      prompt += `\n`
    }

    if (team.length > 0) {
      prompt += `## Equipo (para transferencias)\n`
      team.forEach(m => {
        prompt += `- ${m.name}${m.role ? ` (${m.role})` : ''}${m.extension ? ` - Ext: ${m.extension}` : ''}\n`
      })
      prompt += `\n`
    }

    if (faqs.length > 0) {
      prompt += `## Preguntas Frecuentes\n`
      faqs.forEach(f => {
        prompt += `P: ${f.question}\nR: ${f.answer}\n\n`
      })
    }

    prompt += `## Instrucciones importantes\n`
    prompt += `- Siempre se amable y profesional\n`
    prompt += `- Si no sabes algo, ofrece transferir a un humano\n`
    prompt += `- Captura nombre, telefono y email cuando sea posible\n`
    prompt += `- Responde en el mismo idioma que el cliente use\n`

    setSystemPrompt(prompt)
    
    setFirstMessage(`Gracias por llamar a ${organization?.name || 'nuestra empresa'}. Mi nombre es Alex, tu asistente virtual. En que puedo ayudarte hoy?`)
  }

  function copyWebhookUrl() {
    const url = `${window.location.origin}/api/vapi/webhook?org=${clientId}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return <div className="p-8">Cargando datos del cliente...</div>
  }

  if (!organization) {
    return <div className="p-8">Cliente no encontrado</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{organization.name}</h1>
          <p className="text-muted-foreground">
            Cliente desde {new Date(organization.created_at).toLocaleDateString()}
          </p>
        </div>
        <Badge variant={vapiAssistantId ? 'default' : 'secondary'}>
          {vapiAssistantId ? 'Vapi Configurado' : 'Pendiente Config'}
        </Badge>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Info del Cliente</TabsTrigger>
          <TabsTrigger value="vapi">Configurar Vapi</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>

        {/* Tab: Info del Cliente */}
        <TabsContent value="info" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Productos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Productos ({products.length})
                </CardTitle>
                <CardDescription>Lo que el cliente vende</CardDescription>
              </CardHeader>
              <CardContent>
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">El cliente no ha cargado productos</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {products.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-2 bg-muted rounded">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-primary font-bold">
                          {p.price ? `$${p.price}` : 'Consultar'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Equipo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Equipo ({team.length})
                </CardTitle>
                <CardDescription>Personas para transferir llamadas</CardDescription>
              </CardHeader>
              <CardContent>
                {team.length === 0 ? (
                  <p className="text-sm text-muted-foreground">El cliente no ha cargado equipo</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {team.map(m => (
                      <div key={m.id} className="p-2 bg-muted rounded">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {m.role} {m.extension && `- Ext: ${m.extension}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* FAQs */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  FAQs ({faqs.length})
                </CardTitle>
                <CardDescription>Preguntas frecuentes que el bot debe saber</CardDescription>
              </CardHeader>
              <CardContent>
                {faqs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">El cliente no ha cargado FAQs</p>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {faqs.map(f => (
                      <div key={f.id} className="p-3 bg-muted rounded">
                        <div className="font-medium">P: {f.question}</div>
                        <div className="text-sm mt-1">R: {f.answer}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Configurar Vapi */}
        <TabsContent value="vapi" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Conexion con Vapi
              </CardTitle>
              <CardDescription>
                Configura la API Key, Assistant ID y numero de Vapi para este cliente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Vapi Private/Server API Key</Label>
                <Input
                  type="password"
                  value={vapiApiKey}
                  onChange={(e) => setVapiApiKey(e.target.value)}
                  placeholder="Usa la key privada/servidor (no publica/client)"
                />
                <p className="text-xs text-muted-foreground">
                  Esta integracion usa endpoints de servidor de Vapi y requiere una Private/Server API key.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Vapi Assistant ID</Label>
                <Input
                  value={vapiAssistantId}
                  onChange={(e) => setVapiAssistantId(e.target.value)}
                  placeholder="ID del assistant creado en Vapi"
                />
              </div>

              <div className="space-y-2">
                <Label>Numero de Telefono Vapi</Label>
                <Input
                  value={vapiPhoneNumber}
                  onChange={(e) => setVapiPhoneNumber(e.target.value)}
                  placeholder="+1 813 xxx xxxx"
                />
              </div>

              <div className="space-y-2">
                <Label>Webhook URL (copiar a Vapi)</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/vapi/webhook?org=${clientId}`}
                  />
                  <Button variant="outline" onClick={copyWebhookUrl}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pega esta URL en Vapi Dashboard - Assistant - Server URL
                </p>
              </div>

              <Button onClick={saveVapiConfig} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Configuracion'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Prompts */}
        <TabsContent value="prompts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Prompt para Vapi</CardTitle>
              <CardDescription>
                El prompt que define como se comporta el bot. Usa el boton para generar uno automatico basado en los datos del cliente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" onClick={generatePromptFromData} className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Generar Prompt Automatico
              </Button>

              <div className="space-y-2">
                <Label>System Prompt</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Escribe el prompt del sistema aqui..."
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>Mensaje de Bienvenida</Label>
                <Textarea
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  placeholder="Gracias por llamar a [empresa]. En que puedo ayudarte?"
                  className="min-h-[80px]"
                />
              </div>

              <Button onClick={saveVapiConfig} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Prompts'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
