import { NextResponse } from 'next/server'
import { getDashboardOrganizationId } from '@/lib/auth/dashboard-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function POST(request: Request) {
  try {
    const organizationId = await getDashboardOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const question = typeof body.question === 'string' ? body.question.trim() : ''
    const answer = typeof body.answer === 'string' ? body.answer.trim() : ''
    const category =
      typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null
    const keywords = Array.isArray(body.keywords)
      ? body.keywords.filter((k: unknown) => typeof k === 'string' && k.trim()).map((k: string) => k.trim())
      : typeof body.keywords === 'string' && body.keywords.trim()
        ? body.keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
        : null

    if (!question || !answer) {
      return NextResponse.json({ error: 'question_and_answer_required' }, { status: 400 })
    }

    const svc = createServiceRoleClient()
    const { data, error } = await svc
      .from('faqs')
      .insert({
        organization_id: organizationId,
        question,
        answer,
        category,
        keywords: keywords?.length ? keywords : null,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('[api/dashboard/faqs/post]', error)
      return NextResponse.json({ error: error.message || 'insert_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data?.id })
  } catch (e) {
    console.error('[api/dashboard/faqs/post]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
