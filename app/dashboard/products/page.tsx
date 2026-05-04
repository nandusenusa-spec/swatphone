import {
  getDashboardDataClient,
  requireDashboardOrganizationId,
} from '@/lib/auth/dashboard-session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProductsTable } from '@/components/dashboard/products-table'
import { AddProductDialog } from '@/components/dashboard/add-product-dialog'
import { Package, DollarSign, Tag, ToggleLeft } from 'lucide-react'

export default async function ProductsPage() {
  const orgId = await requireDashboardOrganizationId()
  const { db, applyOrgFilter } = await getDashboardDataClient(orgId)

  let listQ = db.from('products').select('*').order('created_at', { ascending: false })
  if (applyOrgFilter) listQ = listQ.eq('organization_id', orgId)
  const { data: products } = await listQ

  let countAllQ = db.from('products').select('*', { count: 'exact', head: true })
  if (applyOrgFilter) countAllQ = countAllQ.eq('organization_id', orgId)
  const { count: totalProducts } = await countAllQ

  let countActiveQ = db
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  if (applyOrgFilter) countActiveQ = countActiveQ.eq('organization_id', orgId)
  const { count: activeProducts } = await countActiveQ

  let priceQ = db.from('products').select('price').not('price', 'is', null)
  if (applyOrgFilter) priceQ = priceQ.eq('organization_id', orgId)
  const { data: priceData } = await priceQ

  const avgPrice =
    priceData && priceData.length > 0
      ? Math.round(priceData.reduce((acc, p) => acc + (p.price || 0), 0) / priceData.length)
      : 0

  const stats = [
    { title: 'Total Productos', value: totalProducts || 0, icon: Package },
    { title: 'Activos', value: activeProducts || 0, icon: ToggleLeft },
    { title: 'Precio Promedio', value: `$${avgPrice}`, icon: DollarSign },
    { title: 'Categorias', value: 3, icon: Tag },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Productos y Servicios</h1>
          <p className="text-muted-foreground">
            Gestiona los productos que el asistente puede cotizar
          </p>
        </div>
        <AddProductDialog />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Products table */}
      <Card>
        <CardHeader>
          <CardTitle>Catalogo de Productos</CardTitle>
          <CardDescription>
            El asistente usara esta informacion para dar precios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductsTable products={products || []} />
        </CardContent>
      </Card>
    </div>
  )
}
