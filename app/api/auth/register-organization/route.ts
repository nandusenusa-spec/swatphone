import { NextResponse } from 'next/server'
import { isPublicOrgRegistrationEnabled } from '@/lib/auth/public-org-registration'
import { registerOrganizationWithOwner } from '@/lib/auth/register-organization'

export async function POST(request: Request) {
  if (!isPublicOrgRegistrationEnabled()) {
    return NextResponse.json(
      { error: 'registration_disabled', message: 'El registro público está desactivado.' },
      { status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const result = await registerOrganizationWithOwner({
    company_name: typeof body.company_name === 'string' ? body.company_name : '',
    owner_full_name:
      typeof body.owner_full_name === 'string' ? body.owner_full_name : null,
    owner_email: typeof body.owner_email === 'string' ? body.owner_email : '',
    owner_password: typeof body.owner_password === 'string' ? body.owner_password : '',
    industry_key: typeof body.industry_key === 'string' ? body.industry_key : '',
    timezone: typeof body.timezone === 'string' ? body.timezone : null,
    language: typeof body.language === 'string' ? body.language : 'es',
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error_code, message: result.message },
      { status: result.status },
    )
  }

  return NextResponse.json({
    ok: true,
    organization_id: result.organization_id,
    organization_slug: result.organization_slug,
    industry_key: result.industry_key,
  })
}
