import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLlamada } from '@/lib/mvp/repository'
import { isValidInternalApiKey } from '@/lib/security/internal-api-key'

const LlamadaSchema = z.object({
  organization_id: z.string().uuid().optional().nullable(),
  fecha_hora_inicio: z.string().datetime().optional().nullable(),
  telefono_entrante: z.string().min(6),
  nombre_detectado: z.string().optional().nullable(),
  motivo: z.string().optional().nullable(),
  resultado: z.string().optional().nullable(),
  trabajo_encontrado: z.boolean().optional(),
  recado_generado: z.boolean().optional(),
  transferido_a: z.string().optional().nullable(),
  duracion: z.number().int().nonnegative().optional().nullable(),
  transcripcion: z.string().optional().nullable(),
  vapi_call_id: z.string().optional().nullable(),
})

export async function POST(request: NextRequest) {
  if (!isValidInternalApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const parsed = LlamadaSchema.parse(await request.json())
    const row = await createLlamada({
      organizationId: parsed.organization_id,
      fecha_hora_inicio: parsed.fecha_hora_inicio,
      telefono_entrante: parsed.telefono_entrante,
      nombre_detectado: parsed.nombre_detectado,
      motivo: parsed.motivo,
      resultado: parsed.resultado,
      trabajo_encontrado: parsed.trabajo_encontrado,
      recado_generado: parsed.recado_generado,
      transferido_a: parsed.transferido_a,
      duracion: parsed.duracion,
      transcripcion: parsed.transcripcion,
      vapi_call_id: parsed.vapi_call_id,
    })
    return NextResponse.json({ ok: true, llamada: row }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[llamadas] failed', error)
    return NextResponse.json({ error: 'failed to create llamada' }, { status: 500 })
  }
}
