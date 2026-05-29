import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeClientWelcomeMessage } from '@/lib/vapi/client-speech-prompt'

export type ClientSpeechSettings = {
  welcomeMessage: string
  clientSpeechNotes: string
  organizationName: string
}

export async function loadClientSpeechSettings(
  service: SupabaseClient,
  organizationId: string,
): Promise<ClientSpeechSettings> {
  const [{ data: org }, { data: ai }, { data: cfg }] = await Promise.all([
    service.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
    service.from('organization_ai_config').select('welcome_message, client_speech_notes').eq('organization_id', organizationId).maybeSingle(),
    service
      .from('assistant_configs')
      .select('first_message, greeting_message')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const fromAi = typeof ai?.welcome_message === 'string' ? ai.welcome_message.trim() : ''
  const fromCfg =
    (typeof cfg?.first_message === 'string' ? cfg.first_message.trim() : '') ||
    (typeof (cfg as { greeting_message?: string } | null)?.greeting_message === 'string'
      ? String((cfg as { greeting_message?: string }).greeting_message).trim()
      : '')

  return {
    organizationName: typeof org?.name === 'string' ? org.name : 'tu negocio',
    welcomeMessage: normalizeClientWelcomeMessage(fromAi || fromCfg || ''),
    clientSpeechNotes:
      typeof ai?.client_speech_notes === 'string' ? ai.client_speech_notes.trim().slice(0, 1200) : '',
  }
}

export async function saveClientSpeechSettings(
  service: SupabaseClient,
  organizationId: string,
  input: { welcomeMessage: string; clientSpeechNotes?: string },
): Promise<{ welcomeMessage: string }> {
  const welcomeMessage = normalizeClientWelcomeMessage(input.welcomeMessage)
  if (!welcomeMessage) {
    throw new Error('welcome_message_required')
  }

  const clientSpeechNotes = (input.clientSpeechNotes || '').trim().slice(0, 1200)

  const aiPatch: Record<string, unknown> = {
    organization_id: organizationId,
    welcome_message: welcomeMessage,
    updated_at: new Date().toISOString(),
  }
  if (clientSpeechNotes) {
    aiPatch.client_speech_notes = clientSpeechNotes
  } else {
    aiPatch.client_speech_notes = null
  }

  let { error: aiErr } = await service.from('organization_ai_config').upsert(aiPatch, {
    onConflict: 'organization_id',
  })

  if (aiErr && /client_speech_notes/i.test(aiErr.message || '')) {
    const { client_speech_notes: _drop, ...withoutNotes } = aiPatch
    ;({ error: aiErr } = await service.from('organization_ai_config').upsert(withoutNotes, {
      onConflict: 'organization_id',
    }))
  }
  if (aiErr) throw aiErr

  console.info('[client-speech/saved]', {
    organization_id: organizationId,
    welcome_preview: welcomeMessage.slice(0, 80),
    has_speech_notes: Boolean(clientSpeechNotes),
  })

  const cfgPatch = {
    first_message: welcomeMessage,
    greeting_message: welcomeMessage,
    updated_at: new Date().toISOString(),
  }

  const { data: activeCfg } = await service
    .from('assistant_configs')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeCfg?.id) {
    const { error: cfgErr } = await service
      .from('assistant_configs')
      .update(cfgPatch)
      .eq('id', activeCfg.id)
    if (cfgErr) throw cfgErr
  } else {
    const { error: insErr } = await service.from('assistant_configs').insert({
      organization_id: organizationId,
      is_active: true,
      name: 'Virtual Assistant',
      system_prompt: 'Eres un asistente de atencion telefonica empresarial.',
      language: 'es',
      ...cfgPatch,
    })
    if (insErr) throw insErr
  }

  return { welcomeMessage }
}
