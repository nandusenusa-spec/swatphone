import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Persiste el POST entrante de Vapi antes del resto del handler (Plan B).
 * No lanza: errores se registran en consola y el handler sigue.
 */
export async function insertVapiCallEventRaw(input: {
  organizationId: string | null
  vapiCallId: string | null
  messageType: string | null
  eventType: string | null
  payload: Record<string, unknown>
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('vapi_call_events_raw')
      .insert({
        organization_id: input.organizationId,
        vapi_call_id: input.vapiCallId,
        message_type: input.messageType,
        event_type: input.eventType,
        payload: input.payload as Record<string, unknown>,
      })
      .select('id')
      .single()

    if (error) {
      const msg = `${error.code ?? ''} ${error.message}`.trim()
      return { id: null, error: msg || 'insert_failed' }
    }
    const id = data && typeof data === 'object' && 'id' in data ? String((data as { id: string }).id) : null
    return { id, error: null }
  } catch (e) {
    return {
      id: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
