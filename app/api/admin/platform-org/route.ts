import { NextResponse } from 'next/server'
import { getLumaPlatformOrganizationId } from '@/lib/admin/luma-platform-org'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function GET() {
  const id = getLumaPlatformOrganizationId()
  if (!id) {
    return NextResponse.json({
      configured: false,
      id: null,
      name: null,
      slug: null,
    })
  }
  const svc = createServiceRoleClient()
  const { data: org } = await svc.from('organizations').select('id, name, slug').eq('id', id).maybeSingle()
  return NextResponse.json({
    configured: true,
    id,
    name: org?.name ?? 'Luma',
    slug: org?.slug ?? null,
  })
}
