import { NextResponse } from 'next/server'
import { isDemoBypassAuth } from '@/lib/auth/demo-bypass'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function PATCH(request: Request) {
  if (isDemoBypassAuth()) {
    return NextResponse.json(
      { error: 'demo_mode_readonly', message: 'En modo demo no se puede cambiar el perfil.' },
      { status: 403 },
    )
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const fullName =
      typeof body.full_name === 'string' ? body.full_name.trim() : undefined
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined

    if (fullName === undefined && email === undefined) {
      return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })
    }

    if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    const svc = createServiceRoleClient()

    if (email !== undefined && email !== user.email) {
      const { error: authUpdateErr } = await svc.auth.admin.updateUserById(user.id, { email })
      if (authUpdateErr) {
        return NextResponse.json(
          { error: authUpdateErr.message || 'auth_email_update_failed' },
          { status: 400 },
        )
      }
    }

    const profilePatch: Record<string, string> = {}
    if (fullName !== undefined) profilePatch.full_name = fullName || ''
    if (email !== undefined) profilePatch.email = email

    if (Object.keys(profilePatch).length > 0) {
      profilePatch.updated_at = new Date().toISOString()
      const { error: profErr } = await svc.from('profiles').update(profilePatch).eq('id', user.id)
      if (profErr) {
        return NextResponse.json({ error: profErr.message || 'profile_update_failed' }, { status: 500 })
      }
    }

    return NextResponse.json({
      ok: true,
      full_name: fullName ?? null,
      email: email ?? user.email,
    })
  } catch (e) {
    console.error('[api/dashboard/profile]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
