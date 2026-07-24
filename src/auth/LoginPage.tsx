import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useT, type TKey } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthShell, GoogleMark } from './AuthShell'
import { authErrorKey } from './errors'

export function LoginPage() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<TKey | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)

  const signInWithGoogle = async (): Promise<void> => {
    setError(null)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    // On success the browser navigates away; only errors land here.
    if (err) setError('auth.errorGoogle')
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!email || !password || submitting) return
    setSubmitting(true)
    setError(null)
    setUnconfirmed(false)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      const key = authErrorKey(err)
      if (key === 'unconfirmed') setUnconfirmed(true)
      else setError(key)
    }
    // On success the auth listener flips the session and AuthGate redirects.
    setSubmitting(false)
  }

  return (
    <AuthShell title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')}>
      <Button variant="outline" className="w-full" onClick={() => void signInWithGoogle()}>
        <GoogleMark />
        {t('auth.continueWithGoogle')}
      </Button>

      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t('auth.or')}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form className="flex flex-col gap-3.5" onSubmit={(e) => void submit(e)}>
        <Field label={t('auth.email')}>
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')}>
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-destructive">{t(error)}</p>}
        {unconfirmed && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t('auth.checkEmailBody', { email })}
          </p>
        )}

        <Button type="submit" className="mt-1 w-full" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          {submitting ? t('auth.working') : t('auth.signIn')}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {t('auth.noAccount')}{' '}
        <Link to="/signup" className="font-medium text-primary hover:underline">
          {t('auth.signUp')}
        </Link>
      </p>
    </AuthShell>
  )
}
