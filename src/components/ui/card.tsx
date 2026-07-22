import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-lg border bg-card p-4 text-card-foreground shadow-xs', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('mb-3 flex items-center gap-1.5 text-sm font-semibold [&_svg]:size-3.5 [&_svg]:text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardTitleSub({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('ml-auto text-xs font-normal text-muted-foreground', className)} {...props} />
}

export { Card, CardTitle, CardTitleSub }
