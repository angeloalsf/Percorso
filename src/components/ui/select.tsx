import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A styled NATIVE select. On phones the OS picker is a far better input
 * than any custom dropdown, so Percorso deliberately skips the Radix
 * select in favor of the platform one.
 */
function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <span className={cn('relative inline-flex w-full', className)}>
      <select
        className={cn(
          'h-10 w-full appearance-none rounded-md border border-input bg-transparent py-2 pr-8 pl-3 text-sm shadow-xs transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          '[&>option]:bg-popover [&>option]:text-popover-foreground'
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  )
}

export { Select }
