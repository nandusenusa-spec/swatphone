import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRecado } from '@/lib/mvp/repository'

const RecadoSchema = z.object({
  organization_id: z.string().uuid().optional().nullable(),
  nombre: z.string().min(1).optional().nullable(),
  telefono: z.string().min(6),
  empresa: z.string().optional().nullable(),
  destinatario: z.string().optional().nullable(),
  sector: z.string().optional().nullable(),
  mensaje: z.string().min(3),
  urgencia: z.enum(['baja', 'normal', 'alta']).optional(),
  estado_recado: z.enum(['nuevo', 'en_proceso', 'resuelto']).optional(),
  origen_llamada: z.string().optional().nullable(),
  audio_url: z.string().url().optional().nullable(),
  callback_required: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const parsed = RecadoSchema.parse(await request.json())
    const row = await createRecado({
      organizationId: parsed.organization_id,
      nombre: parsed.nombre,
      telefono: parsed.telefono,
      empresa: parsed.empresa,
      destinatario: parsed.destinatario,
      sector: parsed.sector,
      mensaje: parsed.mensaje,
      urgencia: parsed.urgencia,
      estado_recado: parsed.estado_recado,
      origen_llamada: parsed.origen_llamada,
      audio_url: parsed.audio_url,
      callback_required: parsed.callback_required,
    })
    return NextResponse.json({ ok: true, recado: row }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[recados] failed', error)
    return NextResponse.json({ error: 'failed to create recado' }, { status: 500 })
  }
}
