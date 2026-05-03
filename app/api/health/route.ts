import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'swat-voiceia-mvp',
    timestamp: new Date().toISOString(),
  })
}
