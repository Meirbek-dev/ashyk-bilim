'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { KeyRound, Loader2, MonitorSmartphone, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@components/ui/field'
import { useApiError } from '@/hooks/useApiError'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { fromUnix } from '@/lib/api/contract'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { listSessions, removeTotp, revokeSession, startTotpEnrollment, verifyTotpEnrollment } from '@services/auth/auth'
import type { TotpEnrollment } from '@/lib/api/generated/zod'

/**
 * Security settings against the v2 BFF: the list of live sessions with
 * per-session revoke (`/auth/sessions`) and TOTP enrollment
 * (`/auth/mfa/totp`). Passwords live in Zitadel and have no self-service
 * change endpoint in v2 (DECISIONS.md P9).
 */
export default function UserSecuritySettings() {
  const t = useTranslations('DashPage.UserAccountSettings.UserAccount.Security')

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-10">
      <SessionsSection t={t} />
      <TotpSection t={t} />
    </div>
  )
}

type Translator = ReturnType<typeof useTranslations<'DashPage.UserAccountSettings.UserAccount.Security'>>

function formatTimestamp(unix: number, locale: string | undefined): string {
  const date = fromUnix(unix)
  return date ? date.toLocaleString(locale) : ''
}

function SessionsSection({ t }: { t: Translator }) {
  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  const sessionsQuery = useQuery({
    queryKey: queryKeys.auth.sessions(),
    queryFn: listSessions,
    staleTime: 15_000,
    // The app-wide default (queryClient.ts) retries 3x with a 5s delay each —
    // up to a minute of an unlabelled spinner before `sessionsLoadError` (and
    // its retry button) ever gets a chance to render. Cap it here so a real
    // outage surfaces in a few seconds instead.
    retry: 1,
    retryDelay: 1_000,
  })

  const revokeMutation = useMutation({
    mutationFn: (handle: string) => revokeSession(handle),
    onSuccess: async () => {
      toast.success(t('sessionRevoked'))
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() })
    },
    onError: error => toastApiError(error),
  })

  return (
    <section aria-labelledby="sessions-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="sessions-heading" className="flex items-center gap-2 text-lg font-semibold">
          <MonitorSmartphone size={18} aria-hidden="true" />
          {t('sessionsTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('sessionsDescription')}</p>
      </div>

      {sessionsQuery.isPending ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          {t('loading')}
        </div>
      ) : null}

      {sessionsQuery.isError ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-destructive">{t('sessionsLoadError')}</span>
          <Button variant="outline" size="sm" onClick={() => void sessionsQuery.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : null}

      {sessionsQuery.data ? (
        <ul className="divide-border divide-y rounded-md border">
          {sessionsQuery.data.map(session => (
            <li key={session.handle} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">
                  {session.user_agent || t('unknownDevice')}
                  {session.current ? (
                    <span className="bg-primary/10 text-primary ml-2 rounded px-1.5 py-0.5 text-xs">
                      {t('currentSession')}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">
                  {session.ip ? `${session.ip} · ` : ''}
                  {t('lastSeen', { at: formatTimestamp(session.last_seen_unix, undefined) })}
                </span>
              </div>
              {!session.current ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(session.handle)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {t('revoke')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function TotpSection({ t }: { t: Translator }) {
  const { toastApiError } = useApiError()
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [active, setActive] = useState(false)

  const enrollMutation = useMutation({
    mutationFn: startTotpEnrollment,
    onSuccess: data => {
      setEnrollment(data)
      setCode('')
      setCodeError(null)
    },
    onError: error => {
      if (hasErrorCode(error, 'conflict')) {
        setActive(true)
        toast.info(t('totpAlreadyActive'))
        return
      }
      toastApiError(error)
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (value: string) => verifyTotpEnrollment(value),
    onSuccess: () => {
      setEnrollment(null)
      setActive(true)
      toast.success(t('totpActivated'))
    },
    onError: error => {
      if (hasErrorCode(error, 'invalid-totp-code')) {
        setCodeError(t('invalidCode'))
        return
      }
      toastApiError(error)
    },
  })

  const removeMutation = useMutation({
    mutationFn: removeTotp,
    onSuccess: () => {
      setActive(false)
      setEnrollment(null)
      toast.success(t('totpRemoved'))
    },
    onError: error => toastApiError(error),
  })

  const submitCode = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!/^\d{6,8}$/u.test(code.trim())) {
      setCodeError(t('invalidCode'))
      return
    }
    setCodeError(null)
    verifyMutation.mutate(code)
  }

  return (
    <section aria-labelledby="totp-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="totp-heading" className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck size={18} aria-hidden="true" />
          {t('totpTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('totpDescription')}</p>
      </div>

      {enrollment ? (
        <form onSubmit={submitCode} className="flex flex-col gap-4 rounded-md border p-4">
          <p className="text-sm">{t('totpScanHint')}</p>
          <code className="bg-muted rounded p-2 text-xs break-all" aria-label={t('totpSecretLabel')}>
            {enrollment.secret}
          </code>
          <a className="text-primary text-xs underline" href={enrollment.uri}>
            {t('totpOpenAuthenticator')}
          </a>
          <Field>
            <FieldLabel>{t('codeLabel')}</FieldLabel>
            <FieldContent>
              <Input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={event => setCode(event.target.value)}
                placeholder={t('codePlaceholder')}
              />
            </FieldContent>
            <FieldDescription>{t('codeHint')}</FieldDescription>
            <FieldError>{codeError}</FieldError>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={verifyMutation.isPending}>
              {verifyMutation.isPending ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : null}
              {t('activate')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEnrollment(null)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : active ? (
        // Enrolled: only offer disabling it — the enable control is a dead
        // click once TOTP is already on (the account never gets a second
        // "not yet enrolled" state to enable into).
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">{t('totpActive')}</span>
          <Button variant="outline" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
            {t('disableTotp')}
          </Button>
        </div>
      ) : (
        // Not enrolled: disabling is meaningless (and `DELETE` is
        // idempotent, so it would silently "succeed" without ever having
        // done anything) — only offer enabling it.
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending}>
            <KeyRound size={14} aria-hidden="true" />
            {t('enableTotp')}
          </Button>
        </div>
      )}
    </section>
  )
}
