import { Loader2 } from 'lucide-react'

/** Full-screen spinner shown while the persisted session is restored. */
export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}
