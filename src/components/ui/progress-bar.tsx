import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  max: number
  color?: string
  /** Turn the bar red once value exceeds max. */
  warnOverflow?: boolean
  className?: string
}

export function ProgressBar({ value, max, color, warnOverflow, className }: ProgressBarProps) {
  const over = warnOverflow && max > 0 && value > max
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: over ? 'var(--destructive)' : (color ?? 'var(--primary)') }}
      />
    </div>
  )
}
