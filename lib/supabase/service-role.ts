import { createServerClient } from '@supabase/ssr'

/** Prefer SUPABASE_URL on server; fallback to public URL (Vercel / local). */
export function getServiceRoleSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ''
  )
}

export function createServiceRoleClient() {
  const url = getServiceRoleSupabaseUrl()
  return createServerClient(
    url || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}
