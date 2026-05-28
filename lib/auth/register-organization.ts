import 'server-only'

import { slugifyOrgName } from '@/lib/auth/slugify-org'
import { getCrmTemplateByIndustry, upsertBusinessProfile } from '@/lib/crm/industry-templates'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type RegisterOrganizationInput = {
  company_name: string
  owner_full_name?: string | null
  owner_email: string
  owner_password: string
  industry_key: string
  timezone?: string | null
  language?: string
}

export type RegisterOrganizationResult =
  | {
      ok: true
      organization_id: string
      organization_slug: string
      owner_user_id: string
      industry_key: string
    }
  | {
      ok: false
      error_code: string
      message: string
      status: number
    }

function friendlyAuthError(raw: string): RegisterOrganizationResult {
  const lower = raw.toLowerCase()
  if (
    lower.includes('already been registered') ||
    lower.includes('user already registered') ||
    lower.includes('email already exists') ||
    (lower.includes('email') && lower.includes('already'))
  ) {
    return {
      ok: false,
      error_code: 'duplicate_email',
      message: 'Ese correo ya está registrado. Probá iniciar sesión o usá otro email.',
      status: 409,
    }
  }
  return {
    ok: false,
    error_code: 'registration_failed',
    message: raw || 'No se pudo completar el registro.',
    status: 500,
  }
}

async function resolveUniqueSlug(
  supabase: ReturnType<typeof createServiceRoleClient>,
  baseSlug: string,
): Promise<string | null> {
  if (!baseSlug) return null
  for (let n = 0; n < 100; n++) {
    const trySlug = n === 0 ? baseSlug : `${baseSlug}-${n}`
    const { data: ex, error: exErr } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', trySlug)
      .maybeSingle()
    if (exErr) throw exErr
    if (!ex) return trySlug
  }
  return null
}

export async function registerOrganizationWithOwner(
  input: RegisterOrganizationInput,
): Promise<RegisterOrganizationResult> {
  const companyName = input.company_name.trim()
  const ownerEmail = input.owner_email.trim().toLowerCase()
  const ownerPassword = input.owner_password
  const industryKey = input.industry_key.trim()
  const ownerFullName = input.owner_full_name?.trim() || companyName
  const timezone =
    input.timezone?.trim() || 'America/New_York'
  const language = (input.language?.trim() || 'es').slice(0, 10)

  if (!companyName || companyName.length < 2) {
    return {
      ok: false,
      error_code: 'invalid_company_name',
      message: 'Ingresá el nombre de la empresa.',
      status: 400,
    }
  }
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return {
      ok: false,
      error_code: 'invalid_email',
      message: 'El email no es válido.',
      status: 400,
    }
  }
  if (ownerPassword.length < 8) {
    return {
      ok: false,
      error_code: 'weak_password',
      message: 'La contraseña debe tener al menos 8 caracteres.',
      status: 400,
    }
  }
  if (!industryKey) {
    return {
      ok: false,
      error_code: 'invalid_industry',
      message: 'Seleccioná un rubro para tu negocio.',
      status: 400,
    }
  }

  const supabase = createServiceRoleClient()
  const baseSlug = slugifyOrgName(companyName)
  const slug = await resolveUniqueSlug(supabase, baseSlug)
  if (!slug) {
    return {
      ok: false,
      error_code: 'invalid_slug',
      message: 'No se pudo generar un identificador para la empresa.',
      status: 400,
    }
  }

  const industryTemplate = await getCrmTemplateByIndustry(industryKey)
  if (!industryTemplate) {
    return {
      ok: false,
      error_code: 'unknown_industry_key',
      message:
        'Rubro no disponible. Aplicá la migración de plantillas CRM o elegí otro rubro.',
      status: 400,
    }
  }

  const { data: createdOrg, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: companyName,
      slug,
      timezone,
      settings: {},
    })
    .select('id')
    .single()

  if (orgErr || !createdOrg) {
    return {
      ok: false,
      error_code: 'org_create_failed',
      message: orgErr?.message || 'No se pudo crear la empresa.',
      status: 500,
    }
  }

  const orgId = String(createdOrg.id)

  const owner = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: { full_name: ownerFullName, organization_id: orgId },
  })

  if (owner.error || !owner.data.user) {
    await supabase.from('organizations').delete().eq('id', orgId)
    const friendly = friendlyAuthError(owner.error?.message || 'failed_to_create_user')
    return friendly
  }

  const userId = owner.data.user.id

  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: userId,
    organization_id: orgId,
    email: ownerEmail,
    role: 'owner',
    full_name: ownerFullName,
    updated_at: new Date().toISOString(),
  })

  if (profileErr) {
    await supabase.auth.admin.deleteUser(userId)
    await supabase.from('organizations').delete().eq('id', orgId)
    return {
      ok: false,
      error_code: 'profile_create_failed',
      message: profileErr.message,
      status: 500,
    }
  }

  const { error: bpErr } = await upsertBusinessProfile(orgId, {
    industry_key: industryKey,
    business_name: companyName,
    timezone,
    language,
  })

  if (bpErr) {
    await supabase.auth.admin.deleteUser(userId)
    await supabase.from('organizations').delete().eq('id', orgId)
    return {
      ok: false,
      error_code: bpErr,
      message:
        bpErr === 'migration_required'
          ? 'Falta la migración CRM en Supabase (024_industry_crm_templates.sql).'
          : 'No se pudo guardar el rubro del negocio.',
      status: bpErr === 'migration_required' ? 503 : 500,
    }
  }

  await supabase.from('organization_ai_config').upsert(
    {
      organization_id: orgId,
      welcome_message: `Hola, gracias por llamar a ${companyName}. ¿En qué puedo ayudarte hoy?`,
      fallback_message: 'En este momento no pude validar los datos. Te contactaremos pronto.',
      allowed_tools: [
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
        'save_lead_info',
      ],
    },
    { onConflict: 'organization_id' },
  )

  await supabase.from('organization_routing').upsert(
    {
      organization_id: orgId,
      allow_live_transfer: true,
      callback_default_owner: 'Recepción',
      ramon_transfer_number: null,
    },
    { onConflict: 'organization_id' },
  )

  return {
    ok: true,
    organization_id: orgId,
    organization_slug: slug,
    owner_user_id: userId,
    industry_key: industryKey,
  }
}
