'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { EditProductDialog } from './edit-product-dialog'
import { Trash2 } from 'lucide-react'
import type { Product } from '@/components/dashboard/products-page-client'

const priceTypeLabels: Record<string, string> = {
  fixed: 'Precio Fijo',
  hourly: 'Por Hora',
  quote: 'Cotizacion',
  range: 'Rango',
}

interface Props {
  products: Product[]
  onToggled?: (id: string, isActive: boolean) => void
  onDeleted?: (id: string) => void
  onUpdated?: (product: Product) => void
}

export function ProductsTable({ products, onToggled, onDeleted, onUpdated }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await supabase
      .from('products')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (onToggled) {
      onToggled(id, isActive)
    } else {
      router.refresh()
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Estas seguro de eliminar este producto?')) {
      await supabase.from('products').delete().eq('id', id)
      if (onDeleted) {
        onDeleted(id)
      } else {
        router.refresh()
      }
    }
  }

  const formatPrice = (product: Product) => {
    const currency = product.currency || 'USD'
    const symbol = currency === 'USD' ? '$' : currency

    switch (product.price_type) {
      case 'fixed':
        return `${symbol}${product.price?.toFixed(2) || '0.00'}`
      case 'hourly':
        return `${symbol}${product.price?.toFixed(2) || '0.00'}/hr`
      case 'range':
        return `${symbol}${product.price_min?.toFixed(2) || '0'} - ${symbol}${product.price_max?.toFixed(2) || '0'}`
      case 'quote':
        return 'A cotizar'
      default:
        return '-'
    }
  }

  if (products.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No hay productos registrados. Agrega tu primer producto.
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <Table className="min-w-[520px]">
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Precio</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            <TableCell>
              <div>
                <p className="font-medium">{product.name}</p>
                {product.description && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                    {product.description}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">
                {priceTypeLabels[product.price_type] || product.price_type}
              </Badge>
            </TableCell>
            <TableCell className="font-medium">{formatPrice(product)}</TableCell>
            <TableCell>
              <Switch
                checked={product.is_active}
                onCheckedChange={(checked) => handleToggleActive(product.id, checked)}
              />
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <EditProductDialog product={product} onUpdated={onUpdated} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => handleDelete(product.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  )
}
