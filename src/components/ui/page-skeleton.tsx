/** Layout-matched shimmer shown while the Supabase data loads. */
export function PageSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-7 w-40 rounded-md bg-muted" />
      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  )
}
