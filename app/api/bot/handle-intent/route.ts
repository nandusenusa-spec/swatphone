import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { detectIntent } from '@/lib/mvp/intents'

const IntentSchema = z.object({
  text: z.string().default(''),
  attempts: z.number().int().nonnegative().default(0),
})

export async function POST(request: NextRequest) {
  try {
    const parsed = IntentSchema.parse(await request.json())
    const result = detectIntent(parsed.text, parsed.attempts)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid payload', details: error.flatten() }, { status: 400 })
    }
    console.error('[bot/handle-intent] failed', error)
    return NextResponse.json({ error: 'intent resolution failed' }, { status: 500 })
  }
}
