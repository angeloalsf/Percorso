import * as Sentry from '@sentry/react'

/** No-op without a DSN, so local/dev and forks with no Sentry project configured stay silent. */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({ dsn, environment: import.meta.env.VITE_ENV_LABEL })
}

export { Sentry }
