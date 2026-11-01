import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import type { User } from '@datavalley/api-client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select'
import { LoadingBlock, Page } from '../../components/states'
import { api } from '../../lib/api'
import { sync } from '../../lib/sync'
import { applyTheme, useSession } from '../../stores/session'

function ProfileForm({ user }: { user: User }) {
  const { t, i18n } = useTranslation()
  const setUser = useSession((state) => state.setUser)
  const [locale, setLocale] = useState(user.locale)
  const [theme, setTheme] = useState(user.theme)
  const [timezone, setTimezone] = useState(user.timezone)
  const [totpEnroll, setTotpEnroll] = useState<{ secret: string; url: string } | null>(null)

  async function save(next: {
    locale: string
    theme: 'light' | 'dark' | 'system'
    timezone: string
  }) {
    const result = await api.request<{ user: User }>(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify(next),
    })
    setUser(result.user)
    await i18n.changeLanguage(next.locale)
    localStorage.setItem('locale', next.locale)
    applyTheme(next.theme)
  }

  return (
    <Page title={t('profile')}>
      <div className="grid max-w-md gap-3">
        <Label htmlFor="locale">{t('language')}</Label>
        <Select
          value={locale}
          onValueChange={(value) => {
            setLocale(value)
            void save({ locale: value, theme: theme as 'light' | 'dark' | 'system', timezone })
          }}
        >
          <SelectTrigger id="locale" aria-label={t('language')}></SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
          </SelectContent>
        </Select>
        <Label htmlFor="theme">{t('theme')}</Label>
        <Select
          value={theme}
          onValueChange={(value) => {
            const next = value as 'light' | 'dark' | 'system'
            setTheme(next)
            void save({ locale, theme: next, timezone })
          }}
        >
          <SelectTrigger id="theme" aria-label={t('theme')}></SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t('system')}</SelectItem>
            <SelectItem value="light">{t('light')}</SelectItem>
            <SelectItem value="dark">{t('dark')}</SelectItem>
          </SelectContent>
        </Select>
        <Label htmlFor="timezone">{t('timezone')}</Label>
        <Input
          id="timezone"
          value={timezone}
          onChange={(event) => {
            const next = event.target.value
            setTimezone(next)
            sync.edit(`user:${user.id}:timezone`, {
              draft: next,
              delay: 300,
              apply: () => undefined,
              commit: async (draft) => {
                await save({ locale, theme: theme as 'light' | 'dark' | 'system', timezone: draft })
                return draft
              },
              accept: () => undefined,
              rollback: () => setTimezone(user.timezone),
            })
          }}
          onBlur={() => void sync.flush(`user:${user.id}:timezone`)}
        />
      </div>
      <Card className="max-w-md p-4">
        <h2 className="font-medium">{t('totp')}</h2>
        <Button
          className="mt-3"
          variant="outline"
          onClick={async () => {
            const enrolled = await api.request<{ secret: string; url: string }>('/totp/enroll', {
              method: 'POST',
            })
            setTotpEnroll(enrolled)
          }}
        >
          {t('enroll')}
        </Button>
      </Card>
      <Dialog.Root
        open={Boolean(totpEnroll)}
        onOpenChange={(open) => {
          if (!open) setTotpEnroll(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border border-border bg-card p-4 shadow-md">
            <Dialog.Title className="text-base font-semibold">{t('totp')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('totp')}</Dialog.Description>
            <div className="mt-3 grid gap-3 text-sm">
              <div>
                <p className="font-medium">{t('totpSecret')}</p>
                <p className="mt-1 break-all font-mono">{totpEnroll?.secret}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    if (totpEnroll) void navigator.clipboard.writeText(totpEnroll.secret)
                  }}
                >
                  {t('copy')}
                </Button>
              </div>
              <div>
                <p className="font-medium">{t('totpUrl')}</p>
                <p className="mt-1 break-all font-mono">{totpEnroll?.url}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    if (totpEnroll) void navigator.clipboard.writeText(totpEnroll.url)
                  }}
                >
                  {t('copy')}
                </Button>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Dialog.Close className="inline-flex h-9 items-center border border-border px-3 text-sm hover:bg-accent">
                {t('close')}
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Page>
  )
}

export function ProfilePage() {
  const { t } = useTranslation()
  const user = useSession((state) => state.user)
  if (!user)
    return (
      <Page title={t('profile')}>
        <LoadingBlock />
      </Page>
    )
  return <ProfileForm user={user} />
}
