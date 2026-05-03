import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone } from '@/lib/phone'

type SearchTrabajoInput = {
  numero?: string | null
  telefono?: string | null
  organizationId?: string | null
}

export async function searchTrabajos(input: SearchTrabajoInput) {
  const supabase = createServiceRoleClient()
  const numero = (input.numero || '').trim()
  const telefono = normalizePhone(input.telefono || '')
  const organizationId = input.organizationId || null

  if (numero) {
    let q = supabase.from('trabajos').select('*').eq('numero_trabajo', numero).limit(2)
    if (organizationId) q = q.eq('organization_id', organizationId)
    const { data, error } = await q
    if (error) throw error
    return {
      mode: 'numero' as const,
      matches: data || [],
      ambiguous: false,
    }
  }

  if (!telefono) {
    return { mode: 'telefono' as const, matches: [], ambiguous: false }
  }

  let q = supabase
    .from('trabajos')
    .select('*')
    .eq('telefono', telefono)
    .order('ultimo_update', { ascending: false })
    .limit(5)
  if (organizationId) q = q.eq('organization_id', organizationId)
  const { data, error } = await q
  if (error) throw error

  const matches = data || []
  return {
    mode: 'telefono' as const,
    matches,
    ambiguous: matches.length > 1,
  }
}

type CreateRecadoInput = {
  organizationId?: string | null
  nombre?: string | null
  telefono: string
  empresa?: string | null
  destinatario?: string | null
  sector?: string | null
  mensaje: string
  urgencia?: 'baja' | 'normal' | 'alta'
  estado_recado?: 'nuevo' | 'en_proceso' | 'resuelto'
  origen_llamada?: string | null
  audio_url?: string | null
  callback_required?: boolean
}

export async function createRecado(input: CreateRecadoInput) {
  const supabase = createServiceRoleClient()
  const normalizedPhone = normalizePhone(input.telefono)
  if (!normalizedPhone) {
    throw new Error('Telefono invalido')
  }

  const payload = {
    organization_id: input.organizationId || null,
    nombre: input.nombre || null,
    telefono: normalizedPhone,
    empresa: input.empresa || null,
    destinatario: input.destinatario || null,
    sector: input.sector || null,
    mensaje: input.mensaje,
    urgencia: input.urgencia || 'normal',
    estado_recado: input.estado_recado || 'nuevo',
    origen_llamada: input.origen_llamada || 'twilio',
    audio_url: input.audio_url || null,
    callback_required: input.callback_required === true,
  }

  const { data, error } = await supabase.from('recados').insert(payload).select('*').single()
  if (error) throw error
  return data
}

type CreateLlamadaInput = {
  organizationId?: string | null
  fecha_hora_inicio?: string | null
  telefono_entrante: string
  nombre_detectado?: string | null
  motivo?: string | null
  resultado?: string | null
  trabajo_encontrado?: boolean
  recado_generado?: boolean
  transferido_a?: string | null
  duracion?: number | null
  transcripcion?: string | null
  vapi_call_id?: string | null
}

export async function createLlamada(input: CreateLlamadaInput) {
  const supabase = createServiceRoleClient()
  const phone = normalizePhone(input.telefono_entrante)
  if (!phone) throw new Error('Telefono invalido')

  const startedAt = input.fecha_hora_inicio ? new Date(input.fecha_hora_inicio) : new Date()
  const row = {
    organization_id: input.organizationId || null,
    phone_number: phone,
    telefono_entrante: phone,
    nombre_detectado: input.nombre_detectado || null,
    motivo: input.motivo || null,
    resultado: input.resultado || null,
    trabajo_encontrado: input.trabajo_encontrado ?? false,
    recado_generado: input.recado_generado ?? false,
    transferido_a: input.transferido_a || null,
    duration_seconds: Math.max(0, Number(input.duracion || 0)),
    transcripcion: input.transcripcion || null,
    transcript: input.transcripcion || null,
    started_at: startedAt.toISOString(),
    ended_at:
      typeof input.duracion === 'number' && input.duracion > 0
        ? new Date(startedAt.getTime() + input.duracion * 1000).toISOString()
        : null,
    status: 'completed',
    direction: 'inbound',
    vapi_call_id: input.vapi_call_id || null,
    metadata: {
      mvp: true,
      motivo: input.motivo || null,
      resultado: input.resultado || null,
    },
  }

  const { data, error } = await supabase.from('calls').insert(row).select('*').single()
  if (error) throw error
  return data
}
