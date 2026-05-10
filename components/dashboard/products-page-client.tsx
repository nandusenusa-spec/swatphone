'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProductsTable } from '@/components/dashboard/products-table'
import { AddProductDialog } from '@/components/dashboard/add-product-dialog'
import { ImportProductsDialog } from '@/components/dashboard/import-products-dialog'
import { Package, DollarSign, Tag, ToggleLeft } from 'lucide-react'

export interface Product {
  id: string
  name: string
  description: string | null
  price: number | null
  price_type: string
  price_min: number | null
  price_max: number | null
  currency: string
  is_active: boolean
}

export function ProductsPageClient({ initialProducts }: { initialProducts: Product[] }) {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>(initialProducts)

  function handleAdded(product: Product) {
    setProducts((prev) => [product, ...prev])
    router.refresh()
  }

  function handleUpdated(updated: Product) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  function handleToggled(id: string, isActive: boolean) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: isActive } : p)))
  }

  function handleDeleted(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }

  const activeProducts = products.filter((p) => p.is_active).length
  const priceItems = products.filter((p) => p.price != null)
  const avgPrice =
    priceItems.length > 0
      ? Math.round(priceItems.reduce((acc, p) => acc + (p.price || 0), 0) / priceItems.length)
      : 0

  const stats = [
    { title: 'Total Productos', value: products.length, icon: Package },
    { title: 'Activos', value: activeProducts, icon: ToggleLeft },
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
        <div className="flex items-center gap-2">
          <ImportProductsDialog onImported={() => router.refresh()} />
          <AddProductDialog onAdded={handleAdded} />
        </div>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Catalogo de Productos</CardTitle>
          <CardDescription>
            El asistente usara esta informacion para dar precios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductsTable
            products={products}
            onToggled={handleToggled}
            onDeleted={handleDeleted}
            onUpdated={handleUpdated}
          />
        </CardContent>
      </Card>
    </div>
  )
}
