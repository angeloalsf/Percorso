import type { AuthError } from '@supabase/supabase-js'
import type { TKey } from '@/i18n'

/**
 * Maps a Supabase auth error to a translation key. `unconfirmed` is a
 * special case the pages render as the "check your email" panel.
 */
export function authErrorKey(error: AuthError): TKey | 'unconfirmed' {
  const code = error.code ?? ''
  const msg = error.message.toLowerCase()
  if (code === 'email_not_confirmed') return 'unconfirmed'
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'auth.errorInvalidCredentials'
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered'))
    return 'auth.errorEmailInUse'
  if (code === 'weak_password' || msg.includes('password should be')) return 'auth.errorWeakPassword'
  if (code === 'validation_failed' || msg.includes('invalid email') || msg.includes('unable to validate email'))
    return 'auth.errorEmailInvalid'
  return 'auth.errorGeneric'
}
