export type CallIntent =
  | 'estado_trabajo'
  | 'entrega'
  | 'precio'
  | 'cita'
  | 'nueva_orden'
  | 'hablar_con_humano'
  | 'reclamo'
  | 'spam'
  | 'unknown'

export type CallClassification =
  | 'trusted_customer'
  | 'lead'
  | 'existing_job'
  | 'spam'
  | 'invalid'
  | 'urgent'
  | 'transfer_candidate'

export type CallResult =
  | 'resolved'
  | 'appointment_created'
  | 'work_order_created'
  | 'transferred'
  | 'callback_requested'
  | 'spam_rejected'
  | 'follow_up_created'

export type StructuredExtraction = {
  customer_name?: string | null
  phone?: string | null
  intent?: CallIntent
  job_number?: string | null
  appointment_requested?: boolean
  appointment_date?: string | null
  appointment_time?: string | null
  work_order_requested?: boolean
  issue_description?: string | null
  price_requested?: boolean
  quoted_service?: string | null
  quoted_price?: number | null
  transfer_requested?: boolean
  urgent?: boolean
  callback_required?: boolean
  follow_up_required?: boolean
  follow_up_date?: string | null
  summary?: string | null
  next_action?: string | null
}

export type ValidationStatus = 'validated' | 'invalid' | 'spam_or_invalid' | 'pending'
