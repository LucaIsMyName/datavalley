import { ApiClientError, type User } from '@datavalley/api-client'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { DocumentTitle } from '../../components/document-title'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { api } from '../../lib/api'
import { useSession } from '../../stores/session'

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const setUser = useSession((state) => state.setUser)
  const [error, setError] = useState('')
  const [totp, setTotp] = useState(false)
  const [useRecovery, setUseRecovery] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const totpCode = useRecovery ? undefined : (data.get('totp') as string) || undefined
    const recoveryCode = useRecovery ? (data.get('recovery') as string) || undefined : undefined
    try {
      await api.ensureCsrf()
      const result = await api.request<{ user: User; mustChangePassword: boolean }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          login: data.get('login'),
          password: data.get('password'),
          totpCode,
          recoveryCode,
        }),
      })
      setUser(result.user)
      await i18n.changeLanguage(result.user.locale)
      navigate(result.mustChangePassword ? '/change-password' : '/')
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'totp_required') {
        setTotp(true)
        return
      }
      setError(caught instanceof Error ? caught.message : t('error'))
    }
  }

  return (
    <>
      <DocumentTitle segments={[t('login')]} />
      <main className="grid min-h-screen place-items-center p-4 md:p-6">
        <Card className="w-full max-w-sm p-6">
          <h1 className="text-xl font-semibold">{t('login')}</h1>
          <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
            <Label htmlFor="login">{t('username')}</Label>
            <Input id="login" name="login" autoComplete="username" required />
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
            {totp ? (
              <>
                {useRecovery ? (
                  <>
                    <Label htmlFor="recovery">{t('recoveryCode')}</Label>
                    <Input id="recovery" name="recovery" autoComplete="off" required />
                  </>
                ) : (
                  <>
                    <Label htmlFor="totp">{t('confirmCode')}</Label>
                    <Input
                      id="totp"
                      name="totp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                    />
                  </>
                )}
                <button
                  type="button"
                  className="text-left text-sm underline"
                  onClick={() => {
                    setUseRecovery((value) => !value)
                    setError('')
                  }}
                >
                  {useRecovery ? t('useAuthenticatorCode') : t('useRecoveryCode')}
                </button>
              </>
            ) : null}
            {error ? (
              <p role="alert" className="min-h-5 text-sm text-danger">
                {error}
              </p>
            ) : (
              <p className="min-h-5" />
            )}
            <Button type="submit">{t('login')}</Button>
            <Link to="/forgot-password" className="text-sm underline">
              {t('forgotPassword')}
            </Link>
          </form>
        </Card>
      </main>
    </>
  )
}

export function ChangePasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  return (
    <>
      <DocumentTitle segments={[t('changePassword')]} />
      <main className="grid min-h-screen place-items-center p-4 md:p-6">
        <Card className="w-full max-w-sm p-6">
          <h1 className="text-xl font-semibold">{t('changePassword')}</h1>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              try {
                await api.request('/auth/change-password', {
                  method: 'POST',
                  body: JSON.stringify({
                    currentPassword: data.get('current'),
                    newPassword: data.get('next'),
                  }),
                })
                const me = await api.request<{ user: User }>('/auth/me')
                useSession.getState().setUser(me.user)
                navigate('/')
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : t('error'))
              }
            }}
          >
            <Label htmlFor="current">{t('currentPassword')}</Label>
            <Input id="current" name="current" type="password" required />
            <Label htmlFor="next">{t('newPassword')}</Label>
            <Input id="next" name="next" type="password" minLength={12} required />
            {error ? (
              <p role="alert" className="min-h-5 text-sm text-danger">
                {error}
              </p>
            ) : (
              <p className="min-h-5" />
            )}
            <Button type="submit">{t('save')}</Button>
          </form>
        </Card>
      </main>
    </>
  )
}

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <>
      <DocumentTitle segments={[t('forgotPassword')]} />
      <main className="grid min-h-screen place-items-center p-4 md:p-6">
        <Card className="w-full max-w-sm p-6">
          <h1 className="text-xl font-semibold">{t('forgotPassword')}</h1>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              setError('')
              try {
                await api.ensureCsrf()
                await api.request('/auth/forgot-password', {
                  method: 'POST',
                  body: JSON.stringify({ email: data.get('email') }),
                })
                setSent(true)
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : t('error'))
              }
            }}
          >
            <Label htmlFor="reset-email">{t('email')}</Label>
            <Input id="reset-email" name="email" type="email" autoComplete="email" required />
            {sent ? (
              <p className="min-h-5 text-sm">{t('forgotPasswordSent')}</p>
            ) : error ? (
              <p role="alert" className="min-h-5 text-sm text-danger">
                {error}
              </p>
            ) : (
              <p className="min-h-5" />
            )}
            <Button type="submit">{t('sendResetLink')}</Button>
            <Link to="/login" className="text-sm underline">
              {t('login')}
            </Link>
          </form>
        </Card>
      </main>
    </>
  )
}

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [error, setError] = useState(token ? '' : t('invalidResetLink'))
  return (
    <>
      <DocumentTitle segments={[t('resetPassword')]} />
      <main className="grid min-h-screen place-items-center p-4 md:p-6">
        <Card className="w-full max-w-sm p-6">
          <h1 className="text-xl font-semibold">{t('resetPassword')}</h1>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              setError('')
              try {
                await api.ensureCsrf()
                await api.request('/auth/reset-password', {
                  method: 'POST',
                  body: JSON.stringify({ token, newPassword: data.get('next') }),
                })
                navigate('/login')
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : t('error'))
              }
            }}
          >
            <Label htmlFor="reset-next">{t('newPassword')}</Label>
            <Input
              id="reset-next"
              name="next"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
            {error ? (
              <p role="alert" className="min-h-5 text-sm text-danger">
                {error}
              </p>
            ) : (
              <p className="min-h-5" />
            )}
            <Button type="submit" disabled={!token}>
              {t('save')}
            </Button>
          </form>
        </Card>
      </main>
    </>
  )
}
