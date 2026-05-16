import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type BusinessProfile = {
  id: string
  organization_id: string
  business_name: string | null
  industry_key: string
  industry_label: string | null
  timezone: string | null
  language: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CrmTemplate = {
  id: string
  industry_key: string
  name: string
  description: string | null
  is_active: boolean
}

export type CrmCustomField = {
  id: string
  field_key: string
  label: string
  field_type: string
  is_required: boolean
  sort_order: number
  options: unknown
  metadata: Record<string, unknown>
}

export type CrmPipelineStage = {
  id: string
  stage_key: string
  label: string
  sort_order: number
  is_default: boolean
  is_closed: boolean
  metadata: Record<string, unknown>
}

export type CrmDashboardModule = {
  id: string
  module_key: string
  label: string
  is_enabled: boolean
  sort_order: number
  metadata: Record<string, unknown>
}

export type CrmTemplateBundle = {
  template: CrmTemplate
  fields: CrmCustomField[]
  stages: CrmPipelineStage[]
  modules: CrmDashboardModule[]
  assistant_prompt: string | null
}

export type UpsertBusinessProfileInput = {
  business_name?: string | null
  industry_key: string
  timezone?: string | null
  language?: string
  metadata?: Record<string, unknown>
}

const DEFAULT_INDUSTRY_KEY = 'general'

function isMissingIndustryCrmTableError(err: { message?: string; code?: string }): boolean {
  if (err.code === '42P01') return true
  const msg = (err.message || '').toLowerCase()
  return (
    msg.includes('business_profiles') ||
    msg.includes('crm_templates') ||
    msg.includes('custom_fields') ||
    msg.includes('pipeline_stages') ||
    msg.includes('assistant_prompts') ||
    msg.includes('dashboard_modules')
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export async function listActiveCrmTemplates(): Promise<CrmTemplate[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('crm_templates')
    .select('id, industry_key, name, description, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    if (isMissingIndustryCrmTableError(error)) return []
    console.error('[crm/industry-templates] listActiveCrmTemplates', error)
    return []
  }
  return (data || []) as CrmTemplate[]
}

export async function getBusinessProfile(organizationId: string): Promise<BusinessProfile | null> {
  const orgId = organizationId.trim()
  if (!orgId) return null

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) {
    if (isMissingIndustryCrmTableError(error)) return null
    console.error('[crm/industry-templates] getBusinessProfile', error)
    return null
  }
  if (!data) return null
  return { ...(data as BusinessProfile), metadata: asRecord((data as BusinessProfile).metadata) }
}

export async function getCrmTemplateByIndustry(industryKey: string): Promise<CrmTemplate | null> {
  const key = industryKey.trim() || DEFAULT_INDUSTRY_KEY
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('crm_templates')
    .select('id, industry_key, name, description, is_active')
    .eq('industry_key', key)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    if (isMissingIndustryCrmTableError(error)) return null
    console.error('[crm/industry-templates] getCrmTemplateByIndustry', error)
    return null
  }
  return (data as CrmTemplate) || null
}

async function loadTemplateChildren(templateId: string, language: string): Promise<Omit<CrmTemplateBundle, 'template'>> {
  const supabase = createServiceRoleClient()
  const lang = language.trim() || 'es'

  const [fieldsRes, stagesRes, modulesRes, promptRes] = await Promise.all([
    supabase
      .from('custom_fields')
      .select('id, field_key, label, field_type, is_required, sort_order, options, metadata')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('pipeline_stages')
      .select('id, stage_key, label, sort_order, is_default, is_closed, metadata')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('dashboard_modules')
      .select('id, module_key, label, is_enabled, sort_order, metadata')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('assistant_prompts')
      .select('prompt_text')
      .eq('template_id', templateId)
      .eq('prompt_key', 'default')
      .eq('language', lang)
      .maybeSingle(),
  ])

  const mapField = (row: Record<string, unknown>): CrmCustomField => ({
    id: String(row.id),
    field_key: String(row.field_key),
    label: String(row.label),
    field_type: String(row.field_type || 'text'),
    is_required: Boolean(row.is_required),
    sort_order: Number(row.sort_order) || 100,
    options: row.options ?? [],
    metadata: asRecord(row.metadata),
  })

  return {
    fields: (fieldsRes.data || []).map((r) => mapField(r as Record<string, unknown>)),
    stages: (stagesRes.data || []) as CrmPipelineStage[],
    modules: (modulesRes.data || []) as CrmDashboardModule[],
    assistant_prompt: promptRes.data?.prompt_text ? String(promptRes.data.prompt_text) : null,
  }
}

export async function getOrganizationCrmTemplate(organizationId: string): Promise<CrmTemplateBundle | null> {
  const profile = await getBusinessProfile(organizationId)
  const industryKey = profile?.industry_key?.trim() || DEFAULT_INDUSTRY_KEY
  const language = profile?.language?.trim() || 'es'

  const template = await getCrmTemplateByIndustry(industryKey)
  const resolved =
    template || (await getCrmTemplateByIndustry(DEFAULT_INDUSTRY_KEY))
  if (!resolved) return null

  const children = await loadTemplateChildren(resolved.id, language)
  return {
    template: resolved,
    ...children,
  }
}

export async function getOrganizationAssistantPrompt(
  organizationId: string,
  language = 'es',
): Promise<string | null> {
  const bundle = await getOrganizationCrmTemplate(organizationId)
  if (bundle?.assistant_prompt?.trim()) return bundle.assistant_prompt.trim()

  const fallback = await getCrmTemplateByIndustry(DEFAULT_INDUSTRY_KEY)
  if (!fallback) return null

  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('assistant_prompts')
    .select('prompt_text')
    .eq('template_id', fallback.id)
    .eq('prompt_key', 'default')
    .eq('language', language.trim() || 'es')
    .maybeSingle()

  const text = data?.prompt_text ? String(data.prompt_text).trim() : ''
  return text || null
}

export function appendIndustryCrmContextToSystemPrompt(
  systemPrompt: string,
  industryPrompt: string | null,
): string {
  const base = systemPrompt.trim()
  const extra = industryPrompt?.trim()
  if (!extra) return base
  return `${base}\n\nIndustry CRM context:\n${extra}`
}

export async function upsertBusinessProfile(
  organizationId: string,
  input: UpsertBusinessProfileInput,
): Promise<{ profile: BusinessProfile | null; error?: string }> {
  const orgId = organizationId.trim()
  if (!orgId) return { profile: null, error: 'invalid_organization' }

  const industryKey = input.industry_key.trim()
  if (!industryKey) return { profile: null, error: 'invalid_industry_key' }

  const template = await getCrmTemplateByIndustry(industryKey)
  if (!template) return { profile: null, error: 'unknown_industry_key' }

  const language = (input.language?.trim() || 'es').slice(0, 10)
  const now = new Date().toISOString()
  const row = {
    organization_id: orgId,
    business_name: input.business_name?.trim() || null,
    industry_key: industryKey,
    industry_label: template.name,
    timezone: input.timezone?.trim() || null,
    language,
    metadata: input.metadata ?? {},
    updated_at: now,
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('business_profiles')
    .upsert(row, { onConflict: 'organization_id' })
    .select('*')
    .single()

  if (error) {
    if (isMissingIndustryCrmTableError(error)) {
      return { profile: null, error: 'migration_required' }
    }
    console.error('[crm/industry-templates] upsertBusinessProfile', error)
    return { profile: null, error: 'upsert_failed' }
  }

  return {
    profile: {
      ...(data as BusinessProfile),
      metadata: asRecord((data as BusinessProfile).metadata),
    },
  }
}
