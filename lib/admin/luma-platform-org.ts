import 'server-only'

import { DEMO_ORGANIZATION_ID } from '@/lib/auth/demo-bypass'

/**
 * Organization that receives inbound calls/leads for Luma (marketing / platform line),
 * separate from tenant clients. Defaults to demo SWATWORKS org if unset.
 */
export function getLumaPlatformOrganizationId(): string {
  const fromEnv = process.env.LUMA_PLATFORM_ORGANIZATION_ID?.trim()
  if (fromEnv && /^[0-9a-f-]{36}$/i.test(fromEnv)) return fromEnv
  return DEMO_ORGANIZATION_ID
}

export function isLumaPlatformOrganizationId(orgId: string | null | undefined): boolean {
  if (!orgId) return false
  return orgId === getLumaPlatformOrganizationId()
}
