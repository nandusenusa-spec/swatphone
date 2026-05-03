import { z } from 'zod'

export const VapiEventInputSchema = z
  .object({
    type: z.string(),
    organization_id: z.string().uuid().optional(),
    call: z.record(z.string(), z.unknown()).optional(),
    message: z.record(z.string(), z.unknown()).optional(),
    transcript: z.string().optional(),
    summary: z.string().optional(),
    disposition: z.string().optional(),
    intent: z.string().optional(),
    structured_extraction: z.record(z.string(), z.unknown()).optional(),
    toolCallList: z.array(z.record(z.string(), z.unknown())).optional(),
    toolCalls: z.array(z.record(z.string(), z.unknown())).optional(),
    attempts: z.number().int().nonnegative().optional(),
    job_number: z.string().optional(),
    order_number: z.string().optional(),
    status: z.string().optional(),
    endedReason: z.string().optional(),
    destination: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

export type VapiEventInput = z.infer<typeof VapiEventInputSchema>
