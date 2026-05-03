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
import {
  Package,
  Users,
  HelpCircle,
  Settings,
  Copy,
  Check,
  Sparkles,
  PhoneOff,
  ClipboardList,
  Plus,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getAdminAuthHeaders } from '@/lib/admin/client-headers'
import {
  WORK_ORDER_VOICE_ADMIN_STATUSES,
  workOrderStatusForAdminDropdown,
} from '@/lib/admin/work-order-status'

type TransferDestinationRow = {
  id: string
  extension: string
  name: string
  phone_e164: string
}

function newDestinationRow(): TransferDestinationRow {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `d-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    extension: '',
    name: '',
    phone_e164: '',
  }
}

const JOB_STATUSES = [
  'received',
  'in_progress',
  'waiting_for_approval',
  'ready_for_pickup',
  'completed',
  'cancelled',
] as const

function isoToDatetimeLocalValue(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const t = d.getTime() - d.getTimezoneOffset() * 60000
  return new Date(t).toISOString().slice(0, 16)
}

function adminJsonHeaders(): HeadersInit {
  return getAdminAuthHeaders({ 'Content-Type': 'application/json' })
}

type VapiPublishPayload = {
  assistantId: string
  organizationId: string
  serverUrl: string
  vapiEventsUrl: string
  toolCallsCompatUrl: string
  getJobStatusToolPostUrl: string
  webhookSecretHeader: string
  getJobStatusSchemaNote: string
}

type VapiVerificationPayload = {
  prePatchGetJobStatus: unknown
  postPatchGetHttpStatus: number
  postPatchAssistantSummary: unknown
  phoneNumbers: unknown
  warnings: string[]
}

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
  const [syncingAssistant, setSyncingAssistant] = useState(false)
  const [lastVapiPublish, setLastVapiPublish] = useState<VapiPublishPayload | null>(null)
  const [lastVapiVerification, setLastVapiVerification] = useState<VapiVerificationPayload | null>(null)
  const [copied, setCopied] = useState(false)
  const [configBanner, setConfigBanner] = useState<null | { type: 'success' | 'error'; message: string }>(null)

  // Vapi config form
  const [vapiApiKey, setVapiApiKey] = useState('')
  const [showVapiApiKey, setShowVapiApiKey] = useState(false)
  const [vapiKeyCopied, setVapiKeyCopied] = useState(false)
  const [vapiAssistantId, setVapiAssistantId] = useState('')
  const [vapiPhoneNumber, setVapiPhoneNumber] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [allowLiveTransfer, setAllowLiveTransfer] = useState(true)
  const [ramonTransferNumber, setRamonTransferNumber] = useState('')
  const [defaultTransferNumber, setDefaultTransferNumber] = useState('')
  const [callbackOwner, setCallbackOwner] = useState('Ramon')
  const [allowedTools, setAllowedTools] = useState(
    'find_customer,get_job_status,create_appointment,create_work_order,get_price_quote,prepare_warm_transfer,transfer_to_ramon,save_call_outcome,mark_spam_call,create_follow_up',
  )
  const [transferDestinationRows, setTransferDestinationRows] = useState<TransferDestinationRow[]>([])

  const [ownerCredential, setOwnerCredential] = useState<null | {
    owner_email: string
    password_plaintext: string
    note: string | null
    updated_at: string | null
  }>(null)
  const [showStoredOwnerPassword, setShowStoredOwnerPassword] = useState(false)
  const [showEditOwnerPassword, setShowEditOwnerPassword] = useState(false)
  const [ownerPasswordDraft, setOwnerPasswordDraft] = useState('')
  const [credBusy, setCredBusy] = useState(false)
  const [credCopied, setCredCopied] = useState(false)

  const [printClients, setPrintClients] = useState<any[]>([])
  const [printJobs, setPrintJobs] = useState<any[]>([])
  const [newCliName, setNewCliName] = useState('')
  const [newCliPhone, setNewCliPhone] = useState('')
  const [newCliCompany, setNewCliCompany] = useState('')
  const [newJobClientId, setNewJobClientId] = useState('')
  const [newJobTitle, setNewJobTitle] = useState('')
  const [newJobDescription, setNewJobDescription] = useState('')
  const [newJobRequirements, setNewJobRequirements] = useState('')
  const [newJobStatus, setNewJobStatus] = useState<string>('received')
  const [newJobEta, setNewJobEta] = useState('')
  const [newJobPickup, setNewJobPickup] = useState('')
  const [newJobCustomerMsg, setNewJobCustomerMsg] = useState('')
  const [newJobInternal, setNewJobInternal] = useState('')
  const [jobsDraft, setJobsDraft] = useState<Record<string, Record<string, string>>>({})
  const [crmWorkOrders, setCrmWorkOrders] = useState<any[]>([])
  const [woStatusDraft, setWoStatusDraft] = useState<Record<string, string>>({})
  const [screeningRows, setScreeningRows] = useState<
    Array<{
      id: string
      phone_e164: string
      spam_score: number
      blocked: boolean
      manual_block: boolean
      blocked_reason: string | null
      attempts_count: number
      last_seen_at: string
    }>
  >([])
  const [screenPhone, setScreenPhone] = useState('')
  const [screenReason, setScreenReason] = useState('')
  const [screenSaving, setScreenSaving] = useState(false)

  useEffect(() => {
    loadClientData()
  }, [clientId])

  useEffect(() => {
    const next: Record<string, Record<string, string>> = {}
    for (const j of printJobs) {
      next[j.id] = {
        title: j.title || '',
        description: j.description || '',
        requirements: j.requirements || '',
        status: j.status || 'received',
        estimated_ready_at: isoToDatetimeLocalValue(j.estimated_ready_at),
        pickup_instructions: j.pickup_instructions || '',
        customer_message: j.customer_message || '',
        internal_notes: j.internal_notes || '',
      }
    }
    setJobsDraft(next)
  }, [printJobs])

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const w of crmWorkOrders) {
      next[w.id] = workOrderStatusForAdminDropdown(w.status as string)
    }
    setWoStatusDraft(next)
  }, [crmWorkOrders])

  async function loadClientData() {
    setLoading(true)

    try {
      const adminFetchOpts: RequestInit = {
        credentials: 'include',
        cache: 'no-store',
        headers: getAdminAuthHeaders(),
      }

      // Fetch organization
      const orgRes = await fetch(`/api/admin/data?type=organization&id=${clientId}`, adminFetchOpts)
      const { data: org } = await orgRes.json()
      if (org) {
        setOrganization(org)
        setVapiApiKey(org.vapi_api_key || '')
        setVapiAssistantId(org.vapi_assistant_id || '')
        setVapiPhoneNumber(org.vapi_phone_number || '')
      }

      // Fetch products
      const prodsRes = await fetch(`/api/admin/data?type=products&id=${clientId}`, adminFetchOpts)
      const { data: prods } = await prodsRes.json()
      if (prods) setProducts(prods)

      // Fetch team
      const teamRes = await fetch(`/api/admin/data?type=team&id=${clientId}`, adminFetchOpts)
      const { data: members } = await teamRes.json()
      if (members) setTeam(members)

      // Fetch FAQs
      const faqsRes = await fetch(`/api/admin/data?type=faqs&id=${clientId}`, adminFetchOpts)
      const { data: faqsData } = await faqsRes.json()
      if (faqsData) setFaqs(faqsData)

      // Fetch assistant config
      const configRes = await fetch(`/api/admin/data?type=assistant_config&id=${clientId}`, adminFetchOpts)
      const { data: config } = await configRes.json()
      if (config) {
        setAssistantConfig(config)
        setSystemPrompt(config.system_prompt || '')
        setFirstMessage(config.first_message || '')
      }

      const runtimeRes = await fetch(`/api/admin/data?type=voice_runtime_config&id=${clientId}`, adminFetchOpts)
      const { data: runtime } = await runtimeRes.json()
      if (runtime?.routing) {
        setAllowLiveTransfer(Boolean(runtime.routing.allow_live_transfer ?? true))
        setRamonTransferNumber(runtime.routing.ramon_transfer_number || '')
        setDefaultTransferNumber(runtime.routing.default_transfer_number || '')
        setCallbackOwner(runtime.routing.callback_default_owner || 'Ramon')
        const td = runtime.routing.transfer_destinations
        if (Array.isArray(td) && td.length > 0) {
          setTransferDestinationRows(
            td.map((r: Record<string, unknown>) => {
              const ext =
                typeof r.extension === 'string'
                  ? r.extension
                  : typeof r.internal === 'string'
                    ? r.internal
                    : ''
              const nm =
                typeof r.name === 'string' ? r.name : typeof r.label === 'string' ? r.label : ''
              const ph =
                typeof r.phone_e164 === 'string'
                  ? r.phone_e164
                  : typeof r.phone === 'string'
                    ? r.phone
                    : ''
              return { ...newDestinationRow(), extension: ext, name: nm, phone_e164: ph }
            }),
          )
        } else {
          setTransferDestinationRows([])
        }
      }
      if (runtime?.ai?.allowed_tools) {
        const tools =
          Array.isArray(runtime.ai.allowed_tools) && runtime.ai.allowed_tools.length > 0
            ? runtime.ai.allowed_tools
            : typeof runtime.ai.allowed_tools === 'string'
              ? runtime.ai.allowed_tools.split(',').map((v: string) => v.trim()).filter(Boolean)
              : []
        if (tools.length > 0) setAllowedTools(tools.join(','))
      }

      const pcRes = await fetch(`/api/admin/data?type=print_clients&id=${clientId}`, adminFetchOpts)
      const pcJson = await pcRes.json()
      if (pcJson.data) setPrintClients(pcJson.data)

      const pjRes = await fetch(`/api/admin/data?type=print_jobs&id=${clientId}`, adminFetchOpts)
      const pjJson = await pjRes.json()
      if (pjJson.data) setPrintJobs(pjJson.data)

      const woRes = await fetch(`/api/admin/data?type=work_orders&id=${clientId}`, adminFetchOpts)
      const woJson = await woRes.json()
      setCrmWorkOrders(Array.isArray(woJson.data) ? woJson.data : [])

      const credRes = await fetch(`/api/admin/data?type=owner_credential&id=${clientId}`, {
        ...adminFetchOpts,
        cache: 'no-store',
      })
      const credJson = await credRes.json()
      if (credRes.ok && credJson.data) {
        setOwnerCredential({
          owner_email: String(credJson.data.owner_email || ''),
          password_plaintext: String(credJson.data.password_plaintext || ''),
          note: credJson.data.note ?? null,
          updated_at: credJson.data.updated_at ?? null,
        })
      } else {
        setOwnerCredential(null)
      }

      const scrRes = await fetch(`/api/admin/data?type=phone_screening&id=${clientId}`, adminFetchOpts)
      const scrJson = await scrRes.json().catch(() => ({}))
      if (scrRes.ok && Array.isArray(scrJson.data)) {
        setScreeningRows(scrJson.data)
      } else {
        setScreeningRows([])
      }
    } catch (error) {
      console.error('Error loading client data:', error)
    }

    setLoading(false)
  }

  async function saveCrmWorkOrder(woId: string) {
    const status = woStatusDraft[woId]
    if (!status) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          type: 'update_work_order',
          id: woId,
          data: { organization_id: clientId, status },
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(typeof j.error === 'string' ? j.error : 'Error al guardar orden')
        return
      }
      await loadClientData()
      alert('Estado de orden actualizado (el bot usa este valor al instante).')
    } catch (e) {
      console.error(e)
      alert('Error al guardar orden')
    } finally {
      setSaving(false)
    }
  }

  async function createPrintClient() {
    setSaving(true)
    try {
      await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          type: 'create_print_client',
          id: clientId,
          data: {
            organization_id: clientId,
            name: newCliName,
            phone: newCliPhone,
            company: newCliCompany || null,
          },
        }),
      })
      setNewCliName('')
      setNewCliPhone('')
      setNewCliCompany('')
      await loadClientData()
      alert('Cliente guardado')
    } catch (e) {
      console.error(e)
      alert('Error al crear cliente')
    }
    setSaving(false)
  }

  async function createPrintJob() {
    if (!newJobClientId) {
      alert('Seleccione un cliente')
      return
    }
    setSaving(true)
    try {
      await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          type: 'create_print_job',
          data: {
            client_id: newJobClientId,
            title: newJobTitle || 'Pedido',
            description: newJobDescription || null,
            requirements: newJobRequirements || null,
            status: newJobStatus,
            estimated_ready_at: newJobEta ? new Date(newJobEta).toISOString() : null,
            pickup_instructions: newJobPickup || null,
            customer_message: newJobCustomerMsg || null,
            internal_notes: newJobInternal || null,
            is_active: true,
          },
        }),
      })
      setNewJobTitle('')
      setNewJobDescription('')
      setNewJobRequirements('')
      setNewJobStatus('received')
      setNewJobEta('')
      setNewJobPickup('')
      setNewJobCustomerMsg('')
      setNewJobInternal('')
      await loadClientData()
      alert('Trabajo creado')
    } catch (e) {
      console.error(e)
      alert('Error al crear trabajo')
    }
    setSaving(false)
  }

  async function savePrintJob(jobId: string) {
    const d = jobsDraft[jobId]
    if (!d) return
    setSaving(true)
    try {
      await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          type: 'update_print_job',
          id: jobId,
          data: {
            title: d.title,
            description: d.description || null,
            requirements: d.requirements || null,
            status: d.status,
            estimated_ready_at: d.estimated_ready_at
              ? new Date(d.estimated_ready_at).toISOString()
              : null,
            pickup_instructions: d.pickup_instructions || null,
            customer_message: d.customer_message || null,
            internal_notes: d.internal_notes || null,
            is_active: true,
          },
        }),
      })
      await loadClientData()
      alert('Trabajo actualizado')
    } catch (e) {
      console.error(e)
      alert('Error al guardar')
    }
    setSaving(false)
  }

  async function submitPhoneScreening(blocked: boolean) {
    if (!screenPhone.trim()) {
      alert('Ingresá un número de teléfono')
      return
    }
    setScreenSaving(true)
    try {
      const res = await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          type: 'update_phone_screening',
          id: clientId,
          data: {
            phone: screenPhone.trim(),
            blocked,
            manual: true,
            reason: screenReason.trim() || (blocked ? 'manual_block' : undefined),
          },
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(typeof j.error === 'string' ? j.error : 'No se pudo actualizar')
        return
      }
      setScreenPhone('')
      setScreenReason('')
      await loadClientData()
    } finally {
      setScreenSaving(false)
    }
  }

  function updateJobDraft(jobId: string, field: string, value: string) {
    setJobsDraft((prev) => ({
      ...prev,
      [jobId]: { ...prev[jobId], [field]: value },
    }))
  }

  async function saveVapiConfig() {
    setSaving(true)
    setConfigBanner(null)

    try {
      const orgRes = await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          type: 'update_organization',
          id: clientId,
          data: {
            vapi_api_key: vapiApiKey,
            vapi_assistant_id: vapiAssistantId,
            vapi_phone_number: vapiPhoneNumber,
          },
        }),
      })
      const orgJson = await orgRes.json().catch(() => ({}))
      if (!orgRes.ok) {
        const msg =
          typeof orgJson.error === 'string'
            ? orgJson.error
            : 'No se pudo guardar la organización (API key / assistant / teléfono).'
        setConfigBanner({
          type: 'error',
          message: msg,
        })
        if (typeof window !== 'undefined') window.alert(msg)
        setSaving(false)
        return
      }

      const cfgRes = await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          type: 'update_assistant_config',
          id: clientId,
          data: {
            system_prompt: systemPrompt,
            first_message: firstMessage,
          },
        }),
      })
      const cfgJson = await cfgRes.json().catch(() => ({}))
      if (!cfgRes.ok) {
        const msg =
          typeof cfgJson.error === 'string'
            ? cfgJson.error
            : 'No se pudo guardar el prompt del asistente.'
        setConfigBanner({
          type: 'error',
          message: msg,
        })
        if (typeof window !== 'undefined') window.alert(msg)
        setSaving(false)
        return
      }

      const rtRes = await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          type: 'update_voice_runtime',
          id: clientId,
          data: {
            allow_live_transfer: allowLiveTransfer,
            ramon_transfer_number: ramonTransferNumber || null,
            default_transfer_number: defaultTransferNumber || null,
            callback_default_owner: callbackOwner || 'Ramon',
            transfer_destinations: transferDestinationRows
              .map((r) => ({
                extension: r.extension.trim(),
                name: r.name.trim(),
                phone_e164: r.phone_e164.trim(),
              }))
              .filter((r) => r.name && r.phone_e164),
            allowed_tools: allowedTools
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
          },
        }),
      })
      const rtJson = await rtRes.json().catch(() => ({}))
      if (!rtRes.ok) {
        const msg =
          typeof rtJson.error === 'string'
            ? rtJson.error
            : 'No se pudo guardar la configuración de voz / transferencias.'
        setConfigBanner({
          type: 'error',
          message: msg,
        })
        if (typeof window !== 'undefined') window.alert(msg)
        setSaving(false)
        return
      }

      const teamWarn =
        typeof rtJson.team_sync_warning === 'string' && rtJson.team_sync_warning.trim()
          ? rtJson.team_sync_warning.trim()
          : null
      let syncAssistantOk = false
      let syncAssistantMsg = ''
      try {
        const syncRes = await fetch('/api/vapi/sync-assistant', {
          method: 'POST',
          credentials: 'include',
          headers: adminJsonHeaders(),
          body: JSON.stringify({ organization_id: clientId }),
        })
        const syncJson = await syncRes.json().catch(() => ({}))
        syncAssistantOk = syncRes.ok
        if (!syncRes.ok) {
          syncAssistantMsg =
            typeof syncJson.error === 'string'
              ? syncJson.error
              : 'No se pudo sincronizar assistant automáticamente.'
        }
      } catch {
        syncAssistantMsg = 'No se pudo sincronizar assistant automáticamente.'
      }
      if (teamWarn) {
        const msg = `Configuración de transferencias y asistente guardada en base.${syncAssistantOk ? ' Assistant sincronizado en proveedor de voz.' : ` ${syncAssistantMsg}`} La tabla Equipo del cliente no se actualizó: ${teamWarn} Ejecutá en Supabase scripts/015_team_members_allow_duplicate_phone.sql si varias filas comparten el mismo teléfono.`
        setConfigBanner({
          type: 'success',
          message: msg,
        })
        if (typeof window !== 'undefined') window.alert(msg)
      } else {
        const msg = `Configuración guardada correctamente.${syncAssistantOk ? ' Assistant sincronizado en proveedor de voz.' : ` ${syncAssistantMsg}`}`
        setConfigBanner({
          type: 'success',
          message: msg,
        })
        if (typeof window !== 'undefined') window.alert(msg)
      }
    } catch (error) {
      console.error('Error saving config:', error)
      const msg = 'Error de red al guardar. Probá de nuevo.'
      setConfigBanner({
        type: 'error',
        message: msg,
      })
      if (typeof window !== 'undefined') window.alert(msg)
    }

    setSaving(false)
  }

  async function syncAssistantNow() {
    setSyncingAssistant(true)
    try {
      const res = await fetch('/api/vapi/sync-assistant', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({ organization_id: clientId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof json.error === 'string'
            ? json.error
            : 'No se pudo sincronizar el assistant.'
        setConfigBanner({ type: 'error', message: msg })
        if (typeof window !== 'undefined') window.alert(msg)
        return
      }
      if (json.vapiPublish && typeof json.vapiPublish === 'object') {
        setLastVapiPublish(json.vapiPublish as VapiPublishPayload)
      }
      if (json.vapiVerification && typeof json.vapiVerification === 'object') {
        setLastVapiVerification(json.vapiVerification as VapiVerificationPayload)
      }
      const pub = json.vapiPublish as { serverUrl?: string; assistantId?: string } | undefined
      const msg = pub?.serverUrl
        ? `Assistant sincronizado. ID: ${pub.assistantId || '—'}. Server URL publicada (copiá desde el panel de abajo si hace falta).`
        : 'Assistant sincronizado en proveedor de voz.'
      setConfigBanner({ type: 'success', message: msg })
      if (typeof window !== 'undefined') window.alert(msg)
    } catch {
      const msg = 'Error de red al sincronizar el assistant.'
      setConfigBanner({ type: 'error', message: msg })
      if (typeof window !== 'undefined') window.alert(msg)
    } finally {
      setSyncingAssistant(false)
    }
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
    const url = `${window.location.origin}/api/voice/events?organization_id=${clientId}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyVapiApiKey() {
    if (!vapiApiKey.trim()) return
    navigator.clipboard.writeText(vapiApiKey)
    setVapiKeyCopied(true)
    setTimeout(() => setVapiKeyCopied(false), 2000)
  }

  async function saveOwnerPasswordManual() {
    if (ownerPasswordDraft.length < 8) {
      setConfigBanner({
        type: 'error',
        message: 'La contraseña debe tener al menos 8 caracteres.',
      })
      return
    }
    setCredBusy(true)
    setConfigBanner(null)
    try {
      const res = await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          type: 'save_owner_credential',
          id: clientId,
          data: { password_plaintext: ownerPasswordDraft },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setConfigBanner({
          type: 'error',
          message: typeof json.error === 'string' ? json.error : 'No se pudo guardar la contraseña.',
        })
        setCredBusy(false)
        return
      }
      setOwnerPasswordDraft('')
      setShowEditOwnerPassword(false)
      const credRes = await fetch(`/api/admin/data?type=owner_credential&id=${clientId}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: getAdminAuthHeaders(),
      })
      const credJson = await credRes.json()
      if (credRes.ok && credJson.data) {
        setOwnerCredential({
          owner_email: String(credJson.data.owner_email || ''),
          password_plaintext: String(credJson.data.password_plaintext || ''),
          note: credJson.data.note ?? null,
          updated_at: credJson.data.updated_at ?? null,
        })
      }
      setConfigBanner({ type: 'success', message: 'Contraseña actualizada en Auth y en el registro interno.' })
    } catch (e) {
      console.error(e)
      setConfigBanner({ type: 'error', message: 'Error de red al guardar.' })
    }
    setCredBusy(false)
  }

  async function resetOwnerPasswordRandom() {
    setCredBusy(true)
    setConfigBanner(null)
    try {
      const res = await fetch('/api/admin/data', {
        method: 'POST',
        credentials: 'include',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          type: 'reset_owner_password',
          id: clientId,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setConfigBanner({
          type: 'error',
          message: typeof json.error === 'string' ? json.error : 'No se pudo generar contraseña.',
        })
        setCredBusy(false)
        return
      }
      const credRes = await fetch(`/api/admin/data?type=owner_credential&id=${clientId}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: getAdminAuthHeaders(),
      })
      const credJson = await credRes.json()
      if (credRes.ok && credJson.data) {
        setOwnerCredential({
          owner_email: String(credJson.data.owner_email || ''),
          password_plaintext: String(credJson.data.password_plaintext || ''),
          note: credJson.data.note ?? null,
          updated_at: credJson.data.updated_at ?? null,
        })
      }
      setConfigBanner({
        type: 'success',
        message: 'Nueva contraseña generada y guardada. Copiala y enviála por un canal seguro.',
      })
    } catch (e) {
      console.error(e)
      setConfigBanner({ type: 'error', message: 'Error de red.' })
    }
    setCredBusy(false)
  }

  async function copyStoredOwnerPassword() {
    if (!ownerCredential?.password_plaintext) return
    try {
      await navigator.clipboard.writeText(ownerCredential.password_plaintext)
      setCredCopied(true)
      window.setTimeout(() => setCredCopied(false), 2000)
    } catch {
      setConfigBanner({ type: 'error', message: 'No se pudo copiar.' })
    }
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
          {vapiAssistantId ? 'Asistente Configurado' : 'Pendiente Config'}
        </Badge>
      </div>

      {configBanner ? (
        <Alert variant={configBanner.type === 'error' ? 'destructive' : 'default'}>
          <AlertTitle>{configBanner.type === 'error' ? 'No se guardó' : 'Listo'}</AlertTitle>
          <AlertDescription>{configBanner.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Acceso CRM (owner)
          </CardTitle>
          <CardDescription>
            Registro interno en base de datos: última contraseña conocida (texto claro) para cuando el cliente la
            olvida. Solo visible en este panel. Ejecutá el SQL <code className="text-xs">011_organization_owner_credential_store.sql</code> si
            falla el guardado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ownerCredential ? (
            <div className="space-y-3 rounded-md border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Email owner</Label>
                <p className="font-mono text-sm break-all">{ownerCredential.owner_email}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Contraseña guardada</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    className="font-mono text-sm"
                    type={showStoredOwnerPassword ? 'text' : 'password'}
                    value={ownerCredential.password_plaintext}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowStoredOwnerPassword((v) => !v)}
                  >
                    {showStoredOwnerPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={copyStoredOwnerPassword}>
                    {credCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                {ownerCredential.updated_at ? (
                  <p className="text-xs text-muted-foreground">
                    Última actualización: {new Date(ownerCredential.updated_at).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay registro para esta empresa. Creá el cliente desde Clientes (guarda automático) o definí
              una contraseña abajo.
            </p>
          )}

          <div className="space-y-2 rounded-md border p-4">
            <Label>Cambiar / definir contraseña</Label>
            <p className="text-xs text-muted-foreground">
              Actualiza Supabase Auth y el registro interno. Mínimo 8 caracteres.
            </p>
            <div className="relative max-w-md">
              <Input
                type={showEditOwnerPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Nueva contraseña"
                value={ownerPasswordDraft}
                onChange={(e) => setOwnerPasswordDraft(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowEditOwnerPassword((v) => !v)}
              >
                {showEditOwnerPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={credBusy} onClick={saveOwnerPasswordManual}>
                {credBusy ? 'Guardando…' : 'Guardar contraseña'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={credBusy}
                onClick={resetOwnerPasswordRandom}
              >
                Generar aleatoria y guardar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Info del Cliente</TabsTrigger>
          <TabsTrigger value="orders">Pedidos llamadas</TabsTrigger>
          <TabsTrigger value="vapi">Configurar Asistente</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="screening">Spam / números</TabsTrigger>
        </TabsList>

        {/* Tab: Info del Cliente */}
        <TabsContent value="info" className="space-y-4">
          <Alert>
            <AlertTitle>Misma base que el CRM del cliente</AlertTitle>
            <AlertDescription className="text-sm leading-relaxed">
              Lo que el dueño carga en <strong>/dashboard</strong> (productos, precios, equipo, FAQs) son estos mismos
              registros: acá los ves en vivo. Si el cliente te pide correcciones, podés editarlas en{' '}
              <strong>Supabase</strong> (tablas <code className="text-xs">products</code>,{' '}
              <code className="text-xs">team_members</code>, <code className="text-xs">faqs</code>) o pedir que
              habilitemos edición en este panel. Los <strong>internos para transferencias</strong> (extensión → E.164) los
              administrás en <strong>Configurar Asistente</strong>. En llamadas, el backend lee esta base; para actualizar el
              texto fijo del assistant además hay que ejecutar <strong>sincronizar assistant</strong> (hoy desde
              sesión del owner en el CRM).
            </AlertDescription>
          </Alert>
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

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Clientes finales y trabajos (voz)
              </CardTitle>
              <CardDescription>
                Imprenta legacy usa la tabla <code className="text-xs">jobs</code>. El asistente telefónico usa{' '}
                <code className="text-xs">work_orders</code> para <code className="text-xs">get_job_status</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3 rounded-lg border border-primary/20 bg-muted/30 p-4">
                <h4 className="font-medium">Órdenes work_orders (fuente del bot)</h4>
                <p className="text-sm text-muted-foreground">
                  Cambiar el estado aquí actualiza lo que dice el asistente al consultar el pedido (sin otra tabla ni
                  duplicar jobs).
                </p>
                {crmWorkOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin filas en work_orders. El bot puede crear órdenes con la herramienta create_work_order.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {crmWorkOrders.map((wo: Record<string, unknown>) => {
                      const wid = String(wo.id)
                      const cust = wo.customers as { name?: string; phone?: string } | null
                      return (
                        <div key={wid} className="space-y-2 rounded-md border bg-background p-3">
                          <div className="font-mono text-sm">
                            {String(wo.work_order_number || wo.order_number || wid)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {cust?.name || '—'} — {cust?.phone || '—'}
                          </div>
                          <div className="text-sm">{String(wo.title || '')}</div>
                          <div className="space-y-1">
                            <Label>Estado (voz)</Label>
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={woStatusDraft[wid] ?? workOrderStatusForAdminDropdown(String(wo.status))}
                              onChange={(e) =>
                                setWoStatusDraft((d) => ({ ...d, [wid]: e.target.value }))
                              }
                            >
                              {WORK_ORDER_VOICE_ADMIN_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => saveCrmWorkOrder(wid)} disabled={saving}>
                            Guardar estado
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-lg border p-4">
                <h4 className="font-medium">Nuevo cliente final</h4>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Nombre</Label>
                    <Input value={newCliName} onChange={(e) => setNewCliName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Teléfono</Label>
                    <Input value={newCliPhone} onChange={(e) => setNewCliPhone(e.target.value)} placeholder="+1..." />
                  </div>
                  <div className="space-y-1">
                    <Label>Empresa</Label>
                    <Input value={newCliCompany} onChange={(e) => setNewCliCompany(e.target.value)} />
                  </div>
                </div>
                <Button size="sm" onClick={createPrintClient} disabled={saving}>
                  Guardar cliente
                </Button>
              </div>

              <div className="space-y-2 rounded-lg border p-4">
                <h4 className="font-medium">Nuevo trabajo (orden activa)</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Cliente</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={newJobClientId}
                      onChange={(e) => setNewJobClientId(e.target.value)}
                    >
                      <option value="">Seleccionar…</option>
                      {printClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.phone}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Título</Label>
                    <Input value={newJobTitle} onChange={(e) => setNewJobTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Descripción</Label>
                    <Textarea value={newJobDescription} onChange={(e) => setNewJobDescription(e.target.value)} rows={2} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Requisitos</Label>
                    <Textarea value={newJobRequirements} onChange={(e) => setNewJobRequirements(e.target.value)} rows={2} />
                  </div>
                  <div className="space-y-1">
                    <Label>Estado</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={newJobStatus}
                      onChange={(e) => setNewJobStatus(e.target.value)}
                    >
                      {JOB_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Listo aprox. (fecha y hora)</Label>
                    <Input type="datetime-local" value={newJobEta} onChange={(e) => setNewJobEta(e.target.value)} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Instrucciones de recogida</Label>
                    <Textarea value={newJobPickup} onChange={(e) => setNewJobPickup(e.target.value)} rows={2} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Mensaje al cliente (prioridad en el bot)</Label>
                    <Textarea value={newJobCustomerMsg} onChange={(e) => setNewJobCustomerMsg(e.target.value)} rows={2} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Notas internas</Label>
                    <Textarea value={newJobInternal} onChange={(e) => setNewJobInternal(e.target.value)} rows={2} />
                  </div>
                </div>
                <Button size="sm" onClick={createPrintJob} disabled={saving}>
                  Crear trabajo
                </Button>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Trabajos existentes</h4>
                {printJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin trabajos</p>
                ) : (
                  printJobs.map((job) => {
                    const d = jobsDraft[job.id]
                    if (!d) return null
                    const c = printClients.find((x) => x.id === job.client_id)
                    return (
                      <div key={job.id} className="space-y-2 rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">
                          Cliente: {c ? `${c.name} (${c.phone})` : job.client_id}
                        </p>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label>Título</Label>
                            <Input
                              value={d.title}
                              onChange={(e) => updateJobDraft(job.id, 'title', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Estado</Label>
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={d.status}
                              onChange={(e) => updateJobDraft(job.id, 'status', e.target.value)}
                            >
                              {JOB_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label>Descripción</Label>
                            <Textarea
                              value={d.description}
                              onChange={(e) => updateJobDraft(job.id, 'description', e.target.value)}
                              rows={2}
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label>Requisitos</Label>
                            <Textarea
                              value={d.requirements}
                              onChange={(e) => updateJobDraft(job.id, 'requirements', e.target.value)}
                              rows={2}
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label>Listo aprox.</Label>
                            <Input
                              type="datetime-local"
                              value={d.estimated_ready_at}
                              onChange={(e) => updateJobDraft(job.id, 'estimated_ready_at', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label>Instrucciones recogida</Label>
                            <Textarea
                              value={d.pickup_instructions}
                              onChange={(e) => updateJobDraft(job.id, 'pickup_instructions', e.target.value)}
                              rows={2}
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label>Mensaje al cliente</Label>
                            <Textarea
                              value={d.customer_message}
                              onChange={(e) => updateJobDraft(job.id, 'customer_message', e.target.value)}
                              rows={2}
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label>Notas internas</Label>
                            <Textarea
                              value={d.internal_notes}
                              onChange={(e) => updateJobDraft(job.id, 'internal_notes', e.target.value)}
                              rows={2}
                            />
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => savePrintJob(job.id)} disabled={saving}>
                          Guardar cambios
                        </Button>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Configurar Asistente */}
        <TabsContent value="vapi" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Conexion con proveedor de voz
              </CardTitle>
              <CardDescription>
                Configura la API Key, Assistant ID y numero de voz para este cliente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Private/Server API Key</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <div className="relative min-w-0 flex-1">
                    <Input
                      type={showVapiApiKey ? 'text' : 'password'}
                      className="pr-10 font-mono text-sm"
                      value={vapiApiKey}
                      onChange={(e) => setVapiApiKey(e.target.value)}
                      placeholder="Usa la key privada/servidor (no publica/client)"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowVapiApiKey((v) => !v)}
                      aria-label={showVapiApiKey ? 'Ocultar API key' : 'Mostrar API key'}
                    >
                      {showVapiApiKey ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={!vapiApiKey.trim()}
                    onClick={copyVapiApiKey}
                  >
                    {vapiKeyCopied ? (
                      <>
                        <Check className="mr-2 h-4 w-4" /> Copiada
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" /> Copiar key
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Esta integración usa endpoints de servidor del proveedor y requiere una Private/Server API key. Mostrá el
                  valor con el ícono del ojo solo en entorno seguro.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Assistant ID</Label>
                <Input
                  value={vapiAssistantId}
                  onChange={(e) => setVapiAssistantId(e.target.value)}
                  placeholder="ID del assistant creado en el proveedor"
                />
              </div>

              <div className="space-y-2">
                <Label>Numero de telefono de voz</Label>
                <Input
                  value={vapiPhoneNumber}
                  onChange={(e) => setVapiPhoneNumber(e.target.value)}
                  placeholder="+1 813 xxx xxxx"
                />
              </div>

              <div className="space-y-2">
                <Label>Webhook URL (copiar en proveedor)</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/voice/events?organization_id=${clientId}`}
                  />
                  <Button variant="outline" onClick={copyWebhookUrl}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pega esta URL en el dashboard del proveedor - Assistant - Server URL (debe incluir{' '}
                  <code className="text-xs">?organization_id=...</code>). Si ves 404 en tool-calls, revisá que el
                  dominio sea el de este deploy y que no quede una ruta vieja en Vapi.
                </p>
              </div>

              {lastVapiPublish ? (
                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                  <h4 className="text-sm font-medium">Última publicación a Vapi (sync)</h4>
                  <p className="text-xs text-muted-foreground">
                    Assistant ID: <code className="text-xs">{lastVapiPublish.assistantId || '—'}</code> — debe coincidir
                    con el assistant asignado al número en Vapi.
                  </p>
                  <div className="space-y-1 text-xs font-mono break-all">
                    <div>
                      <span className="text-muted-foreground">serverUrl: </span>
                      {lastVapiPublish.serverUrl}
                    </div>
                    <div>
                      <span className="text-muted-foreground">get_job_status POST: </span>
                      {lastVapiPublish.getJobStatusToolPostUrl}
                    </div>
                    <div>
                      <span className="text-muted-foreground">tool-calls (compat): </span>
                      {lastVapiPublish.toolCallsCompatUrl}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Header: </span>
                      {lastVapiPublish.webhookSecretHeader}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{lastVapiPublish.getJobStatusSchemaNote}</p>
                </div>
              ) : null}

              {lastVapiVerification ? (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
                  <h4 className="text-sm font-medium">Verificación Vapi (GET tras PATCH + teléfonos)</h4>
                  {lastVapiVerification.warnings?.length ? (
                    <ul className="list-disc space-y-1 pl-4 text-xs text-amber-200/90">
                      {lastVapiVerification.warnings.map((w, i) => (
                        <li key={`${i}-${w.slice(0, 48)}`}>{w}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin advertencias automáticas.</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    GET assistant HTTP: {lastVapiVerification.postPatchGetHttpStatus}. Compará{' '}
                    <code className="text-xs">postPatchAssistantSummary.get_job_status.parametersRequired</code> con{' '}
                    <code className="text-xs">prePatchGetJobStatus.parametersRequired</code> en el JSON completo.
                  </p>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">JSON vapiVerification</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/50 p-2 text-[11px] leading-snug">
                      {JSON.stringify(lastVapiVerification, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : null}

              <div className="rounded-lg border border-border p-4 space-y-3">
                <h4 className="font-medium">Runtime de transferencia (multiempresa)</h4>
                <p className="text-xs text-muted-foreground">
                  Destinos por interno y nombre: el asistente enruta según lo que diga el cliente (ej. &quot;quiero
                  diseño&quot;, &quot;interno 92&quot;). El proveedor marca al teléfono E.164 de cada fila.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allowLiveTransfer}
                    onChange={(e) => setAllowLiveTransfer(e.target.checked)}
                  />
                  Habilitar transferencia en vivo
                </label>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="m-0">Destinos (interno → nombre → E.164)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setTransferDestinationRows((prev) => [...prev, newDestinationRow()])}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Agregar
                    </Button>
                  </div>
                  {transferDestinationRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Sin filas: se usan solo los números fallback de abajo. Con 2 o más filas, el bot debe aclarar a
                      quién transferir.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {transferDestinationRows.map((row) => (
                        <div
                          key={row.id}
                          className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_2fr_2fr_auto] sm:items-end"
                        >
                          <div className="space-y-1">
                            <Label className="text-xs">Interno</Label>
                            <Input
                              placeholder="90"
                              value={row.extension}
                              onChange={(e) => {
                                const v = e.target.value
                                setTransferDestinationRows((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, extension: v } : r)),
                                )
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Área o persona</Label>
                            <Input
                              placeholder="Diseño"
                              value={row.name}
                              onChange={(e) => {
                                const v = e.target.value
                                setTransferDestinationRows((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, name: v } : r)),
                                )
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Teléfono E.164</Label>
                            <Input
                              placeholder="+1..."
                              value={row.phone_e164}
                              onChange={(e) => {
                                const v = e.target.value
                                setTransferDestinationRows((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, phone_e164: v } : r)),
                                )
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() =>
                              setTransferDestinationRows((prev) => prev.filter((r) => r.id !== row.id))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Número Ramón (legacy / único operador)</Label>
                  <Input value={ramonTransferNumber} onChange={(e) => setRamonTransferNumber(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Número fallback</Label>
                  <Input value={defaultTransferNumber} onChange={(e) => setDefaultTransferNumber(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Owner callback</Label>
                  <Input value={callbackOwner} onChange={(e) => setCallbackOwner(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Allowed tools (coma separados)</Label>
                  <Textarea
                    rows={3}
                    value={allowedTools}
                    onChange={(e) => setAllowedTools(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={saveVapiConfig} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar Configuracion'}
                </Button>
                <Button
                  variant="outline"
                  onClick={syncAssistantNow}
                  disabled={saving || syncingAssistant}
                >
                  {syncingAssistant ? 'Sincronizando...' : 'Sincronizar Assistant ahora'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Prompts */}
        <TabsContent value="screening" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PhoneOff className="h-5 w-5" />
                Screening de llamadas (Vapi)
              </CardTitle>
              <CardDescription>
                Números bloqueados o con score alto no reciben assistant: Vapi reproduce un mensaje breve y corta (ver{' '}
                <a
                  className="underline"
                  href="https://docs.vapi.ai/server-url/spam-call-rejection"
                  target="_blank"
                  rel="noreferrer"
                >
                  spam-call-rejection
                </a>
                ). Ejecutá en Supabase <code className="text-xs">scripts/018_phone_call_screening.sql</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1 space-y-1">
                  <Label>Teléfono (E.164 o 10 dígitos US)</Label>
                  <Input
                    value={screenPhone}
                    onChange={(e) => setScreenPhone(e.target.value)}
                    placeholder="+17865550190"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label>Motivo (opcional)</Label>
                  <Input
                    value={screenReason}
                    onChange={(e) => setScreenReason(e.target.value)}
                    placeholder="Ej. acoso, fax, competidor"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={screenSaving}
                    onClick={() => submitPhoneScreening(true)}
                  >
                    Bloquear
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={screenSaving}
                    onClick={() => submitPhoneScreening(false)}
                  >
                    Desbloquear
                  </Button>
                </div>
              </div>
              <div className="rounded-md border">
                <div className="max-h-72 overflow-y-auto divide-y">
                  {screeningRows.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Sin registros aún.</p>
                  ) : (
                    screeningRows.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                        <div>
                          <span className="font-mono font-medium">{r.phone_e164}</span>
                          <span className="ml-2 text-muted-foreground">
                            score {r.spam_score}
                          </span>
                          {r.blocked ? (
                            <Badge variant="destructive" className="ml-2">
                              bloqueado
                            </Badge>
                          ) : null}
                          {r.manual_block ? (
                            <Badge variant="secondary" className="ml-2">
                              manual
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          intentos {r.attempts_count} · {r.blocked_reason || '—'} ·{' '}
                          {new Date(r.last_seen_at).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Prompt del asistente</CardTitle>
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
