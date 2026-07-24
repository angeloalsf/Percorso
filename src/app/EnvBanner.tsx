const ENV_LABEL = import.meta.env.VITE_ENV_LABEL ?? 'unlabeled'

function supabaseHost(): string {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL ?? '').host || 'not configured'
  } catch {
    return 'not configured'
  }
}

/** Fixed ribbon reminding whoever's looking which environment they're in. Hidden in production. */
export function EnvBanner() {
  if (ENV_LABEL === 'production') return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-warning/40 bg-warning/10 px-3 py-1 text-center text-[11px] font-medium text-warning">
      {ENV_LABEL.toUpperCase()} · {supabaseHost()}
    </div>
  )
}
