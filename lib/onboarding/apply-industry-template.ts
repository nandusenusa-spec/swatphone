import {
  getIndustryTemplate,
  INDUSTRY_TEMPLATE_VERSION,
  type IndustryKey,
  type IndustryTemplate,
} from './industry-templates'

export type IndustryMetadataSource = 'admin_create_organization' | 'explicit_admin_request'

export type IndustryTemplateMetadata = {
  industry: IndustryKey
  industry_template_version: typeof INDUSTRY_TEMPLATE_VERSION
  industry_template_applied_at: string
  industry_template_source: IndustryMetadataSource
}

type SettingsRecord = Record<string, unknown>

type SupabaseOrganizationSettingsUpdater = {
  from: (table: 'organizations') => {
    update: (values: { settings: SettingsRecord }) => {
      eq: (column: 'id', value: string) => Promise<{ error: unknown }>
    }
  }
}

function isSettingsRecord(value: unknown): value is SettingsRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function prepareIndustryTemplateMetadata(
  industry: unknown,
  source: IndustryMetadataSource = 'admin_create_organization',
  now = new Date(),
): { template: IndustryTemplate; metadata: IndustryTemplateMetadata } {
  const template = getIndustryTemplate(industry)
  return {
    template,
    metadata: {
      industry: template.key,
      industry_template_version: INDUSTRY_TEMPLATE_VERSION,
      industry_template_applied_at: now.toISOString(),
      industry_template_source: source,
    },
  }
}

export function mergeIndustryTemplateMetadata(
  existingSettings: unknown,
  industry: unknown,
  source: IndustryMetadataSource = 'admin_create_organization',
  now = new Date(),
): { template: IndustryTemplate; settings: SettingsRecord } {
  const { template, metadata } = prepareIndustryTemplateMetadata(industry, source, now)
  const baseSettings = isSettingsRecord(existingSettings) ? { ...existingSettings } : {}

  return {
    template,
    settings: {
      ...baseSettings,
      ...metadata,
    },
  }
}

export async function applyIndustryTemplateToOrganization({
  supabase,
  organizationId,
  existingSettings,
  industry,
  source = 'explicit_admin_request',
}: {
  supabase: SupabaseOrganizationSettingsUpdater
  organizationId: string
  existingSettings: unknown
  industry: unknown
  source?: IndustryMetadataSource
}): Promise<{ template: IndustryTemplate; settings: SettingsRecord }> {
  const { template, settings } = mergeIndustryTemplateMetadata(existingSettings, industry, source)
  const { error } = await supabase
    .from('organizations')
    .update({ settings })
    .eq('id', organizationId)

  if (error) throw error
  return { template, settings }
}
