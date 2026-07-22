import { cn } from '@/lib/utils'

/** Shared palette offered wherever the user picks an entity color. */
export const PALETTE = [
  '#2dd4a7',
  '#34d399',
  '#60a5fa',
  '#7c9cff',
  '#a78bfa',
  '#f472b6',
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#a3e635'
]

interface ColorSwatchesProps {
  value: string
  onChange: (color: string) => void
}

export function ColorSwatches({ value, onChange }: ColorSwatchesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            'size-7 rounded-full transition-transform outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            color === value ? 'scale-110 ring-2 ring-foreground/70 ring-offset-2 ring-offset-card' : 'hover:scale-105'
          )}
          style={{ background: color }}
          aria-label={color}
          aria-pressed={color === value}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  )
}
