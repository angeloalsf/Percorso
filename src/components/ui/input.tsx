import { cn } from '@/lib/utils'

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors outline-none',
        'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // No dark-mode invert here: `color-scheme` (src/index.css) already makes
        // the browser draw this indicator light on dark, so inverting it would
        // paint it dark-on-dark again.
        '[&::-webkit-calendar-picker-indicator]:opacity-60',
        className
      )}
      {...props}
    />
  )
}

export { Input }
