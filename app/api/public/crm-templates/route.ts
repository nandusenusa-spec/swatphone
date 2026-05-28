import { NextResponse } from 'next/server'
import { isPublicOrgRegistrationEnabled } from '@/lib/auth/public-org-registration'
import { listActiveCrmTemplates } from '@/lib/crm/industry-templates'

export async function GET() {
  if (!isPublicOrgRegistrationEnabled()) {
    return NextResponse.json({ error: 'registration_disabled' }, { status: 403 })
  }

  const templates = await listActiveCrmTemplates()
  return NextResponse.json({
    templates: templates.map((t) => ({
      industry_key: t.industry_key,
      name: t.name,
      description: t.description,
    })),
  })
}
