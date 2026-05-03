'use client'

import { cn } from '@/lib/utils'

interface Lead {
  status: string
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  new: { label: 'Nuevos', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  contacted: { label: 'Contactados', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  qualified: { label: 'Calificados', color: 'text-green-700', bgColor: 'bg-green-100' },
  unqualified: { label: 'No Calificados', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  converted: { label: 'Convertidos', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  lost: { label: 'Perdidos', color: 'text-red-700', bgColor: 'bg-red-100' },
}

export function LeadsPipeline({ leads }: { leads: Lead[] }) {
  // Count leads by status
  const statusCounts = leads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const total = leads.length || 1 // Prevent division by zero

  const pipelineData = Object.entries(statusConfig).map(([status, config]) => ({
    status,
    ...config,
    count: statusCounts[status] || 0,
    percentage: Math.round(((statusCounts[status] || 0) / total) * 100),
  }))

  if (leads.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No hay leads aun
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {pipelineData.map((item) => (
        <div key={item.status} className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className={cn('font-medium', item.color)}>{item.label}</span>
            <span className="text-muted-foreground">
              {item.count} ({item.percentage}%)
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', item.bgColor)}
              style={{ width: `${item.percentage}%` }}
            />
          </div>
        </div>
      ))}

      {/* Summary */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm font-medium">Total Leads</span>
        <span className="text-lg font-bold">{leads.length}</span>
      </div>
    </div>
  )
}
