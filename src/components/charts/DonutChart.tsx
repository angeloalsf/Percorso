import { ChartLegend } from './ChartLegend'

export interface DonutSegment {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segments: DonutSegment[]
  size?: number
  /** Text shown in the middle of the donut. */
  centerLabel?: string
  centerSub?: string
  formatValue?: (value: number) => string
}

/** Dependency-free donut chart with a legend. */
export function DonutChart({ segments, size = 168, centerLabel, centerSub, formatValue }: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const radius = size / 2 - 10
  const stroke = 16
  const center = size / 2
  const circumference = 2 * Math.PI * radius

  let offset = 0
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const fraction = total > 0 ? s.value / total : 0
      const arc = { ...s, fraction, start: offset }
      offset += fraction
      return arc
    })

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} className="shrink-0">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={stroke}
            strokeDasharray={`${Math.max(arc.fraction * circumference - 2, 0.5)} ${circumference}`}
            strokeDashoffset={-arc.start * circumference}
            strokeLinecap="butt"
            transform={`rotate(-90 ${center} ${center})`}
          >
            <title>{`${arc.label}: ${formatValue ? formatValue(arc.value) : arc.value}`}</title>
          </circle>
        ))}
        {centerLabel && (
          <text
            x={center}
            y={centerSub ? center - 2 : center + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={15}
            fontWeight={650}
            fill="var(--foreground)"
          >
            {centerLabel}
          </text>
        )}
        {centerSub && (
          <text
            x={center}
            y={center + 15}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10.5}
            fill="var(--muted-foreground)"
          >
            {centerSub}
          </text>
        )}
      </svg>
      <div className="min-w-36 flex-1">
        <ChartLegend
          column
          items={segments.map((s) => ({
            label: s.label,
            color: s.color,
            value: formatValue ? formatValue(s.value) : String(s.value)
          }))}
        />
      </div>
    </div>
  )
}
