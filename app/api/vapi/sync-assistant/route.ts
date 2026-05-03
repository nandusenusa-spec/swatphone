import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrganizationRuntimeConfig } from '@/lib/vapi/runtime-config'
import {
  auditSystemPromptForSync,
  buildSystemPrompt,
  extractRawSystemPromptFromVapiAssistant,
  extractReglasOperativasFragment,
  JOB_STATUS_SYNC_VERIFICATION_PHRASE,
  sanitizeAssistantBasePromptForSync,
  sanitizeFaqTextForSync,
} from '@/lib/vapi/prompts'
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

function clipText(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function logLongString(tag: string, text: string, chunkSize = 7000) {
  const len = text.length
  if (len <= chunkSize) {
    console.log(tag, { length: len, body: text })
    return
  }
  for (let i = 0, part = 0; i < len; i += chunkSize, part += 1) {
    console.log(`${tag}_part_${part}`, text.slice(i, i + chunkSize))
  }
  console.log(`${tag}_meta`, { total_length: len, chunk_size: chunkSize })
}

type ToolDigest = {
  functionName: string
  description: string | null
  parametersRequired: unknown
  phoneDescription: string | null
  organizationIdDescription: string | null
  serverUrl: string | null
}

function digestFunctionToolItem(item: unknown, wantName: string): ToolDigest | null {
  const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
  if (!rec) return null
  const fn = rec.function as Record<string, unknown> | undefined
  const name = typeof fn?.name === 'string' ? fn.name : ''
  if (name !== wantName) return null
  const desc = typeof fn.description === 'string' ? fn.description : null
  const params = fn.parameters as Record<string, unknown> | undefined
  const props = params?.properties as Record<string, unknown> | undefined
  let phoneDescription: string | null = null
  let organizationIdDescription: string | null = null
  const phoneProp = props?.phone
  if (phoneProp && typeof phoneProp === 'object' && phoneProp !== null) {
    const d = (phoneProp as Record<string, unknown>).description
    phoneDescription = typeof d === 'string' ? d : null
  }
  const orgProp = props?.organization_id
  if (orgProp && typeof orgProp === 'object' && orgProp !== null) {
    const d = (orgProp as Record<string, unknown>).description
    organizationIdDescription = typeof d === 'string' ? d : null
  }
  const server = rec.server as Record<string, unknown> | undefined
  const serverUrl = typeof server?.url === 'string' ? server.url : null
  return {
    functionName: name,
    description: desc,
    parametersRequired: params?.required ?? null,
    phoneDescription,
    organizationIdDescription,
    serverUrl,
  }
}

function extractToolsArrayFromAssistantPayload(a: Record<string, unknown>): unknown[] {
  const model = a.model
  if (model && typeof model === 'object' && !Array.isArray(model)) {
    const m = model as Record<string, unknown>
    const tools = m.tools
    if (Array.isArray(tools)) return tools
  }
  return []
}

/** IDs de Tools Library en `model.toolIds` (Vapi permite `model.tools` + `model.toolIds` a la vez). */
function extractModelToolIdsFromAssistant(rec: Record<string, unknown>): string[] | null {
  const merged = collectToolIdsFromAssistantGetPayload(rec)
  return merged.length ? merged : null
}

/** Une IDs desde model.toolIds / model.tool_ids y raíz toolIds (respuestas GET de Vapi varían). */
function collectToolIdsFromAssistantGetPayload(preJson: Record<string, unknown>): string[] {
  const out: string[] = []
  const model =
    preJson.model && typeof preJson.model === 'object' && !Array.isArray(preJson.model)
      ? (preJson.model as Record<string, unknown>)
      : null
  const fromModel = model ? (model.toolIds ?? model.tool_ids) : undefined
  if (Array.isArray(fromModel)) {
    for (const x of fromModel) {
      if (typeof x === 'string' && x.trim()) out.push(x.trim())
    }
  }
  const fromRoot = preJson.toolIds ?? preJson.tool_ids
  if (Array.isArray(fromRoot)) {
    for (const x of fromRoot) {
      if (typeof x === 'string' && x.trim()) out.push(x.trim())
    }
  }
  return [...new Set(out)]
}

/** UUIDs de Tools Library a fusionar con el GET (Vercel). Ej: 5e4f2d25-...,abc-... */
function toolIdsFromEnv(): string[] {
  const raw =
    process.env.VAPI_ASSISTANT_MODEL_TOOL_IDS?.trim() ||
    process.env.VAPI_MODEL_TOOL_IDS?.trim() ||
    ''
  if (!raw) return []
  return [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))]
}

function extractTopLevelToolsArrayFromAssistant(rec: Record<string, unknown>): unknown[] {
  const t = rec.tools
  return Array.isArray(t) ? t : []
}

/** Nombres que el sync envía en model.tools (baseline para comparar con GET). */
const EXPECTED_SYNC_FUNCTION_TOOL_NAMES = [
  'get_job_status',
  'get_product_price',
  'get_price_quote',
  'save_lead_info',
  'create_follow_up',
  'prepare_warm_transfer',
  'transfer_to_ramon',
  'find_customer',
  'save_call_outcome',
  'create_appointment',
  'create_work_order',
] as const

/** Un item de model.tools / assistant.tools: nombre de función o tipo nativo. */
function toolDisplayNameFromVapiItem(item: unknown): string {
  if (!item || typeof item !== 'object') return 'invalid_item'
  const rec = item as Record<string, unknown>
  const fn = rec.function
  if (fn && typeof fn === 'object' && !Array.isArray(fn)) {
    const n = (fn as Record<string, unknown>).name
    if (typeof n === 'string' && n.trim()) return n.trim()
  }
  if (typeof rec.name === 'string' && rec.name.trim()) return rec.name.trim()
  const typ = typeof rec.type === 'string' ? rec.type : 'unknown'
  if (typ === 'transferCall') {
    const inner = fn && typeof fn === 'object' && !Array.isArray(fn) ? (fn as Record<string, unknown>).name : null
    return typeof inner === 'string' && inner.trim() ? inner.trim() : 'transferCall'
  }
  return typ
}

function toolNamesFromList(tools: unknown[]): string[] {
  return tools.map((item) => toolDisplayNameFromVapiItem(item))
}

function modelToolsItemsPreview(tools: unknown[], max = 24): Array<{ index: number; type: string; name: string }> {
  return tools.slice(0, max).map((item, index) => {
    const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const typ = typeof rec.type === 'string' ? rec.type : 'unknown'
    return { index, type: typ, name: toolDisplayNameFromVapiItem(item) }
  })
}

type PostPatchToolsAuditOpts = {
  /** true si el sync incluyó prepare/transfer en el payload */
  transferToolsInPayload: boolean
}

function postPatchAssistantToolsSummary(fetched: unknown, opts: PostPatchToolsAuditOpts) {
  if (!fetched || typeof fetched !== 'object') {
    return { error: 'not_an_object' as const }
  }
  const rec = fetched as Record<string, unknown>
  const model = rec.model && typeof rec.model === 'object' && !Array.isArray(rec.model) ? (rec.model as Record<string, unknown>) : null
  const modelTools = extractToolsArrayFromAssistantPayload(rec)
  const modelToolIds = extractModelToolIdsFromAssistant(rec)
  const topTools = extractTopLevelToolsArrayFromAssistant(rec)
  const modelToolNames = toolNamesFromList(modelTools)
  const topLevelToolNames = toolNamesFromList(topTools)
  const combined = [...new Set([...modelToolNames, ...topLevelToolNames])]

  const expectedBaseline = [...EXPECTED_SYNC_FUNCTION_TOOL_NAMES].filter((name) => {
    if (name === 'prepare_warm_transfer' || name === 'transfer_to_ramon') return opts.transferToolsInPayload
    return true
  })
  const missingFromCombined = expectedBaseline.filter((n) => !combined.includes(n))
  const expectedSet = new Set(expectedBaseline)
  const unexpectedInCombined = combined.filter((n) => !expectedSet.has(n))

  const toolIdsEmpty = modelToolIds == null || modelToolIds.length === 0

  return {
    model_tool_ids: modelToolIds,
    model_tool_ids_empty: toolIdsEmpty,
    model_tools_count: modelTools.length,
    model_tool_names: modelToolNames,
    model_tools_items_preview: modelToolsItemsPreview(modelTools),
    assistant_top_level_tools_count: topTools.length,
    assistant_top_level_tool_names: topLevelToolNames,
    assistant_tools_items_preview: modelToolsItemsPreview(topTools),
    combined_unique_function_names: combined,
    expected_sync_tool_names: expectedBaseline,
    missing_from_combined: missingFromCombined,
    unexpected_in_combined: unexpectedInCombined,
    vapi_ui_note:
      'La pestaña Tools del dashboard suele listar sobre todo herramientas de Tools Library (model.toolIds). Las tools inline en model.tools pueden existir en runtime aunque no se listen todas en la UI.',
    runtime_sanity:
      missingFromCombined.length === 0
        ? 'combined incluye todas las tools esperadas del sync'
        : 'faltan nombres en GET respecto al sync: revisar si Vapi omitió model.tools en la respuesta o si el PATCH no persistió',
  }
}

function digestToolFromList(tools: unknown[], wantName: string): ToolDigest | null {
  for (const t of tools) {
    const d = digestFunctionToolItem(t, wantName)
    if (d) return d
  }
  return null
}

function summarizeAssistantFromVapi(a: unknown) {
  if (!a || typeof a !== 'object') {
    return { error: 'not_an_object' as const }
  }
  const rec = a as Record<string, unknown>
  const model = rec.model as Record<string, unknown> | undefined
  const tools = extractToolsArrayFromAssistantPayload(rec)
  const serverUrl =
    typeof rec.serverUrl === 'string'
      ? rec.serverUrl
      : typeof rec.server_url === 'string'
        ? rec.server_url
        : null
  const firstRaw =
    typeof rec.firstMessage === 'string'
      ? rec.firstMessage
      : typeof rec.first_message === 'string'
        ? rec.first_message
        : null
  const sysRaw =
    model && typeof model.systemPrompt === 'string'
      ? model.systemPrompt
      : model && typeof model.system_prompt === 'string'
        ? model.system_prompt
        : null
  return {
    id: typeof rec.id === 'string' ? rec.id : null,
    name: typeof rec.name === 'string' ? rec.name : null,
    serverUrl,
    firstMessagePreview: firstRaw ? clipText(firstRaw, 160) : null,
    model: model
      ? {
          provider: typeof model.provider === 'string' ? model.provider : null,
          model: typeof model.model === 'string' ? model.model : null,
          toolIds: extractModelToolIdsFromAssistant(rec),
        }
      : null,
    systemPromptPreview: sysRaw ? clipText(sysRaw, 500) : null,
    toolNames: toolNamesFromList(tools),
    get_job_status: digestToolFromList(tools, 'get_job_status'),
    find_customer: (() => {
      const d = digestToolFromList(tools, 'find_customer')
      if (!d) return null
      return {
        descriptionPreview: d.description ? clipText(d.description, 280) : null,
        parametersRequired: d.parametersRequired,
      }
    })(),
  }
}

async function fetchVapiPhoneNumbersForSync(vapiApiKey: string, syncedAssistantId: string) {
  const res = await fetch('https://api.vapi.ai/phone-number?limit=100', {
    headers: { Authorization: `Bearer ${vapiApiKey}` },
  })
  if (!res.ok) {
    return {
      ok: false as const,
      httpStatus: res.status,
      items: [] as Array<{
        id: string | null
        number: string | null
        name: string | null
        assistantId: string | null
        squadId: string | null
        workflowId: string | null
        matchesSyncedAssistant: boolean
      }>,
    }
  }
  const raw = (await res.json()) as unknown
  const list = Array.isArray(raw) ? raw : []
  const items = list.map((entry) => {
    const r = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    const assistantId =
      typeof r.assistantId === 'string'
        ? r.assistantId
        : typeof r.assistant_id === 'string'
          ? r.assistant_id
          : null
    const squadId =
      typeof r.squadId === 'string' ? r.squadId : typeof r.squad_id === 'string' ? r.squad_id : null
    const workflowId =
      typeof r.workflowId === 'string'
        ? r.workflowId
        : typeof r.workflow_id === 'string'
          ? r.workflow_id
          : null
    return {
      id: typeof r.id === 'string' ? r.id : null,
      number: typeof r.number === 'string' ? r.number : null,
      name: typeof r.name === 'string' ? r.name : null,
      assistantId,
      squadId,
      workflowId,
      matchesSyncedAssistant: Boolean(syncedAssistantId && assistantId === syncedAssistantId),
    }
  })
  return { ok: true as const, httpStatus: res.status, items }
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

    const appBase = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')

    console.log('[vapi/sync-assistant] sync_start', {
      organization_id: organizationId,
      assistant_id: assistantId,
    })

    // Get FAQs for context
    const { data: faqs } = await serviceRole
      .from('faqs')
      .select('question, answer')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(10)

    const runtime = await getOrganizationRuntimeConfig(organizationId)

    const rawBasePrompt =
      config.system_prompt?.trim() ||
      'Eres un asistente de atencion telefonica empresarial.'
    const { cleaned: basePrompt, removedLabels: basePromptSanitizeRemoved } =
      sanitizeAssistantBasePromptForSync(rawBasePrompt)

    let systemPrompt = buildSystemPrompt({
      basePrompt,
      fallbackMessage: runtime.fallbackMessage,
      hasCatalog: runtime.hasCatalogForPrompt,
      hasTransferPhone: runtime.hasTransferPhoneForPrompt,
      transferDestinations: runtime.transferPolicy.transferDestinations,
      organizationId,
    })

    if (faqs && faqs.length > 0) {
      systemPrompt += '\n\nPreguntas frecuentes:\n'
      faqs.forEach((f) => {
        const q = sanitizeFaqTextForSync(String(f.question || ''))
        const a = sanitizeFaqTextForSync(String(f.answer || ''))
        systemPrompt += `- ${q}: ${a}\n`
      })
    }

    logLongString('[vapi/sync-assistant] system_prompt_final_full', systemPrompt)

    const promptAuditPatchPayload = auditSystemPromptForSync(systemPrompt)
    console.log('[vapi/sync-assistant] system_prompt_final_sent_to_vapi_audit', {
      base_prompt_sanitize_removed: basePromptSanitizeRemoved,
      has_verification_phrase: promptAuditPatchPayload.hasVerificationPhrase,
      verification_phrase_marker: JOB_STATUS_SYNC_VERIFICATION_PHRASE,
      forbidden_hits: promptAuditPatchPayload.forbiddenHits,
      reglas_fragment: clipText(promptAuditPatchPayload.reglasFragment, 1200),
    })
    if (promptAuditPatchPayload.forbiddenHits.length > 0) {
      console.warn('[vapi/sync-assistant] system_prompt_still_contains_forbidden_phrases', {
        forbidden_hits: promptAuditPatchPayload.forbiddenHits,
        hint: 'Revisá assistant_configs.system_prompt, FAQs u otra fuente que repita instrucciones viejas.',
      })
    }
    if (!promptAuditPatchPayload.hasVerificationPhrase) {
      console.warn('[vapi/sync-assistant] system_prompt_missing_verification_phrase')
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

    /** Misma URL que assistant.serverUrl: Vapi debe POSTear estas tools al dispatcher, no solo a get-job-status. */
    const voiceEventsToolServerUrl = `${appBase}/api/voice/events?organization_id=${organizationId}`

    const staticFunctionTools = [
      {
        type: 'function',
        function: {
          name: 'find_customer',
          description:
            'Busca o crea el cliente por teléfono. No la uses antes de get_job_status cuando el cliente solo pregunta por el estado de su pedido u orden.',
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
        async: false,
        function: {
          name: 'get_job_status',
          description: `Order status. Call immediately when the user asks about order status; do not ask for name or phone first. Do not call find_customer first for this intent. organization_id and phone are optional — backend defaults to org ${organizationId} and extracts caller phone from the Vapi call payload. Optional: job_number, order_number. Do not use get_client_status.`,
          parameters: {
            type: 'object',
            properties: {
              organization_id: {
                type: 'string',
                description: 'Optional. Backend uses configured organization id if omitted.',
              },
              phone: {
                type: 'string',
                description:
                  'Optional. Caller phone in E.164 if known. If omitted, backend extracts it from Vapi call payload.',
              },
              job_number: { type: 'string' },
              order_number: { type: 'string' },
            },
            required: [] as string[],
          },
        },
        server: {
          url: `${appBase}/api/vapi/tools/get-job-status`,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_product_price',
          description:
            'Busca el precio de un producto o servicio en el catálogo. Obligatorio ante consultas de precio o cotización; llamá esta tool antes de decir que no tenés precio.',
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
        server: {
          url: voiceEventsToolServerUrl,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_price_quote',
          description:
            'Busca precio por service_name en catálogo. Obligatorio ante consultas de precio o cotización; llamá esta tool antes de decir que no tenés precio.',
          parameters: {
            type: 'object',
            properties: {
              service_name: { type: 'string' },
            },
            required: ['service_name'],
          },
        },
        server: {
          url: voiceEventsToolServerUrl,
        },
      },
      {
        type: 'function',
        function: {
          name: 'save_lead_info',
          description:
            'Guarda lead comercial: nombre (full_name o name), need/motivo, teléfono si lo dictó (si no, Caller ID). Incluí clasificación: category (wrap, business_cards, flyers, banners, signage, design, delivery, order_status, billing, general_quote, support), intent (ej. quote_request), priority (low, normal, high), estimated_value_level, summary, next_action, source=vapi_call, callback_required si aplica. Wrap vehicular: category=wrap, priority=high, estimated_value_level=high, callback_required=true. Tras cotización sin precio confirmado, llamá esta tool y luego create_follow_up si prometiste presupuesto o contacto.',
          parameters: {
            type: 'object',
            properties: {
              first_name: { type: 'string', description: 'Nombre de pila' },
              last_name: { type: 'string', description: 'Apellido' },
              full_name: { type: 'string', description: 'Nombre completo si no separás nombre y apellido' },
              name: { type: 'string', description: 'Nombre completo (alternativa a first_name/last_name)' },
              phone: {
                type: 'string',
                description:
                  'Opcional. E.164 si el cliente lo dictó; si omitís, el backend usa el número de la llamada cuando esté disponible.',
              },
              organization_id: {
                type: 'string',
                description: 'Opcional. UUID de la org; el backend usa la org del assistant si omitís.',
              },
              need: { type: 'string', description: 'Qué necesita o consulta el cliente' },
              motivo: { type: 'string', description: 'Motivo de la llamada (alternativa a need)' },
              notes: { type: 'string', description: 'Notas adicionales' },
              email: { type: 'string', description: 'Email del cliente' },
              company: { type: 'string', description: 'Empresa del cliente' },
              category: {
                type: 'string',
                description:
                  'Categoría comercial: wrap, business_cards, flyers, banners, signage, design, delivery, order_status, billing, general_quote, support',
              },
              intent: { type: 'string', description: 'Ej. quote_request, order_status_inquiry' },
              priority: { type: 'string', description: 'low | normal | high | urgent' },
              estimated_value_level: { type: 'string', description: 'low_medium | high | etc.' },
              summary: { type: 'string', description: 'Resumen de una línea para el equipo' },
              next_action: { type: 'string', description: 'Qué debe hacer el equipo a continuación' },
              source: { type: 'string', description: 'Usá vapi_call' },
              callback_required: { type: 'boolean' },
            },
            required: [] as string[],
          },
        },
        server: {
          url: voiceEventsToolServerUrl,
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
          description:
            'Crea tarea de seguimiento visible en /dashboard/follow-ups. Para wrap usá siempre title claro (ej. Llamar por cotización de wrap), category=wrap, priority=high, callback_required=true, due_at ISO mañana si no hay fecha, notes con nombre/teléfono/vehículo/resumen.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              notes: { type: 'string' },
              category: { type: 'string', description: 'Alineada al lead (wrap, business_cards, …)' },
              owner: { type: 'string' },
              due_at: { type: 'string', description: 'ISO-8601; para wrap usar hoy o mañana si el cliente no dio fecha' },
              priority: { type: 'string', description: 'low | normal | high | urgent' },
              callback_required: { type: 'boolean' },
              phone: { type: 'string' },
              call_log_id: { type: 'string', description: 'Opcional; el backend puede resolverlo desde la llamada' },
            },
            required: ['title'],
          },
        },
        server: {
          url: voiceEventsToolServerUrl,
        },
      },
    ]

    const modelTools = [...persistentTransferTools, ...staticFunctionTools]

    /**
     * Reenviar siempre `model.toolIds` si hay algo que preservar (GET + env).
     * Si el PATCH omite la clave, Vapi / Publish pueden dejar toolIds en null aunque haya `model.tools`.
     */
    let mergedModelToolIds: string[] = [...toolIdsFromEnv()]
    if (assistantId) {
      try {
        const preGetRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${vapiApiKey}` },
        })
        if (preGetRes.ok) {
          const preJson = (await preGetRes.json()) as Record<string, unknown>
          const fromApi = collectToolIdsFromAssistantGetPayload(preJson)
          mergedModelToolIds = [...new Set([...fromApi, ...mergedModelToolIds])]
        } else {
          console.warn('[vapi/sync-assistant] pre_patch_get_assistant_for_tool_ids_http', {
            httpStatus: preGetRes.status,
            assistant_id: assistantId,
          })
        }
      } catch (e) {
        console.warn('[vapi/sync-assistant] pre_patch_get_assistant_for_tool_ids_failed', e)
      }
    }
    console.log('[vapi/sync-assistant] pre_patch_merged_model_tool_ids', {
      assistant_id: assistantId || null,
      count: mergedModelToolIds.length,
      tool_ids: mergedModelToolIds.length ? mergedModelToolIds : null,
      from_env: toolIdsFromEnv().length > 0,
    })
    if (!mergedModelToolIds.length) {
      console.warn('[vapi/sync-assistant] model_tool_ids_empty_after_merge', {
        hint: 'Definí VAPI_ASSISTANT_MODEL_TOOL_IDS en Vercel (UUIDs de Tools Library, separados por coma) para no perder get_job_status al publicar si el GET no devuelve toolIds.',
      })
    }

    // Anthropic + pipeline estándar: voz OpenAI femenina por defecto (nova); coral es solo realtime.
    const chosenVoiceProvider = 'openai'
    const chosenVoiceId = openAiVoiceIdForLlmPipeline(
      typeof config.voice_id === 'string' ? config.voice_id : null,
      'nova',
    )
    const firstMessageRaw =
      config.first_message ||
      (config as { greeting_message?: string | null }).greeting_message ||
      ''
    const firstMessage = conciseFirstMessage(firstMessageRaw)
    const maxTokensNum = Number(config.max_tokens || 110)
    const maxTokens = Number.isFinite(maxTokensNum) ? Math.min(Math.max(maxTokensNum, 80), 140) : 110

    // Vapi: `model.tools` (inline/transient) y `model.toolIds` (Tools Library) pueden ir juntos; no enviar toolIds: null.
    const modelForVapi: Record<string, unknown> = {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      temperature:
        typeof config.temperature === 'number' ? Math.min(Math.max(config.temperature, 0), 0.3) : 0.15,
      maxTokens,
      systemPrompt,
      tools: modelTools,
    }
    if (mergedModelToolIds.length > 0) {
      modelForVapi.toolIds = mergedModelToolIds
    }

    const assistantConfig = {
      name: config.name,
      model: modelForVapi,
      voice: {
        provider: chosenVoiceProvider,
        voiceId: chosenVoiceId,
      },
      firstMessage,
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        // Deepgram: `multi` = detección multilingüe (es/en en la misma llamada). Para solo ES/EN fijo, cambiar en Vapi o vía assistant_configs si más adante lo exponemos.
        language: 'multi',
      },
      serverUrl: `${appBase}/api/voice/events?organization_id=${organizationId}`,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
    }

    console.log('[vapi/sync-assistant] voice_transcriber_config', {
      organization_id: organizationId,
      voice_provider: chosenVoiceProvider,
      voice_id: chosenVoiceId,
      transcriber_provider: 'deepgram',
      transcriber_model: 'nova-2',
      transcriber_language: 'multi',
    })

    console.log('[vapi/sync-assistant] patch_payload_model_tool_preview', {
      model_tool_count: modelTools.length,
      model_tool_ids_in_payload: extractModelToolIdsFromAssistant({
        model: assistantConfig.model,
      } as Record<string, unknown>),
    })

    const prePatchGjs = digestToolFromList(assistantConfig.model.tools as unknown[], 'get_job_status')
    const prePatchFind = digestToolFromList(assistantConfig.model.tools as unknown[], 'find_customer')
    const prePatchGjsToolJson = (assistantConfig.model.tools as unknown[]).find((t) => {
      const r = t as Record<string, unknown>
      const fn = r.function as Record<string, unknown> | undefined
      return fn?.name === 'get_job_status'
    })
    console.log('[vapi/sync-assistant] pre_patch_get_job_status_payload', {
      'function.name': prePatchGjs?.functionName ?? null,
      'function.description': prePatchGjs?.description
        ? clipText(prePatchGjs.description, 320)
        : null,
      'function.parameters.required': prePatchGjs?.parametersRequired ?? null,
      'function.parameters.required_json': JSON.stringify(prePatchGjs?.parametersRequired ?? null),
      'properties.phone.description': prePatchGjs?.phoneDescription
        ? clipText(prePatchGjs.phoneDescription, 200)
        : null,
      'properties.organization_id.description': prePatchGjs?.organizationIdDescription
        ? clipText(prePatchGjs.organizationIdDescription, 200)
        : null,
      serverUrl: prePatchGjs?.serverUrl ?? null,
    })
    console.log(
      '[vapi/sync-assistant] pre_patch_get_job_status_full_json',
      JSON.stringify(prePatchGjsToolJson),
    )
    console.log('[vapi/sync-assistant] pre_patch_find_customer_payload', {
      'function.description': prePatchFind?.description
        ? clipText(prePatchFind.description, 280)
        : null,
      'function.parameters.required': prePatchFind?.parametersRequired ?? null,
    })

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
      const patchModel =
        result &&
        typeof result === 'object' &&
        (result as Record<string, unknown>).model &&
        typeof (result as Record<string, unknown>).model === 'object' &&
        !Array.isArray((result as Record<string, unknown>).model)
          ? ((result as Record<string, unknown>).model as Record<string, unknown>)
          : null
      const patchToolIds = patchModel?.toolIds
      const patchTools = patchModel?.tools
      console.log('[vapi/sync-assistant] Vapi saved assistant', {
        organization_id: organizationId,
        assistant_id: result?.id || assistantId || null,
        patch_response_model_tool_ids: Array.isArray(patchToolIds)
          ? patchToolIds.filter((x): x is string => typeof x === 'string')
          : null,
        patch_response_model_tools_count: Array.isArray(patchTools) ? patchTools.length : null,
        patch_response_model_tool_names: Array.isArray(patchTools) ? toolNamesFromList(patchTools as unknown[]) : [],
        model_tool_names_sent: (assistantConfig.model.tools as unknown[]).map((t) => toolDisplayNameFromVapiItem(t)),
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

    const resolvedAssistantId = (result?.id as string | undefined) || assistantId || ''

    let postPatchGetStatus = 0
    let postPatchFetched: unknown = null
    if (resolvedAssistantId) {
      const getRes = await fetch(`https://api.vapi.ai/assistant/${resolvedAssistantId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${vapiApiKey}`,
        },
      })
      postPatchGetStatus = getRes.status
      const getText = await getRes.text()
      try {
        postPatchFetched = getText ? JSON.parse(getText) : null
      } catch {
        postPatchFetched = { parseError: true, rawPreview: clipText(getText, 200) }
      }
      const summary = summarizeAssistantFromVapi(postPatchFetched)
      const postGjs = summary && typeof summary === 'object' && 'get_job_status' in summary ? summary.get_job_status : null
      console.log('[vapi/sync-assistant] post_patch_get_assistant', {
        httpStatus: postPatchGetStatus,
        ...summary,
      })
      const toolsAudit = postPatchAssistantToolsSummary(postPatchFetched, {
        transferToolsInPayload: persistentTransferTools.length > 0,
      })
      console.log('[vapi/sync-assistant] postPatchAssistantSummary', toolsAudit)
      const recFetched = postPatchFetched as Record<string, unknown>
      const modelFetched =
        recFetched.model && typeof recFetched.model === 'object' && !Array.isArray(recFetched.model)
          ? (recFetched.model as Record<string, unknown>)
          : null
      const mtFetched = modelFetched?.tools
      if (Array.isArray(mtFetched)) {
        console.log('[vapi/sync-assistant] post_patch_model_tools_json_preview', {
          byte_length_estimate: JSON.stringify(mtFetched).length,
          preview: clipText(JSON.stringify(mtFetched), 14000),
        })
      } else {
        console.warn('[vapi/sync-assistant] post_patch_model_tools_missing', {
          model_has_tools_key: modelFetched ? Object.prototype.hasOwnProperty.call(modelFetched, 'tools') : false,
          model_tools_type: mtFetched == null ? 'null_undefined' : typeof mtFetched,
        })
      }
      if (toolsAudit && typeof toolsAudit === 'object' && !('error' in toolsAudit)) {
        const a = toolsAudit as Record<string, unknown>
        if (Array.isArray(a.missing_from_combined) && a.missing_from_combined.length > 0) {
          console.warn('[vapi/sync-assistant] post_patch_tools_missing_vs_expected', {
            missing_from_combined: a.missing_from_combined,
            hint: 'Si model.tools en GET está vacío pero el PATCH lo envió, puede ser omisión en la respuesta GET de Vapi. Si faltan en runtime, valorar Tools Library + model.toolIds.',
          })
        }
      }
      console.log('[vapi/sync-assistant] post_patch_get_job_status_required_explicit', {
        parametersRequired: postGjs?.parametersRequired ?? null,
        parametersRequiredJSON: JSON.stringify(postGjs?.parametersRequired ?? null),
      })
    } else {
      console.warn('[vapi/sync-assistant] post_patch_get_skipped_no_assistant_id')
    }

    const phoneReport = await fetchVapiPhoneNumbersForSync(vapiApiKey, resolvedAssistantId)
    console.log('[vapi/sync-assistant] vapi_phone_numbers', {
      ok: phoneReport.ok,
      httpStatus: phoneReport.httpStatus,
      count: phoneReport.items.length,
      matching_synced_assistant: phoneReport.items.filter((i) => i.matchesSyncedAssistant).length,
      items: phoneReport.items.map((i) => ({
        id: i.id,
        number: i.number,
        name: i.name,
        assistantId: i.assistantId,
        squadId: i.squadId,
        workflowId: i.workflowId,
        matchesSyncedAssistant: i.matchesSyncedAssistant,
      })),
    })

    const postSummary = summarizeAssistantFromVapi(postPatchFetched)
    const vapiGetSystemPrompt = extractRawSystemPromptFromVapiAssistant(postPatchFetched)
    const promptAuditAfterGet = vapiGetSystemPrompt
      ? auditSystemPromptForSync(vapiGetSystemPrompt)
      : null
    if (promptAuditAfterGet) {
      console.log('[vapi/sync-assistant] system_prompt_from_vapi_get_audit', {
        has_verification_phrase: promptAuditAfterGet.hasVerificationPhrase,
        forbidden_hits: promptAuditAfterGet.forbiddenHits,
        reglas_fragment: clipText(promptAuditAfterGet.reglasFragment, 1200),
      })
    }
    if (vapiGetSystemPrompt) {
      console.log('[vapi/sync-assistant] post_patch_vapi_system_prompt_reglas_fragment', {
        length: vapiGetSystemPrompt.length,
        fragment: extractReglasOperativasFragment(vapiGetSystemPrompt),
      })
    }

    const warnings: string[] = []
    if (basePromptSanitizeRemoved.length > 0) {
      warnings.push(
        `Se eliminaron del system_prompt de BD patrones viejos (${basePromptSanitizeRemoved.join(', ')}). Guardá el prompt en Admin si querés persistir la versión limpia.`,
      )
    }
    if (promptAuditPatchPayload.forbiddenHits.length > 0) {
      warnings.push(
        `El prompt enviado al PATCH aún contiene texto conflictivo: ${promptAuditPatchPayload.forbiddenHits.join(', ')}. Revisá assistant_configs (Prompts) o FAQs.`,
      )
    }
    if (!promptAuditPatchPayload.hasVerificationPhrase) {
      warnings.push(
        'El prompt final no incluye la frase de verificación de estado de pedido; revisá buildSystemPrompt.',
      )
    }
    if (postPatchGetStatus !== 200) {
      warnings.push(
        `GET assistant después del PATCH devolvió HTTP ${postPatchGetStatus}; no se pudo verificar el schema en Vapi.`,
      )
    }
    if (phoneReport.ok && resolvedAssistantId) {
      const match = phoneReport.items.filter((i) => i.matchesSyncedAssistant)
      if (match.length === 0) {
        warnings.push(
          'Ningún phone number en Vapi tiene assistantId igual al assistant sincronizado. Las llamadas pueden usar otro assistant o squad/workflow.',
        )
      }
      const other = phoneReport.items.filter(
        (i) => i.assistantId && i.assistantId !== resolvedAssistantId,
      )
      if (other.length > 0) {
        warnings.push(
          `${other.length} número(s) tienen otro assistantId; revisá la lista en la respuesta vapiVerification.phoneNumbers.`,
        )
      }
    }
    if (!phoneReport.ok) {
      warnings.push(
        `No se pudo listar phone-number en Vapi (HTTP ${phoneReport.httpStatus}). Verificá el número en el dashboard de Vapi.`,
      )
    }
    if (
      postSummary &&
      typeof postSummary === 'object' &&
      'get_job_status' in postSummary &&
      postSummary.get_job_status &&
      Array.isArray(postSummary.get_job_status.parametersRequired) &&
      postSummary.get_job_status.parametersRequired.length > 0
    ) {
      warnings.push(
        `Tras el PATCH, Vapi aún devuelve get_job_status.parameters.required = ${JSON.stringify(postSummary.get_job_status.parametersRequired)}.`,
      )
    }
    if (postPatchGetStatus === 200 && promptAuditAfterGet) {
      if (!promptAuditAfterGet.hasVerificationPhrase) {
        warnings.push(
          'El GET del assistant en Vapi no devuelve el system prompt con la frase de verificación nueva. Posibles causas: caché en la UI de Vapi, cambios sin publicar (botón Publish), o el GET no refleja el último PATCH.',
        )
      }
      if (promptAuditAfterGet.forbiddenHits.length > 0) {
        warnings.push(
          `El system prompt que devuelve Vapi (GET) aún contiene: ${promptAuditAfterGet.forbiddenHits.join(', ')}.`,
        )
      }
    }

    return NextResponse.json({
      success: true,
      assistantId: resolvedAssistantId,
      message: assistantId ? 'Assistant updated' : 'Assistant created',
      vapiPublish: {
        assistantId: resolvedAssistantId,
        organizationId,
        serverUrl: `${appBase}/api/voice/events?organization_id=${organizationId}`,
        vapiEventsUrl: `${appBase}/api/vapi/events?organization_id=${organizationId}`,
        toolCallsCompatUrl: `${appBase}/api/vapi/tool-calls?organization_id=${organizationId}`,
        getJobStatusToolPostUrl: `${appBase}/api/vapi/tools/get-job-status`,
        webhookSecretHeader: 'x-vapi-secret',
        getJobStatusSchemaNote:
          'En Vapi, get_job_status debe tener parameters.required = [] y puede llevar server.url al endpoint get-job-status (ya publicado en sync).',
        vapiDashboardNotes: [
          'Si el dashboard muestra un borrador o el botón Publish sigue activo tras el sync: el PATCH por API actualiza el recurso del assistant, pero la UI de Vapi puede exigir “Publicar” para que la vista y las pruebas reflejen exactamente lo guardado.',
          'Si tool-calls devuelve 404: en Vercel filtrá logs por path del POST; comprobá GET https://TU_DOMINIO/api/vapi/tool-calls (debe devolver JSON ok) y que Server URL use el mismo dominio que este deploy.',
        ],
      },
      vapiVerification: {
        prePatchGetJobStatus: prePatchGjs
          ? {
              functionName: prePatchGjs.functionName,
              descriptionPreview: prePatchGjs.description
                ? clipText(prePatchGjs.description, 400)
                : null,
              parametersRequired: prePatchGjs.parametersRequired,
              phoneDescriptionPreview: prePatchGjs.phoneDescription
                ? clipText(prePatchGjs.phoneDescription, 220)
                : null,
              organizationIdDescriptionPreview: prePatchGjs.organizationIdDescription
                ? clipText(prePatchGjs.organizationIdDescription, 220)
                : null,
              serverUrl: prePatchGjs.serverUrl,
            }
          : null,
        postPatchGetHttpStatus: postPatchGetStatus,
        postPatchAssistantSummary:
          postPatchGetStatus === 200 ? summarizeAssistantFromVapi(postPatchFetched) : null,
        phoneNumbers: phoneReport,
        promptAudit: {
          verificationPhraseMarker: JOB_STATUS_SYNC_VERIFICATION_PHRASE,
          basePromptSanitizeRemoved: basePromptSanitizeRemoved,
          patchPayload: promptAuditPatchPayload,
          vapiGet: promptAuditAfterGet,
          vapiGetSystemPromptLength: vapiGetSystemPrompt?.length ?? null,
        },
        warnings,
      },
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
