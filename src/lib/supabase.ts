import { createClient } from '@supabase/supabase-js'

/**
 * Only the anon key ever ships to the browser — Row Level Security is the
 * access control. When env vars are missing the client is still created
 * (with obviously-dead placeholders) so the UI can render a "not
 * configured" notice instead of crashing at import time.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url || 'https://not-configured.supabase.co', anonKey || 'not-configured', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
