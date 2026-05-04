/**
 * TEMP DEMO ONLY — disable after presentation.
 *
 * When DEMO_BYPASS_AUTH=true, dashboard routes skip Supabase Auth; data uses a fixed
 * organization_id. Does not create users or touch Supabase Auth.
 */

export const DEMO_ORGANIZATION_ID = '9bb50e58-9ba6-4d54-8171-13922749f570'

let demoBypassNoticeLogged = false

export function isDemoBypassAuth(): boolean {
  return process.env.DEMO_BYPASS_AUTH === 'true'
}

/** Logs once per runtime instance (best-effort in serverless). */
export function logDemoBypassNotice(): void {
  if (!isDemoBypassAuth() || demoBypassNoticeLogged) return
  demoBypassNoticeLogged = true
  console.log(
    `[auth/demo-bypass] enabled organization_id=${DEMO_ORGANIZATION_ID}`,
  )
}
