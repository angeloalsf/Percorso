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
