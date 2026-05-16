import { createServerClient } from '@supabase/ssr'
import { organizationHasDashboardAccess } from '@/lib/billing/subscription-access'
import { isDemoBypassAuth } from '@/lib/auth/demo-bypass'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl?.trim() || !supabaseAnon?.trim()) {
    console.warn(
      '[middleware] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing; session refresh skipped',
    )
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnon,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getUser() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect dashboard routes (TEMP DEMO: allow without Supabase user when bypass is on)
  if (
    request.nextUrl.pathname.startsWith('/dashboard') &&
    !user &&
    !isDemoBypassAuth()
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  if (
    user &&
    request.nextUrl.pathname.startsWith('/dashboard') &&
    !request.nextUrl.pathname.startsWith('/dashboard/settings/billing') &&
    !isDemoBypassAuth() &&
    process.env.STRIPE_ENFORCE_BILLING === 'true'
  ) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()
    const orgId = profile?.organization_id as string | undefined
    if (orgId && !(await organizationHasDashboardAccess(orgId))) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard/settings/billing'
      url.searchParams.set('billing', 'required')
      return NextResponse.redirect(url)
    }
  }

  // Super Admin usa cookie admin_token; el CRM del cliente usa Supabase en /dashboard.
  // Si hay sesión de cliente pero no token de super admin, no mandar a /admin/login: ir al CRM.
  const isAdminPath =
    request.nextUrl.pathname.startsWith('/admin') && request.nextUrl.pathname !== '/admin/login'
  if (isAdminPath) {
    const adminToken = request.cookies.get('admin_token')?.value
    if (!adminToken && user) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.searchParams.delete('notice')
      return NextResponse.redirect(url)
    }
  }

  // Admin routes use separate auth (cookie-based, not Supabase)
  // Allow /admin/login without any auth
  // Other /admin/* routes are protected by the admin layout checking the cookie
  if (request.nextUrl.pathname === '/admin/login') {
    return supabaseResponse
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
