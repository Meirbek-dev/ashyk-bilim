'use client'

import { MailWarning, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'

import { resendVerificationAction, verifyEmailAction } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSession } from '@/hooks/useSession'

const HIDDEN_KEY = 'ab.email-banner-hidden'
const emptySubscribe = () => () => {}
const readHidden = () => {
  try {
    return sessionStorage.getItem(HIDDEN_KEY)
  } catch {
    return null
  }
}
// The server has no session storage: render nothing there and decide after hydration.
const serverHidden = () => '?'

/**
 * «Подтвердите email» above the page while the account's address is unconfirmed (`email_verified`, DECISIONS
 * 2026-10-11): the emailed code confirms it in place, «Отправить код ещё раз» mails a new one, «Скрыть» hides it for
 * the rest of the browser session. Sign-in never depends on it.
 */
export default function EmailVerifyBanner() {
  const t = useTranslations('Auth.VerifyEmail')
  const errorsT = useTranslations('Errors')
  const locale = useLocale()
  const { user, refresh } = useSession()
  const storedHidden = useSyncExternalStore(emptySubscribe, readHidden, serverHidden)
  const [hiddenNow, setHiddenFor] = useState<string | null>(null)
  const hiddenFor = hiddenNow ?? storedHidden
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'verify' | 'resend' | null>(null)
  if (!user || user.email_verified || hiddenFor === '?' || hiddenFor === user.id) return null

  const failure = (result: { code?: string }, fallback: string) => {
    const key = `codes.${result.code}`
    return errorsT.has(key) ? errorsT(key) : fallback
  }
  const verify = async () => {
    if (!code.trim()) return setError(t('invalidCode'))
    setPending('verify')
    const result = await verifyEmailAction({ email: user.email, code })
    setPending(null)
    if (!result.ok) return setError(result.fieldErrors?.code ? t('invalidCode') : failure(result, t('failed')))
    toast.success(t('success'))
    refresh()
  }
  const resend = async () => {
    setPending('resend')
    const result = await resendVerificationAction({ email: user.email, locale })
    setPending(null)
    if (!result.ok) return setError(failure(result, t('resendFailed')))
    setError(null)
    toast.success(t('resent'))
  }
  const hide = () => {
    try {
      sessionStorage.setItem(HIDDEN_KEY, user.id)
    } catch {
      // Private mode: hidden for this page view only.
    }
    setHiddenFor(user.id)
  }

  return (
    <div
      role="alert"
      className="border-border bg-card relative mx-4 my-3 max-w-5xl rounded-lg border p-4 pr-12 xl:mx-auto"
    >
      <div className="flex items-start gap-3">
        <MailWarning className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium">{t('bannerTitle')}</p>
            <p className="text-muted-foreground text-sm break-words">{t('bannerText', { email: user.email })}</p>
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
            noValidate
            onSubmit={event => {
              event.preventDefault()
              void verify()
            }}
          >
            <Input
              value={code}
              onChange={event => setCode(event.target.value)}
              aria-label={t('code')}
              placeholder={t('code')}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              aria-invalid={error ? true : undefined}
              className="sm:w-48"
            />
            <Button type="submit" disabled={pending !== null}>
              {t('submit')}
            </Button>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void resend()}>
              {t('resend')}
            </Button>
          </form>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2"
        aria-label={t('bannerHide')}
        onClick={hide}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
