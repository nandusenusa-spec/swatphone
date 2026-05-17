import 'server-only'

/**
 * Organization that receives inbound calls/leads for the Luma product line (marketing number).
 * Must NOT default to SWATWORKS or demo tenant — those are regular clients.
 *
 * Set LUMA_PLATFORM_ORGANIZATION_ID in Vercel when you have a dedicated Luma org in Supabase.
 */
export function getLumaPlatformOrganizationId(): string | null {
  const fromEnv = process.env.LUMA_PLATFORM_ORGANIZATION_ID?.trim()
  if (fromEnv && /^[0-9a-f-]{36}$/i.test(fromEnv)) return fromEnv
  return null
}

export function hasLumaPlatformOrganization(): boolean {
  return getLumaPlatformOrganizationId() !== null
}

export function isLumaPlatformOrganizationId(orgId: string | null | undefined): boolean {
  const platformId = getLumaPlatformOrganizationId()
  if (!platformId || !orgId) return false
  return orgId === platformId
}
