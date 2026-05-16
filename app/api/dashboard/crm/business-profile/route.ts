import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import {
  getBusinessProfile,
  getOrganizationCrmTemplate,
  listActiveCrmTemplates,
  upsertBusinessProfile,
} from '@/lib/crm/industry-templates'

export async function GET() {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [profile, bundle, available_templates] = await Promise.all([
      getBusinessProfile(organizationId),
      getOrganizationCrmTemplate(organizationId),
      listActiveCrmTemplates(),
    ])

    return NextResponse.json({
      profile,
      template: bundle?.template ?? null,
      fields: bundle?.fields ?? [],
      stages: bundle?.stages ?? [],
      modules: bundle?.modules ?? [],
      assistant_prompt: bundle?.assistant_prompt ?? null,
      available_templates,
    })
  } catch (e) {
    console.error('[api/dashboard/crm/business-profile] GET', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      business_name?: unknown
      industry_key?: unknown
      timezone?: unknown
      language?: unknown
      metadata?: unknown
    }

    const industryKey =
      typeof body.industry_key === 'string' ? body.industry_key.trim() : ''
    if (!industryKey) {
      return NextResponse.json(
        { error: 'invalid_payload', message: 'industry_key is required' },
        { status: 400 },
      )
    }

    const language =
      typeof body.language === 'string' && body.language.trim()
        ? body.language.trim()
        : 'es'

    const metadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {}

    const { profile, error } = await upsertBusinessProfile(organizationId, {
      business_name:
        typeof body.business_name === 'string' ? body.business_name : null,
      industry_key: industryKey,
      timezone: typeof body.timezone === 'string' ? body.timezone : null,
      language,
      metadata,
    })

    if (error === 'unknown_industry_key') {
      return NextResponse.json(
        { error: 'invalid_industry_key', message: 'industry_key not found in crm_templates' },
        { status: 400 },
      )
    }
    if (error === 'migration_required') {
      return NextResponse.json(
        {
          error: 'migration_required',
          message: 'Apply supabase/migrations/024_industry_crm_templates.sql first.',
        },
        { status: 503 },
      )
    }
    if (error || !profile) {
      return NextResponse.json({ error: error || 'upsert_failed' }, { status: 500 })
    }

    const bundle = await getOrganizationCrmTemplate(organizationId)

    return NextResponse.json({
      ok: true,
      profile,
      template: bundle?.template ?? null,
      fields: bundle?.fields ?? [],
      stages: bundle?.stages ?? [],
      modules: bundle?.modules ?? [],
    })
  } catch (e) {
    console.error('[api/dashboard/crm/business-profile] PATCH', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
