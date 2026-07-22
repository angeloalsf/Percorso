import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { signOut, useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { LANGUAGE_NAMES, LANGUAGES, isLangCode } from '@/i18n/config'
import { useT } from '@/i18n'
import { usePrefs, type Theme } from '@/state/prefs'
import { useProfile } from '@/state/profile'

export function SettingsPage() {
  const t = useT()
  const { session } = useAuth()
  const { language, theme, setLanguage, setTheme } = usePrefs()
  const profile = useProfile()
  const [name, setName] = useState(profile.fullName)
  const [saving, setSaving] = useState(false)

  const saveName = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    const ok = await profile.saveName(name.trim())
    setSaving(false)
    if (ok) toast.success(t('settings.profileSaved'))
    else toast.error(t('toasts.saveError'))
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t('settings.title')}</h2>

      <Card>
        <CardTitle>{t('settings.profile')}</CardTitle>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label={t('common.name')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Button onClick={() => void saveName()} disabled={saving || name.trim() === profile.fullName}>
            {t('common.save')}
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>{t('settings.preferences')}</CardTitle>
        <div className="flex flex-col gap-4">
          <Field label={t('settings.language')}>
            <Select
              value={language}
              onChange={(e) => {
                if (isLangCode(e.target.value)) setLanguage(e.target.value)
              }}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_NAMES[lang]}
                </option>
              ))}
            </Select>
          </Field>
          <p className="-mt-2 text-xs text-muted-foreground">{t('settings.languageHint')}</p>
          <Field label={t('settings.theme')}>
            <Segmented<Theme>
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'dark', label: t('settings.themeDark') },
                { value: 'light', label: t('settings.themeLight') }
              ]}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>{t('settings.account')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('settings.signedInAs', { email: session?.user.email ?? '' })}
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => void signOut()}>
          <LogOut />
          {t('auth.signOut')}
        </Button>
      </Card>

      <Card>
        <CardTitle>{t('settings.privacy')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('settings.privacyHint')}</p>
      </Card>
    </div>
  )
}
