import { teamMembersToTransferDestinations } from '@/lib/dashboard/sync-team-transfer-routing'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildSystemPrompt, sanitizeFaqTextForSync } from '@/lib/vapi/prompts'
import {
  isPlausibleE164,
  parseTransferDestinations,
  type TransferDestination,
} from '@/lib/vapi/transfer-destinations'
import { normalizePhone } from '@/lib/phone'

function mergeTransferDestinationLists(
  fromRouting: TransferDestination[],
  fromTeam: TransferDestination[],
): TransferDestination[] {
  const seen = new Set<string>()
  const out: TransferDestination[] = []
  for (const d of [...fromRouting, ...fromTeam]) {
    const phone = normalizePhone(d.phoneE164)
    if (!phone || !isPlausibleE164(phone)) continue
    if (seen.has(phone)) continue
    seen.add(phone)
    out.push({ ...d, phoneE164: phone })
  }
  return out
}

/** Catálogo: 007 usa `is_active`; 008+ añade `active`. No filtrar por columna inexistente en PostgREST. */
function organizationCatalogRowActive(r: Record<string, unknown>): boolean {
  if (r.active === false || r.is_active === false) return false
  return true
}

export type VapiRuntimeConfig = {
  organizationId: string
  /** organizations.name — para saludo personalizado en assistant-request */
  organizationDisplayName: string
  prompt: string
  welcomeMessage: string
  fallbackMessage: string
  toolsEnabled: string[]
  spamPolicy: {
    maxFailedAttempts: number
    threshold: number
  }
  businessHours: Array<{
    dayOfWeek: number
    opensAt: string | null
    closesAt: string | null
    active: boolean
  }>
  transferPolicy: {
    defaultTransferNumber: string | null
    ramonTransferNumber: string | null
    urgentTransferNumber: string | null
    allowLiveTransfer: boolean
    callbackDefaultOwner: string | null
    afterHoursBehavior: string | null
    /** Destinos por interno + nombre + E.164 para enrutar según lo que pide el cliente */
    transferDestinations: TransferDestination[]
  }
  catalog: Array<{
    serviceCode: string | null
    serviceName: string
    publicPrice: number
    currency: string
    priceType: string | null
    estimatedOnly: boolean
  }>
  /** Para armar el mismo prompt que `prompt` con otro `basePrompt` (ej. sync desde assistant_configs). */
  hasCatalogForPrompt: boolean
  hasTransferPhoneForPrompt: boolean
}

export async function getOrganizationRuntimeConfig(
  organizationId: string,
): Promise<VapiRuntimeConfig> {
  const supabase = createServiceRoleClient()
  const [ai, routing, hours, catalog, orgRow, productsHead, teamMembersRes, faqsHead, activeAssistantCfg] =
    await Promise.all([
      supabase.from('organization_ai_config').select('*').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('organization_routing').select('*').eq('organization_id', organizationId).maybeSingle(),
      supabase
        .from('organization_business_hours')
        .select('*')
        .eq('organization_id', organizationId)
        .order('day_of_week', { ascending: true }),
      supabase
        .from('organization_catalog')
        .select('*')
        .eq('organization_id', organizationId),
      supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      supabase.from('team_members').select('*').eq('organization_id', organizationId),
      supabase
        .from('faqs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      supabase
        .from('assistant_configs')
        .select('voice_id, voice_provider')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
  if (ai.error) throw ai.error
  if (routing.error) throw routing.error
  if (hours.error) throw hours.error
  if (catalog.error) throw catalog.error
  if (orgRow.error && orgRow.error.code !== 'PGRST205') throw orgRow.error
  if (productsHead.error && productsHead.error.code !== 'PGRST205') throw productsHead.error
  if (teamMembersRes.error && teamMembersRes.error.code !== 'PGRST205') throw teamMembersRes.error
  if (faqsHead.error && faqsHead.error.code !== 'PGRST205') throw faqsHead.error
  if (activeAssistantCfg.error && activeAssistantCfg.error.code !== 'PGRST205') throw activeAssistantCfg.error

  const aiRow = ai.data
  const routingRow = routing.data
  const catalogRows = (catalog.data || []).filter((r: Record<string, unknown>) =>
    organizationCatalogRowActive(r),
  )
  const businessRows = hours.data || []

  const teamRows = (teamMembersRes.data || []) as Record<string, unknown>[]
  const fromTeamBuilt = teamMembersToTransferDestinations(
    teamRows.map((r) => ({
      name: String(r.name || ''),
      phone: typeof r.phone === 'string' ? r.phone : null,
      extension: typeof r.extension === 'string' ? r.extension : null,
      is_available: r.is_available !== false,
      role: typeof r.role === 'string' ? r.role : null,
      department: typeof r.department === 'string' ? r.department : null,
    })),
  )
  const fromTeam: TransferDestination[] = fromTeamBuilt.map((r) => ({
    extension: r.extension,
    name: r.name,
    phoneE164: r.phone_e164,
    ...(r.role ? { role: r.role } : {}),
    ...(r.department ? { department: r.department } : {}),
  }))
  const fromRouting = parseTransferDestinations(routingRow?.transfer_destinations)
  const transferDestinations = mergeTransferDestinationLists(fromRouting, fromTeam)

  const assistantCfgRow = activeAssistantCfg.data as { voice_id?: string | null; voice_provider?: string | null } | null
  console.info('[runtime-config]', {
    organization_id: organizationId,
    teamCount: teamRows.length,
    productCount: productsHead.count ?? 0,
    faqCount: faqsHead.count ?? 0,
    hasAssistantConfig: Boolean(aiRow),
    hasVoiceConfig: Boolean(assistantCfgRow?.voice_id?.trim() || assistantCfgRow?.voice_provider?.trim()),
    transferDestinations: transferDestinations.map((d) => ({
      extension: d.extension || null,
      name: d.name,
      phone_suffix: d.phoneE164.length >= 4 ? d.phoneE164.slice(-4) : null,
    })),
  })
  const hasTransferPhone =
    transferDestinations.length > 0 ||
    !!routingRow?.ramon_transfer_number ||
    !!routingRow?.default_transfer_number ||
    !!routingRow?.urgent_transfer_number

  const hasProductCatalog = (productsHead.count || 0) > 0
  let prompt = buildSystemPrompt({
    basePrompt:
      (aiRow?.system_prompt as string | null) ||
      'Eres un asistente de atencion telefonica empresarial.',
    fallbackMessage:
      (aiRow?.fallback_message as string | null) ||
      'No pude validar tus datos. Te contactaremos.',
    hasCatalog: catalogRows.length > 0 || hasProductCatalog,
    hasTransferPhone,
    transferDestinations,
    organizationId,
  })

  const { data: faqs, error: faqErr } = await supabase
    .from('faqs')
    .select('question, answer')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .limit(10)
  if (!faqErr && faqs && faqs.length > 0) {
    prompt += '\n\nPreguntas frecuentes:\n'
    for (const f of faqs) {
      const q = sanitizeFaqTextForSync(String(f.question || ''))
      const a = sanitizeFaqTextForSync(String(f.answer || ''))
      prompt += `- ${q}: ${a}\n`
    }
  }

  const displayName =
    (orgRow.data?.name as string | undefined)?.trim() || 'nosotros'

  return {
    organizationId,
    organizationDisplayName: displayName,
    prompt,
    hasCatalogForPrompt: catalogRows.length > 0 || hasProductCatalog,
    hasTransferPhoneForPrompt: hasTransferPhone,
    welcomeMessage:
      (aiRow?.welcome_message as string | null) ||
      'Hola, gracias por llamar. ¿En qué puedo ayudarte hoy?',
    fallbackMessage:
      (aiRow?.fallback_message as string | null) ||
      'No pude validar tus datos. Te contactaremos.',
    toolsEnabled: (() => {
      const raw = aiRow?.allowed_tools
      if (Array.isArray(raw) && raw.length > 0) return raw as string[]
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const values = Object.values(raw as Record<string, unknown>).filter((v) => typeof v === 'string')
        if (values.length > 0) return values as string[]
      }
      const legacy = aiRow?.enabled_tools
      if (Array.isArray(legacy) && legacy.length > 0) return legacy as string[]
      return [
        'find_customer',
        'get_job_status',
        'create_appointment',
        'create_work_order',
        'get_price_quote',
        'prepare_warm_transfer',
        'transfer_to_ramon',
        'save_call_outcome',
        'mark_spam_call',
        'create_follow_up',
      ]
    })(),
    spamPolicy: {
      maxFailedAttempts: Number(aiRow?.max_failed_attempts || 2),
      threshold: Number((aiRow?.spam_policy as Record<string, unknown> | null)?.threshold || 70),
    },
    businessHours: businessRows.map((r: Record<string, unknown>) => {
      const fmt = (v: unknown) => {
        if (v == null) return null
        const s = String(v)
        return s.length >= 8 && s.includes(':') ? s.slice(0, 5) : s
      }
      const opens = fmt(r.opens_at) || fmt(r.open_time) || null
      const closes = fmt(r.closes_at) || fmt(r.close_time) || null
      const active =
        r.active !== undefined && r.active !== null
          ? Boolean(r.active)
          : r.is_open !== undefined && r.is_open !== null
            ? Boolean(r.is_open)
            : true
      return {
        dayOfWeek: Number(r.day_of_week ?? 0),
        opensAt: opens,
        closesAt: closes,
        active,
      }
    }),
    transferPolicy: {
      defaultTransferNumber: (routingRow?.default_transfer_number as string | null) || null,
      ramonTransferNumber: (routingRow?.ramon_transfer_number as string | null) || null,
      urgentTransferNumber: (routingRow?.urgent_transfer_number as string | null) || null,
      allowLiveTransfer: Boolean(routingRow?.allow_live_transfer ?? true),
      callbackDefaultOwner: (routingRow?.callback_default_owner as string | null) || null,
      afterHoursBehavior: (routingRow?.after_hours_behavior as string | null) || null,
      transferDestinations,
    },
    catalog: catalogRows.map((r: Record<string, unknown>) => {
      const unit = r.public_price ?? r.price ?? r.unit_price
      return {
        serviceCode: (r.service_code as string | null) || null,
        serviceName: String(r.service_name || ''),
        publicPrice: Number(unit ?? 0),
        currency: String(r.currency || 'USD'),
        priceType: (r.price_type as string | null) || null,
        estimatedOnly: Boolean(r.estimated_only),
      }
    }),
  }
}
