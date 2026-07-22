import { useMeasure } from '@/lib/useMeasure'

export interface LineSeries {
  name: string
  color: string
  /** One value per label; `null` renders a gap. */
  values: (number | null)[]
}

interface LineChartProps {
  labels: string[]
  series: LineSeries[]
  height?: number
  yMin?: number
  yMax?: number
  /** Fill the area under the first series. */
  area?: boolean
  formatValue?: (value: number) => string
}

/** Dependency-free multi-series line chart with an optional area fill. */
export function LineChart({ labels, series, height = 170, yMin, yMax, area, formatValue }: LineChartProps) {
  const [ref, width] = useMeasure<HTMLDivElement>()
  const labelSpace = 18
  const topSpace = 8
  const chartHeight = height - labelSpace - topSpace

  const values = series.flatMap((s) => s.values).filter((v): v is number => v !== null)
  const lo = yMin ?? Math.min(...(values.length ? values : [0]), 0)
  const hi = Math.max(yMax ?? 0, ...(values.length ? values : [1]), lo + 1)

  const xFor = (i: number): number =>
    labels.length <= 1 ? width / 2 : (i / (labels.length - 1)) * (width - 16) + 8
  const yFor = (v: number): number => topSpace + chartHeight - ((v - lo) / (hi - lo)) * chartHeight

  // Consecutive non-null runs become separate polyline segments.
  const segmentsFor = (vals: (number | null)[]): string[] => {
    const segments: string[] = []
    let current: string[] = []
    vals.forEach((v, i) => {
      if (v === null) {
        if (current.length > 1) segments.push(current.join(' '))
        current = []
      } else {
        current.push(`${xFor(i)},${yFor(v)}`)
      }
    })
    if (current.length > 1) segments.push(current.join(' '))
    return segments
  }

  const labelStep = Math.ceil(labels.length / Math.max(Math.floor(width / 46), 1))

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={width} height={height}>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={width}
              y1={topSpace + chartHeight * f}
              y2={topSpace + chartHeight * f}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
          ))}
          <line
            x1={0}
            x2={width}
            y1={topSpace + chartHeight + 0.5}
            y2={topSpace + chartHeight + 0.5}
            stroke="var(--border)"
          />
          {area && series[0] && (
            <>
              {segmentsFor(series[0].values).map((seg, i) => {
                const pts = seg.split(' ')
                const first = pts[0].split(',')[0]
                const last = pts[pts.length - 1].split(',')[0]
                const base = topSpace + chartHeight
                return (
                  <polygon
                    key={i}
                    points={`${first},${base} ${seg} ${last},${base}`}
                    fill={series[0].color}
                    opacity={0.12}
                  />
                )
              })}
            </>
          )}
          {series.map((s) => (
            <g key={s.name}>
              {segmentsFor(s.values).map((seg, i) => (
                <polyline
                  key={i}
                  points={seg}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {s.values.map((v, i) =>
                v === null ? null : (
                  <circle key={i} cx={xFor(i)} cy={yFor(v)} r={2.6} fill={s.color}>
                    <title>{`${labels[i]} — ${s.name}: ${formatValue ? formatValue(v) : v}`}</title>
                  </circle>
                )
              )}
            </g>
          ))}
          {labels.map((label, i) =>
            i % labelStep === 0 ? (
              <text
                key={i}
                x={xFor(i)}
                y={height - 4}
                textAnchor="middle"
                fontSize={10}
                fill="var(--muted-foreground)"
              >
                {label}
              </text>
            ) : null
          )}
        </svg>
      )}
    </div>
  )
}
