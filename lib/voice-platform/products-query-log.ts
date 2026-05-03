import type { PostgrestError } from '@supabase/supabase-js'

export type ProductsQueryLogInput = {
  stage: string
  status?: number
  code?: string
  message?: string
  details?: string
  hint?: string
  filtersUsed: Record<string, unknown>
  inputName?: string | null
  normalizedName?: string | null
  organization_id: string
}

/** Log completo cuando PostgREST devuelve error (p. ej. GET /products 400). */
export function logProductsPriceLookupError(input: ProductsQueryLogInput) {
  console.error('[vapi/products-query]', {
    stage: input.stage,
    status: input.status ?? null,
    code: input.code ?? null,
    message: input.message ?? null,
    details: input.details ?? null,
    hint: input.hint ?? null,
    filtersUsed: input.filtersUsed,
    inputName: input.inputName ?? null,
    normalizedName: input.normalizedName ?? null,
    organization_id: input.organization_id,
  })
}

export function fieldsFromPostgrestError(err: PostgrestError | null): Pick<
  ProductsQueryLogInput,
  'status' | 'code' | 'message' | 'details' | 'hint'
> {
  if (!err) {
    return { status: undefined, code: undefined, message: undefined, details: undefined, hint: undefined }
  }
  return {
    status: err.status,
    code: err.code,
    message: err.message,
    details: err.details ?? undefined,
    hint: err.hint ?? undefined,
  }
}
