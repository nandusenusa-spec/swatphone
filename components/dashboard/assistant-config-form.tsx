'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Save, Loader2 } from 'lucide-react'

interface AssistantConfig {
  id: string
  name: string
  system_prompt: string | null
  first_message: string | null
  voice_id: string
  voice_provider: string
  language: string
  temperature: number
  max_tokens: number
  transfer_enabled: boolean
  transfer_number: string | null
}

const voices = [
  { id: 'alloy', name: 'Alloy', provider: 'openai' },
  { id: 'nova', name: 'Nova', provider: 'openai' },
  { id: 'shimmer', name: 'Shimmer', provider: 'openai' },
  { id: 'echo', name: 'Echo', provider: 'openai' },
  { id: 'onyx', name: 'Onyx', provider: 'openai' },
  { id: 'fable', name: 'Fable', provider: 'openai' },
]

const languages = [
  { id: 'es', name: 'Espanol' },
  { id: 'en', name: 'English' },
  { id: 'pt', name: 'Portugues' },
  { id: 'fr', name: 'Frances' },
  { id: 'de', name: 'Aleman' },
]

export function AssistantConfigForm({ config }: { config: AssistantConfig | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: config?.name || 'Asistente Principal',
    system_prompt: config?.system_prompt || '',
    first_message: config?.first_message || 'Hola, gracias por llamar. En que puedo ayudarte?',
    voice_id: config?.voice_id || 'alloy',
    language: config?.language || 'es',
    temperature: config?.temperature || 0.7,
    transfer_enabled: config?.transfer_enabled ?? true,
    transfer_number: config?.transfer_number || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (config?.id) {
        await supabase
          .from('assistant_configs')
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id)
      }
      router.refresh()
    } catch (error) {
      console.error('Error saving config:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Nombre del Asistente</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Mi Asistente"
        />
      </div>

      {/* System Prompt */}
      <div className="space-y-2">
        <Label htmlFor="system_prompt">Instrucciones del Sistema (Prompt)</Label>
        <Textarea
          id="system_prompt"
          value={formData.system_prompt}
          onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
          placeholder="Eres un asistente virtual profesional..."
          rows={6}
        />
        <p className="text-xs text-muted-foreground">
          Define la personalidad, tono y comportamiento del asistente
        </p>
      </div>

      {/* First Message */}
      <div className="space-y-2">
        <Label htmlFor="first_message">Mensaje de Bienvenida</Label>
        <Textarea
          id="first_message"
          value={formData.first_message}
          onChange={(e) => setFormData({ ...formData, first_message: e.target.value })}
          placeholder="Hola, gracias por llamar..."
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Lo primero que dira el asistente al contestar
        </p>
      </div>

      {/* Voice and Language */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Voz</Label>
          <Select
            value={formData.voice_id}
            onValueChange={(value) => setFormData({ ...formData, voice_id: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name} ({voice.provider})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Idioma</Label>
          <Select
            value={formData.language}
            onValueChange={(value) => setFormData({ ...formData, language: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem key={lang.id} value={lang.id}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Temperature */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Creatividad (Temperature)</Label>
          <span className="text-sm text-muted-foreground">{formData.temperature}</span>
        </div>
        <Slider
          value={[formData.temperature]}
          onValueChange={([value]) => setFormData({ ...formData, temperature: value })}
          min={0}
          max={1}
          step={0.1}
        />
        <p className="text-xs text-muted-foreground">
          Menor = mas consistente, Mayor = mas creativo
        </p>
      </div>

      {/* Transfer */}
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Transferencia de Llamadas</Label>
            <p className="text-xs text-muted-foreground">
              Permitir al asistente transferir llamadas
            </p>
          </div>
          <Switch
            checked={formData.transfer_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, transfer_enabled: checked })}
          />
        </div>

        {formData.transfer_enabled && (
          <div className="space-y-2">
            <Label htmlFor="transfer_number">Numero de Transferencia</Label>
            <Input
              id="transfer_number"
              value={formData.transfer_number}
              onChange={(e) => setFormData({ ...formData, transfer_number: e.target.value })}
              placeholder="+1234567890"
            />
          </div>
        )}
      </div>

      {/* Submit */}
      <Button type="submit" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Guardar Configuracion
          </>
        )}
      </Button>
    </form>
  )
}
