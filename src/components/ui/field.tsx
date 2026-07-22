import { cn } from '@/lib/utils'
import { Label } from './label'

interface FieldProps {
  label: string
  error?: string
  /** Span both columns of the form grid. */
  span2?: boolean
  children: React.ReactNode
}

/** Label + control + inline error, matching the form grid in dialogs. */
export function Field({ label, error, span2, children }: FieldProps) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', span2 && 'sm:col-span-2')}>
      <Label asChild>
        <span>{label}</span>
      </Label>
      {children}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </label>
  )
}

/** Single column on phones, two from `sm:` up. */
export function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">{children}</div>
}
