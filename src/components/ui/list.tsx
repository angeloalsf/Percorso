import { ChevronRight } from 'lucide-react'
import { Badge } from './badge'
import { ProgressBar } from './progress-bar'
import { cn } from '@/lib/utils'

/** Card-style list; rows divide with hairlines. Single column, mobile-first. */
export function List({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('overflow-hidden rounded-lg border bg-card shadow-xs', className)} {...props} />
}

export function ListRow({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-3 border-b p-3 last:border-b-0', className)} {...props} />
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('size-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />
}

interface DrillRowProps {
  color?: string
  name: string
  primary: string
  /** Extra classes on the primary line (e.g. `text-destructive` for a negative balance). */
  primaryClassName?: string
  secondary?: string
  archived?: boolean
  archivedLabel?: string
  /** Shown inline with the name (e.g. an account type, or "contemplado"). */
  badge?: string
  /** Shown right before the chevron (e.g. a linked-product count). */
  trailingBadge?: React.ReactNode
  progress?: { value: number; max: number }
  onClick: () => void
  /** Side actions (archive/edit/delete, …) rendered next to — not inside — the tappable row, so they don't trigger `onClick`. */
  actions?: React.ReactNode
}

/** One tappable row that drills down a level, with optional side actions. */
export function DrillRow({
  color,
  name,
  primary,
  primaryClassName,
  secondary,
  archived,
  archivedLabel,
  badge,
  trailingBadge,
  progress,
  onClick,
  actions
}: DrillRowProps) {
  return (
    <ListRow className={cn('p-0', archived && 'opacity-55')}>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/60"
        onClick={onClick}
      >
        {color && <ColorDot color={color} />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium">{name}</span>
            {badge && <Badge>{badge}</Badge>}
            {archived && archivedLabel && <Badge>{archivedLabel}</Badge>}
          </span>
          <span className={cn('tabular mt-0.5 block text-sm font-semibold', primaryClassName)}>
            {primary}
            {secondary && <span className="text-xs font-normal text-muted-foreground"> {secondary}</span>}
          </span>
          {progress && <ProgressBar className="mt-2 max-w-sm" value={progress.value} max={progress.max} />}
        </span>
        {trailingBadge}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {actions && <div className="flex shrink-0 items-center pr-1.5">{actions}</div>}
    </ListRow>
  )
}
