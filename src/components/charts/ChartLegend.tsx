import { cn } from '@/lib/utils'

export interface LegendItem {
  label: string
  color: string
  value?: string
}

interface ChartLegendProps {
  items: LegendItem[]
  column?: boolean
}

export function ChartLegend({ items, column }: ChartLegendProps) {
  return (
    <div className={cn('flex gap-x-4 gap-y-1.5 text-xs', column ? 'flex-col' : 'flex-wrap items-center')}>
      {items.map((item, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="truncate">{item.label}</span>
          {item.value !== undefined && <span className="tabular ml-auto pl-2 text-muted-foreground">{item.value}</span>}
        </span>
      ))}
    </div>
  )
}
