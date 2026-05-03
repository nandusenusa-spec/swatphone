import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type OrganizationRuntimeConfig = {
  organizationId: string
  prompt: string
  welcomeMessage: string
  toolsEnabled: string[]
  spamRules: {
    maxAttempts: number
    threshold: number
  }
  businessHours: Array<{
    dayOfWeek: number
    isOpen: boolean
    openTime: string | null
    closeTime: string | null
    timezone: string
  }>
  transferPolicy: {
    targetName: string
    targetPhone: string | null
    transferOnUrgent: boolean
    transferOnReclamo: boolean
    transferOnHotLead: boolean
    callbackIfUnavailable: boolean
    escalationPolicy: Record<string, unknown>
  }
  catalog: Array<{
    serviceName: string
    description: string | null
    price: number
    currency: string
  }>
}

const DEFAULT_TOOLS = [
  'find_customer',
  'get_job_status',
  'create_appointment',
  'create_work_order',
  'get_price_quote',
  'transfer_to_ramon',
  'save_call_outcome',
  'mark_spam_call',
  'create_follow_up',
]

export async function getOrganizationRuntimeConfig(
  organizationId: string,
): Promise<OrganizationRuntimeConfig> {
  const supabase = createServiceRoleClient()

  const [aiRes, routeRes, hoursRes, catalogRes, priceCatalogRes] = await Promise.all([
    supabase
      .from('organization_ai_config')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('organization_routing')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('organization_business_hours')
      .select('*')
      .eq('organization_id', organizationId)
      .order('day_of_week', { ascending: true }),
    supabase
      .from('organization_catalog')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true),
    supabase
      .from('price_catalog')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true),
  ])

  if (aiRes.error) throw aiRes.error
  if (routeRes.error) throw routeRes.error
  if (hoursRes.error) throw hoursRes.error
  if (catalogRes.error) throw catalogRes.error
  if (priceCatalogRes.error) throw priceCatalogRes.error

  const ai = aiRes.data
  const routing = routeRes.data
  const businessHoursRows = hoursRes.data || []
  const orgCatalog = catalogRes.data || []
  const priceCatalog = priceCatalogRes.data || []

  const catalog =
    orgCatalog.length > 0
      ? orgCatalog.map((row: Record<string, unknown>) => ({
          serviceName: String(row.service_name || ''),
          description: (row.description as string | null) || null,
          price: Number(row.price || 0),
          currency: String(row.currency || 'USD'),
        }))
      : priceCatalog.map((row: Record<string, unknown>) => ({
          serviceName: String(row.service_name || ''),
          description: (row.description as string | null) || null,
          price: Number(row.unit_price || 0),
          currency: String(row.currency || 'USD'),
        }))

  const config: OrganizationRuntimeConfig = {
    organizationId,
    prompt:
      (ai?.system_prompt as string | null) ||
      'Eres un asistente telefonico profesional. Nunca inventes precios, fechas o estados.',
    welcomeMessage:
      (ai?.welcome_message as string | null) ||
      'Hola, gracias por llamar. ¿En qué puedo ayudarte hoy?',
    toolsEnabled:
      (Array.isArray(ai?.enabled_tools) && ai?.enabled_tools.length > 0
        ? (ai?.enabled_tools as string[])
        : DEFAULT_TOOLS),
    spamRules: {
      maxAttempts: Number(ai?.spam_max_attempts || 2),
      threshold: Number(ai?.spam_threshold || 70),
    },
    businessHours: businessHoursRows.map((row: Record<string, unknown>) => ({
      dayOfWeek: Number(row.day_of_week || 0),
      isOpen: Boolean(row.is_open),
      openTime: (row.open_time as string | null) || null,
      closeTime: (row.close_time as string | null) || null,
      timezone: String(row.timezone || 'America/New_York'),
    })),
    transferPolicy: {
      targetName: String(routing?.transfer_target_name || 'Ramon'),
      targetPhone: (routing?.transfer_target_phone as string | null) || null,
      transferOnUrgent: Boolean(routing?.transfer_on_urgent ?? true),
      transferOnReclamo: Boolean(routing?.transfer_on_reclamo ?? true),
      transferOnHotLead: Boolean(routing?.transfer_on_hot_lead ?? true),
      callbackIfUnavailable: Boolean(routing?.callback_if_unavailable ?? true),
      escalationPolicy: (routing?.escalation_policy as Record<string, unknown>) || {},
    },
    catalog,
  }

  return config
}
