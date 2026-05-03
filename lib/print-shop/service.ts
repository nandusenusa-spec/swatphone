import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'

export type PrintClientRow = {
  id: string
  organization_id: string | null
  name: string
  phone: string
  company: string | null
  created_at: string
}

export type PrintJobRow = {
  id: string
  client_id: string
  title: string
  description: string | null
  requirements: string | null
  status: string
  estimated_ready_at: string | null
  pickup_instructions: string | null
  customer_message: string | null
  internal_notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const JOB_STATUSES = [
  'received',
  'in_progress',
  'waiting_for_approval',
  'ready_for_pickup',
  'completed',
  'cancelled',
] as const

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  return code === 'PGRST205'
}

export function isValidJobStatus(s: string): s is (typeof JOB_STATUSES)[number] {
  return (JOB_STATUSES as readonly string[]).includes(s)
}

export async function findClientByNormalizedPhone(
  supabase: SupabaseClient,
  phoneNormalized: string,
  organizationId?: string | null,
): Promise<PrintClientRow | null> {
  if (!phoneNormalized) return null

  let q = supabase.from('clients').select('*').eq('phone', phoneNormalized)
  if (organizationId) {
    q = q.eq('organization_id', organizationId)
  }
  const { data, error } = await q.maybeSingle()
  if (error) {
    // Some environments might not have print-shop tables yet.
    // Degrade gracefully so voice flow can continue.
    if (isMissingTableError(error)) return null
    throw error
  }
  return data as PrintClientRow | null
}

export async function getLatestActiveJobForClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<PrintJobRow | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  return data as PrintJobRow | null
}

export function clientLookupResponse(
  found: boolean,
  client: PrintClientRow | null,
) {
  if (!found || !client) {
    return { found: false as const }
  }
  return {
    found: true as const,
    client: {
      id: client.id,
      name: client.name,
      phone: client.phone,
      company: client.company,
    },
  }
}

export function formatEstimatedReadyAt(iso: string | null, locale = 'es'): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

const STATUS_LABELS_ES: Record<string, string> = {
  received: 'recibido',
  in_progress: 'en progreso',
  waiting_for_approval: 'esperando aprobación',
  ready_for_pickup: 'listo para recoger',
  completed: 'completado',
  cancelled: 'cancelado',
}

export function jobStatusLabel(status: string): string {
  return STATUS_LABELS_ES[status] || status.replace(/_/g, ' ')
}

export function buildDefaultCustomerJobMessage(job: PrintJobRow): string {
  const title = job.title || 'su pedido'
  const status = jobStatusLabel(job.status)
  const when = formatEstimatedReadyAt(job.estimated_ready_at)
  const whenPart = when ? `Estará lista el ${when}.` : ''
  const pickup = (job.pickup_instructions || '').trim()
  const pickupPart = pickup ? pickup : ''

  return [
    `Veo que tiene una orden de ${title}.`,
    `El estado actual es ${status}.`,
    whenPart,
    pickupPart,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function getClientStatusPayload(
  supabase: SupabaseClient,
  rawPhone: string,
  organizationId?: string | null,
) {
  const phone = normalizePhone(rawPhone)
  if (!phone) {
    return { found: false as const }
  }

  const client = await findClientByNormalizedPhone(supabase, phone, organizationId)
  if (!client) {
    return { found: false as const }
  }

  const job = await getLatestActiveJobForClient(supabase, client.id)

  return {
    found: true as const,
    client: { name: client.name, phone: client.phone },
    job: job
      ? {
          title: job.title,
          status: job.status,
          estimated_ready_at: job.estimated_ready_at,
          pickup_instructions: job.pickup_instructions,
          customer_message: job.customer_message,
        }
      : null,
  }
}

export function spokenJobLineFromStatusPayload(
  job: NonNullable<Awaited<ReturnType<typeof getClientStatusPayload>>['job']>,
): string {
  if (job.customer_message?.trim()) {
    return job.customer_message.trim()
  }
  const pseudoRow: PrintJobRow = {
    id: '',
    client_id: '',
    title: job.title,
    description: null,
    requirements: null,
    status: job.status,
    estimated_ready_at: job.estimated_ready_at,
    pickup_instructions: job.pickup_instructions,
    customer_message: job.customer_message,
    internal_notes: null,
    is_active: true,
    created_at: '',
    updated_at: '',
  }
  return buildDefaultCustomerJobMessage(pseudoRow)
}
