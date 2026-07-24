import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, MailCheck } from 'lucide-react'
import { useT, type TKey } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthShell, GoogleMark } from './AuthShell'
import { authErrorKey } from './errors'

export function SignupPage() {
  const t = useT()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<TKey | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const signInWithGoogle = async (): Promise<void> => {
    setError(null)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    if (err) setError('auth.errorGoogle')
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (submitting) return
    if (!name.trim()) {
      setError('errors.nameRequired')
      return
    }
    if (password.length < 8) {
      setError('auth.errorWeakPassword')
      return
    }
    setSubmitting(true)
    setError(null)
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: window.location.origin
      }
    })
    if (err) {
      const key = authErrorKey(err)
      setError(key === 'unconfirmed' ? 'auth.errorGeneric' : key)
    } else if (!data.session) {
      // Email confirmation is on: no session until the link is clicked.
      setSentTo(email)
    }
    // With confirmation off a session exists and AuthGate redirects.
    setSubmitting(false)
  }

  if (sentTo) {
    return (
      <AuthShell title={t('auth.checkEmailTitle')} subtitle="">
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-6 text-center">
          <MailCheck className="size-8 text-primary" />
          <p className="text-sm text-muted-foreground">{t('auth.checkEmailBody', { email: sentTo })}</p>
          <Button asChild variant="secondary" className="mt-2">
            <Link to="/login">{t('auth.signIn')}</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('auth.signUpTitle')} subtitle={t('auth.signUpSubtitle')}>
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
        <Field label={t('auth.name')}>
          <Input
            autoComplete="name"
            required
            value={name}
            placeholder={t('auth.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t('auth.email')}>
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')}>
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            placeholder={t('auth.passwordMinHint')}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-destructive">{t(error)}</p>}

        <Button type="submit" className="mt-1 w-full" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          {submitting ? t('auth.working') : t('auth.signUp')}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthShell>
  )
}
