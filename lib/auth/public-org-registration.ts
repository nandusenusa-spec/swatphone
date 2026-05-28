export function isPublicOrgRegistrationEnabled(): boolean {
  const v = process.env.ENABLE_PUBLIC_ORG_REGISTRATION?.trim().toLowerCase()
  if (v === 'false' || v === '0' || v === 'no') return false
  return true
}

export function isPublicOrgRegistrationEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_ENABLE_PUBLIC_ORG_REGISTRATION?.trim().toLowerCase()
  if (v === 'false' || v === '0' || v === 'no') return false
  if (v === 'true' || v === '1' || v === 'yes') return true
  return isPublicOrgRegistrationEnabled()
}
