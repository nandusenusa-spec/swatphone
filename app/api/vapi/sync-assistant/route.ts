import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import { buildSystemPrompt } from '@/lib/vapi/prompts'
import { openAiVoiceIdForLlmPipeline } from '@/lib/vapi/openai-voice-for-pipeline'
import {
  buildPrepareWarmTransferServerTool,
  buildWarmTransferCallTool,
} from '@/lib/vapi/warm-transfer-tool'
import { createHmac, timingSafeEqual } from 'crypto'

function normalizeVapiApiKey(rawKey: string | null | undefined): string {
  if (!rawKey) return ''
  return rawKey.replace(/^Bearer\s+/i, '').trim()
}

function isProbablyPublicOrInvalidVapiKey(apiKey: string): boolean {
  if (!apiKey) return true
  if (apiKey.length < 20) return true
  if (/\s/.test(apiKey)) return true
  return /^(pk_|public_|pub_)/i.test(apiKey)
}

function buildVapiAuthErrorMessage(vapiMessage?: unknown): string {
  const text =
    vapiMessage == null
      ? ''
      : Array.isArray(vapiMessage)
        ? vapiMessage.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join(' ')
        : typeof vapiMessage === 'string'
          ? vapiMessage
          : typeof vapiMessage === 'object'
            ? JSON.stringify(vapiMessage)
            : String(vapiMessage)
  const lower = text.toLowerCase()
  const indicatesKeyTypeMismatch =
    lower.includes('invalid key') ||
    lower.includes('private key') ||
    lower.includes('public key') ||
    lower.includes('unauthorized')

  if (indicatesKeyTypeMismatch) {
    return 'Vapi rejected the API key. This endpoint requires a Vapi Private/Server API key (not a public/client key). Update it in Settings > Vapi API Key.'
  }

  return 'Vapi API request failed. Verify the saved Vapi Private/Server API key and try again.'
}

function serializeSyncAssistantCatchError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (error !== null && typeof error === 'object') {
    const rec = error as Record<string, unknown>
    if ('message' in rec && rec.message !== undefined && rec.message !== null) {
      const m = rec.message
      if (typeof m === 'string') return m
      try {
        return JSON.stringify(m, null, 2)
      } catch {
        return String(m)
      }
    }
    try {
      return JSON.stringify(error, null, 2)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

type AdminTokenPayload = {
  adminId: string
  username: string
  exp: number
}

function verifyTokenSignature(payloadEncoded: string, signature: string): boolean {
  const secret = process.env.ADMIN_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(payloadEncoded).digest('base64url')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

function parseAdminToken(rawToken: string): AdminTokenPayload | null {
  const token = rawToken.trim()
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadEncoded, signature] = parts
  if (!payloadEncoded || !signature || !verifyTokenSignature(payloadEncoded, signature)) {
    return null
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8')) as AdminTokenPayload
    if (!parsed?.username || !parsed?.adminId || typeof parsed.exp !== 'number') return null
    if (Date.now() > parsed.exp) return null
    return parsed
  } catch {
    return null
  }
}

function getAdminToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const fromHeader = authHeader.split(' ')[1]?.trim()
    if (fromHeader) return fromHeader
  }
  return request.cookies.get('admin_token')?.value || null
}

async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  const token = getAdminToken(request)
  if (!token) return false
  const payload = parseAdminToken(token)
  if (!payload) return false
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('admin_credentials')
    .select('id, username')
    .eq('id', payload.adminId)
    .eq('username', payload.username)
    .eq('is_active', true)
    .limit(1)
  return !!data && data.length > 0
}

function conciseFirstMessage(raw: unknown): string {
  return 'Hello, this is SWATWORKS. How can I help?'
}

// This endpoint syncs the assistant configuration to Vapi
export async function POST(request: NextRequest) {
  try {
    const reqBody = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const requestedOrgId =
      (typeof reqBody.organization_id === 'string' ? reqBody.organization_id : '') ||
      request.nextUrl.searchParams.get('organization_id') ||
      ''

    const supabaseAuthClient = await createClient()
    const serviceRole = createServiceRoleClient()

    let organizationId = ''
    let assistantId: string | null = null
    let vapiApiKey = ''

    const { data: { user } } = await supabaseAuthClient.auth.getUser()
    if (user) {
      const { data: profile } = await serviceRole
        .from('profiles')
        .select('organization_id, organizations(vapi_api_key, vapi_assistant_id)')
        .eq('id', user.id)
        .single()
      organizationId = String(profile?.organization_id || '')
      assistantId = (profile?.organizations?.vapi_assistant_id as string | null) || null
      vapiApiKey = normalizeVapiApiKey(profile?.organizations?.vapi_api_key)
    } else {
      const isAdmin = await verifyAdminToken(request)
      if (!isAdmin || !requestedOrgId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { data: orgRow, error: orgErr } = await serviceRole
        .from('organizations')
        .select('id, vapi_api_key, vapi_assistant_id')
        .eq('id', requestedOrgId)
        .maybeSingle()
      if (orgErr || !orgRow) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }
      organizationId = String(orgRow.id)
      assistantId = (orgRow.vapi_assistant_id as string | null) || null
      vapiApiKey = normalizeVapiApiKey(orgRow.vapi_api_key as string | null)
    }

    if (!vapiApiKey) {
      return NextResponse.json(
        { error: 'Vapi Private/Server API key is not configured' },
        { status: 400 }
      )
    }

    if (isProbablyPublicOrInvalidVapiKey(vapiApiKey)) {
      return NextResponse.json(
        {
          error:
            'Invalid Vapi key format. Use a Vapi Private/Server API key (secret key), not a public/client key.',
        },
        { status: 400 }
      )
    }

    // Get assistant config (prefer active row; fallback to latest row for legacy orgs)
    let { data: config, error: configErr } = await serviceRole
      .from('assistant_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (configErr && configErr.code !== 'PGRST116' && configErr.code !== 'PGRST205') {
      throw configErr
    }

    if (!config) {
      const fallback = await serviceRole
        .from('assistant_configs')
        .select('*')
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (fallback.error) throw fallback.error
      config = fallback.data?.[0] || null
    }

    if (!config) {
      return NextResponse.json(
        { error: 'No assistant config found. Guardá prompts primero en Admin > Cliente > Prompts.' },
        { status: 400 },
      )
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_APP_URL is not configured' },
        { status: 500 }
      )
    }

    // Get FAQs for context
    const { data: faqs } = await serviceRole
      .from('faqs')
      .select('question, answer')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(10)

    const runtime = await getOrganizationRuntimeConfig(organizationId)

    const basePrompt =
      config.system_prompt?.trim() ||
      'Eres un asistente de atencion telefonica empresarial.'

    let systemPrompt = buildSystemPrompt({
      basePrompt,
      fallbackMessage: runtime.fallbackMessage,
      hasCatalog: runtime.hasCatalogForPrompt,
      hasTransferPhone: runtime.hasTransferPhoneForPrompt,
      transferDestinations: runtime.transferPolicy.transferDestinations,
    })

    if (faqs && faqs.length > 0) {
      systemPrompt += '\n\nPreguntas frecuentes:\n'
      faqs.forEach((f) => {
        systemPrompt += `- ${f.question}: ${f.answer}\n`
      })
    }
    const persistentPrepare = buildPrepareWarmTransferServerTool(organizationId)
    const persistentTransfer = buildWarmTransferCallTool(runtime)
    const persistentTransferTools = [
      ...(persistentPrepare ? [persistentPrepare] : []),
      ...(persistentTransfer ? [persistentTransfer] : []),
    ]

    const transferToolDebug = persistentTransferTools.map((t) => {
      const rec = t as Record<string, unknown>
      const fn = rec.function as Record<string, unknown> | undefined
      return {
        type: rec.type,
        name: typeof fn?.name === 'string' ? fn.name : null,
      }
    })
    console.log('[vapi/sync-assistant] transfer tools for Vapi payload', {
      organization_id: organizationId,
      assistant_id: assistantId,
      count: persistentTransferTools.length,
      tools: transferToolDebug,
      allow_live_transfer: runtime.transferPolicy.allowLiveTransfer,
      has_listed_destinations: (runtime.transferPolicy.transferDestinations?.length ?? 0) > 0,
      has_legacy_numbers: Boolean(
        runtime.transferPolicy.ramonTransferNumber ||
          runtime.transferPolicy.defaultTransferNumber ||
          runtime.transferPolicy.urgentTransferNumber,
      ),
    })

    const staticFunctionTools = [
      {
        type: 'function',
        function: {
          name: 'find_customer',
          description: 'Busca o crea el cliente por teléfono',
          parameters: {
            type: 'object',
            properties: {
              phone: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_job_status',
          description:
            'Estado del pedido u orden. Llamar en cuanto el cliente pregunte por estado; usar organization_id y phone indicados en el system prompt (o UUID de esta org + E.164). No usar get_client_status.',
          parameters: {
            type: 'object',
            properties: {
              organization_id: {
                type: 'string',
                description: 'UUID de la organización (ver instrucciones del asistente).',
              },
              phone: {
                type: 'string',
                description: 'Teléfono del cliente en E.164 (ver instrucciones del asistente).',
              },
              job_number: { type: 'string' },
              order_number: { type: 'string' },
            },
            required: ['organization_id', 'phone'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_product_price',
          description: 'Busca el precio de un producto o servicio',
          parameters: {
            type: 'object',
            properties: {
              product_name: {
                type: 'string',
                description: 'Nombre del producto a buscar',
              },
            },
            required: ['product_name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_price_quote',
          description: 'Busca precio por service_name en catálogo',
          parameters: {
            type: 'object',
            properties: {
              service_name: { type: 'string' },
            },
            required: ['service_name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'save_lead_info',
          description: 'Guarda informacion del cliente (nombre, email, empresa)',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nombre del cliente' },
              email: { type: 'string', description: 'Email del cliente' },
              company: { type: 'string', description: 'Empresa del cliente' },
              notes: { type: 'string', description: 'Notas adicionales' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_work_order',
          description: 'Crea un trabajo/pedido pendiente de aprobación',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              customer_name: { type: 'string' },
              issue_description: { type: 'string' },
              phone: { type: 'string' },
            },
            required: ['title'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_appointment',
          description: 'Crea una cita/turno para el cliente',
          parameters: {
            type: 'object',
            properties: {
              appointment_at: { type: 'string' },
              customer_name: { type: 'string' },
              notes: { type: 'string' },
              phone: { type: 'string' },
            },
            required: ['appointment_at'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'save_call_outcome',
          description:
            'Persiste el resultado de la llamada. Poné callback_required true si prometiste que el equipo contacta, presupuesto o plazo (24 h, etc.).',
          parameters: {
            type: 'object',
            properties: {
              phone: { type: 'string', description: 'Teléfono del cliente E.164' },
              summary: { type: 'string' },
              transcript: { type: 'string' },
              callback_required: { type: 'boolean' },
              follow_up_date: { type: 'string', description: 'Vencimiento ISO-8601' },
              result: { type: 'string' },
              owner: { type: 'string' },
            },
            required: ['phone'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_follow_up',
          description: 'Crea seguimiento/callback para el equipo',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              notes: { type: 'string' },
              owner: { type: 'string' },
              due_at: { type: 'string' },
              priority: { type: 'string' },
              callback_required: { type: 'boolean' },
              phone: { type: 'string' },
            },
            required: ['title'],
          },
        },
      },
    ] as const

    const modelTools = [...persistentTransferTools, ...staticFunctionTools]
    // Anthropic model: OpenAI "coral" is realtime-only on Vapi; use assistant_configs.voice_id or alloy.
    const chosenVoiceProvider = 'openai'
    const chosenVoiceId = openAiVoiceIdForLlmPipeline(
      typeof config.voice_id === 'string' ? config.voice_id : null,
      'alloy',
    )
    const firstMessageRaw =
      config.first_message ||
      (config as { greeting_message?: string | null }).greeting_message ||
      ''
    const firstMessage = conciseFirstMessage(firstMessageRaw)
    const maxTokensNum = Number(config.max_tokens || 110)
    const maxTokens = Number.isFinite(maxTokensNum) ? Math.min(Math.max(maxTokensNum, 80), 140) : 110

    // Vapi assistant configuration (tools only under model.tools; top-level model_tools is rejected by the API)
    const assistantConfig = {
      name: config.name,
      model: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        temperature: typeof config.temperature === 'number' ? Math.min(Math.max(config.temperature, 0), 0.3) : 0.15,
        maxTokens,
        systemPrompt,
        tools: modelTools,
      },
      voice: {
        provider: chosenVoiceProvider,
        voiceId: chosenVoiceId,
      },
      firstMessage,
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: config.language,
      },
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/events?organization_id=${organizationId}`,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
    }

    let response
    if (assistantId) {
      // Update existing assistant
      response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${vapiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assistantConfig),
      })
    } else {
      // Create new assistant
      response = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assistantConfig),
      })
    }

    const rawResponse = await response.text()
    let result: any = null
    try {
      result = rawResponse ? JSON.parse(rawResponse) : null
    } catch {
      result = { message: rawResponse || null }
    }

    if (response.ok) {
      console.log('[vapi/sync-assistant] Vapi saved assistant', {
        organization_id: organizationId,
        assistant_id: result?.id || assistantId || null,
        model_tool_names: (assistantConfig.model.tools as unknown[]).map((t) => {
          const r = t as Record<string, unknown>
          const fn = r.function as Record<string, unknown> | undefined
          return typeof fn?.name === 'string' ? fn.name : (r.type as string) || 'unknown'
        }),
      })
    }

    if (!response.ok) {
      console.error('[v0] Vapi API error:', result)
      const baseMsg = buildVapiAuthErrorMessage(result?.message)
      const raw =
        result?.message == null
          ? ''
          : typeof result.message === 'string'
            ? result.message
            : JSON.stringify(result.message)
      const detail =
        raw && !baseMsg.includes(raw.slice(0, 80))
          ? ` Detalle Vapi: ${raw.slice(0, 400)}${raw.length > 400 ? '…' : ''}`
          : ''
      return NextResponse.json(
        {
          error: `${baseMsg}${detail}`,
          vapiMessage: result?.message || null,
        },
        { status: response.status === 401 ? 401 : 500 }
      )
    }

    // Save assistant ID if new
    if (!assistantId && result.id) {
      await serviceRole
        .from('organizations')
        .update({ vapi_assistant_id: result.id })
        .eq('id', organizationId)
    }

    return NextResponse.json({ 
      success: true, 
      assistantId: result.id,
      message: assistantId ? 'Assistant updated' : 'Assistant created'
    })
  } catch (error) {
    console.error('[v0] Sync assistant error (full):', error)
    if (error instanceof Error && error.stack) {
      console.error('[v0] Sync assistant error stack:', error.stack)
    }
    const detail = serializeSyncAssistantCatchError(error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' ? { detail } : {}),
      },
      { status: 500 },
    )
  }
}
