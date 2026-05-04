/** Allowed Supabase project ref for destructive admin routes (safety rail). */
export const PLAN_B_ALLOWED_PROJECT_REF = 'cgshxleyovgyzqjadhkv'

export function getResolvedSupabaseUrl(): string | null {
  const u = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  return u || null
}

export function getProjectRefFromSupabaseUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname
    const m = host.match(/^([^.]+)\.supabase\.co$/i)
    return m?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

export function assertAllowedSupabaseProject(url: string): { ok: true } | { ok: false; reason: string } {
  if (!url.includes(PLAN_B_ALLOWED_PROJECT_REF)) {
    return {
      ok: false,
      reason: `SUPABASE_URL must reference project ${PLAN_B_ALLOWED_PROJECT_REF}`,
    }
  }
  const ref = getProjectRefFromSupabaseUrl(url)
  if (ref !== PLAN_B_ALLOWED_PROJECT_REF) {
    return { ok: false, reason: 'Could not parse project ref from SUPABASE_URL' }
  }
  return { ok: true }
}

export function getPostgresConnectionString(): string | null {
  const ordered = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_PRISMA_URL,
  ]
  for (const c of ordered) {
    const s = typeof c === 'string' ? c.trim() : ''
    if (s) return s
  }

  const host = process.env.POSTGRES_HOST?.trim()
  const user = process.env.POSTGRES_USER?.trim()
  const pass = process.env.POSTGRES_PASSWORD
  const db = process.env.POSTGRES_DATABASE?.trim()
  const port = process.env.POSTGRES_PORT?.trim() || '5432'
  if (host && user && db && pass !== undefined && pass !== '') {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${encodeURIComponent(db)}`
  }
  return null
}
