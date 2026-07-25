import { cn } from '@/lib/utils'

interface LegendItem {
  label: string
  color: string
  value?: string
}

interface ChartLegendProps {
  items: LegendItem[]
  column?: boolean
  /** When set, each item becomes a button that reports its index. */
  onItemClick?: (index: number) => void
}

export function ChartLegend({ items, column, onItemClick }: ChartLegendProps) {
  return (
    <div className={cn('flex gap-x-4 gap-y-1.5 text-xs', column ? 'flex-col' : 'flex-wrap items-center')}>
      {items.map((item, i) => {
        const content = (
          <>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
            <span className="truncate">{item.label}</span>
            {item.value !== undefined && (
              <span className="tabular ml-auto pl-2 text-muted-foreground">{item.value}</span>
            )}
          </>
        )
        return onItemClick ? (
          <button
            key={i}
            type="button"
            onClick={() => onItemClick(i)}
            className="flex min-w-0 items-center gap-1.5 rounded-sm text-left transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            {content}
          </button>
        ) : (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {content}
          </span>
        )
      })}
    </div>
  )
}
