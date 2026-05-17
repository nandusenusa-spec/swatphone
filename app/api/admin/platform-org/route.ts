import { NextResponse } from 'next/server'
import { getLumaPlatformOrganizationId } from '@/lib/admin/luma-platform-org'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function GET() {
  const id = getLumaPlatformOrganizationId()
  const svc = createServiceRoleClient()
  const { data: org } = await svc.from('organizations').select('id, name, slug').eq('id', id).maybeSingle()
  return NextResponse.json({
    id,
    name: org?.name ?? 'Luma',
    slug: org?.slug ?? null,
  })
}
