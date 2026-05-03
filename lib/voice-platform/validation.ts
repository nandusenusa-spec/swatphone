import { z } from 'zod'

export const ToolBaseSchema = z.object({
  organization_id: z.string().uuid(),
})

export const FindCustomerSchema = ToolBaseSchema.extend({
  phone: z.string().min(6),
  name: z.string().optional(),
})

export const GetJobStatusSchema = ToolBaseSchema.extend({
  job_number: z.string().optional(),
  phone: z.string().optional(),
})

export const CreateAppointmentSchema = ToolBaseSchema.extend({
  phone: z.string().min(6),
  customer_name: z.string().optional(),
  appointment_at: z.string().datetime(),
  notes: z.string().optional(),
})

export const CreateWorkOrderSchema = ToolBaseSchema.extend({
  phone: z.string().min(6),
  customer_name: z.string().optional(),
  title: z.string().min(3),
  issue_description: z.string().optional(),
})

export const GetPriceQuoteSchema = ToolBaseSchema.extend({
  service_name: z.string().min(2),
})

export const TransferToRamonSchema = ToolBaseSchema.extend({
  call_log_id: z.string().uuid(),
  reason: z.string().min(3),
  urgent: z.boolean().optional(),
})

export const SaveCallOutcomeSchema = ToolBaseSchema.extend({
  call_log_id: z.string().uuid().optional(),
  vapi_call_id: z.string().optional(),
  phone: z.string().min(6),
  intent: z.string().optional(),
  call_type: z.string().optional(),
  validation_status: z.enum(['validated', 'invalid', 'spam_or_invalid', 'pending']).optional(),
  transcript: z.string().optional(),
  summary: z.string().optional(),
  result: z.string().optional(),
  owner: z.string().optional(),
  follow_up_date: z.string().datetime().optional(),
  transfer_requested: z.boolean().optional(),
  transfer_completed: z.boolean().optional(),
  spam_score: z.number().int().min(0).max(100).optional(),
  next_action: z.string().optional(),
  /** Si true, se crea seguimiento al cerrar (o el modelo debe usar create_follow_up). */
  callback_required: z.boolean().optional(),
  structured_extraction: z.record(z.string(), z.unknown()).optional(),
})

export const MarkSpamCallSchema = ToolBaseSchema.extend({
  call_log_id: z.string().uuid().optional(),
  vapi_call_id: z.string().optional(),
  phone: z.string().min(6),
  reason: z.string().optional(),
  spam_score: z.number().int().min(0).max(100).default(90),
})

export const CreateFollowUpSchema = ToolBaseSchema.extend({
  call_log_id: z.string().uuid().optional(),
  phone: z.string().min(6).optional(),
  customer_id: z.string().uuid().optional(),
  title: z.string().min(3),
  notes: z.string().optional(),
  owner: z.string().optional(),
  due_at: z.string().datetime().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  callback_required: z.boolean().default(false),
})

export const VapiEventSchema = z.object({
  type: z.string(),
  organization_id: z.string().uuid().optional(),
  call: z.record(z.string(), z.unknown()).optional(),
  message: z.record(z.string(), z.unknown()).optional(),
  transcript: z.string().optional(),
  summary: z.string().optional(),
  toolCallList: z.array(z.record(z.string(), z.unknown())).optional(),
  toolCalls: z.array(z.record(z.string(), z.unknown())).optional(),
  disposition: z.string().optional(),
})
