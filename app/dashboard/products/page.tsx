import {
  getDashboardDataClient,
  requireDashboardOrganizationId,
} from '@/lib/auth/dashboard-session'
import { ProductsPageClient } from '@/components/dashboard/products-page-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ProductsPage() {
  const orgId = await requireDashboardOrganizationId()
  const { db, applyOrgFilter } = await getDashboardDataClient(orgId)

  let listQ = db.from('products').select('*').order('created_at', { ascending: false })
  if (applyOrgFilter) listQ = listQ.eq('organization_id', orgId)
  const { data: products } = await listQ

  return <ProductsPageClient initialProducts={products || []} />
}
