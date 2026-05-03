import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildSystemPrompt } from '@/lib/vapi/prompts'
import { parseTransferDestinations, type TransferDestination } from '@/lib/vapi/transfer-destinations'

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
}

export async function getOrganizationRuntimeConfig(
  organizationId: string,
): Promise<VapiRuntimeConfig> {
  const supabase = createServiceRoleClient()
  const [ai, routing, hours, catalog, orgRow, productsHead] = await Promise.all([
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
  ])
  if (ai.error) throw ai.error
  if (routing.error) throw routing.error
  if (hours.error) throw hours.error
  if (catalog.error) throw catalog.error
  if (orgRow.error && orgRow.error.code !== 'PGRST205') throw orgRow.error
  if (productsHead.error && productsHead.error.code !== 'PGRST205') throw productsHead.error

  const aiRow = ai.data
  const routingRow = routing.data
  const catalogRows = (catalog.data || []).filter((r: Record<string, unknown>) =>
    organizationCatalogRowActive(r),
  )
  const businessRows = hours.data || []
  const transferDestinations = parseTransferDestinations(routingRow?.transfer_destinations)
  const hasTransferPhone =
    transferDestinations.length > 0 ||
    !!routingRow?.ramon_transfer_number ||
    !!routingRow?.default_transfer_number ||
    !!routingRow?.urgent_transfer_number

  const hasProductCatalog = (productsHead.count || 0) > 0
  const prompt = buildSystemPrompt({
    basePrompt:
      (aiRow?.system_prompt as string | null) ||
      'Eres un asistente de atencion telefonica empresarial.',
    fallbackMessage:
      (aiRow?.fallback_message as string | null) ||
      'No pude validar tus datos. Te contactaremos.',
    hasCatalog: catalogRows.length > 0 || hasProductCatalog,
    hasTransferPhone,
    transferDestinations,
  })

  const displayName =
    (orgRow.data?.name as string | undefined)?.trim() || 'nosotros'

  return {
    organizationId,
    organizationDisplayName: displayName,
    prompt,
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
