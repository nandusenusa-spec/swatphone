import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProductsTable } from '@/components/dashboard/products-table'
import { AddProductDialog } from '@/components/dashboard/add-product-dialog'
import { Package, DollarSign, Tag, ToggleLeft } from 'lucide-react'

export default async function ProductsPage() {
  const supabase = await createClient()
  
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })
  
  // Stats
  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
  
  const { count: activeProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  
  const { data: priceData } = await supabase
    .from('products')
    .select('price')
    .not('price', 'is', null)
  
  const avgPrice = priceData && priceData.length > 0
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
