/**
 * Log unificado para confirmar en Vercel que Vapi invocó una tool (no solo texto del modelo).
 */
export function logVapiToolCallReceived(input: {
  requestUrl: string | null | undefined
  toolCallId: string
  toolName: string
  argKeys: string[]
  /** p.ej. 'dispatcher' | 'webhook' | 'get-job-status' */
  source?: string
}) {
  console.info('[vapi/tool-call] received', {
    requestUrl: input.requestUrl ?? null,
    toolCallId: input.toolCallId || null,
    toolName: input.toolName || null,
    argKeys: input.argKeys.slice(0, 32),
    source: input.source ?? null,
  })
}
