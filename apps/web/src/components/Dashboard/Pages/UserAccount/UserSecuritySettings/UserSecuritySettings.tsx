'use client'

import { useRef, useState } from 'react'
import { describeUserAgent } from '@/lib/user-agent'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { KeyRound, Loader2, LockKeyhole, MonitorSmartphone, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@components/ui/input'
import PasswordInput from '@components/ui/custom/password-input'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@components/ui/field'
import { useApiError } from '@/hooks/useApiError'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { fromUnix } from '@/lib/api/contract'
import { APIError, hasErrorCode } from '@/lib/api/assertSuccess'
import {
  changePassword,
  getSessionInfo,
  listSessions,
  removeTotp,
  revokeSession,
  startTotpEnrollment,
  verifyTotpEnrollment,
} from '@services/auth/auth'
import type { SessionInfo, TotpEnrollment } from '@/lib/api/generated/zod'

/**
 * Security settings against the v2 BFF: the list of live sessions with
 * per-session revoke (`/auth/sessions`), password change (`/auth/password`,
 * checked by Zitadel) and TOTP enrollment (`/auth/mfa/totp`).
 *
 * `mfaEnabled` is the `UserProfile.mfa_enabled` of the current session; the
 * 409 on enrol stays as a fallback for a session minted before the flag.
 */
export default function UserSecuritySettings({ mfaEnabled = false }: { mfaEnabled?: boolean }) {
  const t = useTranslations('DashPage.UserAccountSettings.UserAccount.Security')

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-10">
      <SessionsSection t={t} />
      <PasswordSection t={t} />
      <TotpSection t={t} initialActive={mfaEnabled} />
    </div>
  )
}

type Translator = ReturnType<typeof useTranslations<'DashPage.UserAccountSettings.UserAccount.Security'>>

function SessionsSection({ t }: { t: Translator }) {
  const format = useFormatter()
  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  const sessionsQuery = useQuery({
    queryKey: queryKeys.auth.sessions(),
    queryFn: listSessions,
    // A session revoked from another tab shows on focus (UX-101), like the TOTP
    // query — the client default is `refetchOnWindowFocus: false` (UX-107).
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    // The app-wide default (queryClient.ts) retries 3x with a 5s delay each —
    // up to a minute of an unlabelled spinner before `sessionsLoadError` (and
    // its retry button) ever gets a chance to render. Cap it here so a real
    // outage surfaces in a few seconds instead.
    retry: 1,
    retryDelay: 1_000,
  })

  const [revokeCandidate, setRevokeCandidate] = useState<string | null>(null)
  // The confirm dialog opened from a row's button that is gone once the
  // revoke lands; without a target focus would fall to <body>.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const revokeMutation = useMutation({
    mutationFn: (handle: string) => revokeSession(handle),
    onSuccess: async () => {
      toast.success(t('sessionRevoked'))
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() })
    },
    onError: async error => {
      // UX-082: ended elsewhere (logout, password change, another tab) —
      // the row is stale, not the request.
      if (hasErrorCode(error, 'not-found')) {
        toast.info(t('sessionAlreadyEnded'))
        await queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() })
        return
      }
      toastApiError(error)
    },
  })

  return (
    <section aria-labelledby="sessions-heading" className="flex flex-col gap-4">
      <div>
        <h2 ref={headingRef} tabIndex={-1} id="sessions-heading" className="flex items-center gap-2 text-lg font-semibold">
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
                  {describeUserAgent(session.user_agent) ?? t('unknownDevice')}
                  {session.current ? (
                    <span className="bg-primary/10 text-primary ml-2 rounded px-1.5 py-0.5 text-xs">
                      {t('currentSession')}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">
                  {session.ip ? `${session.ip} · ` : ''}
                  {t('lastSeen', { at: format.dateTime(fromUnix(session.last_seen_unix), { dateStyle: 'medium', timeStyle: 'short' }) })}
                </span>
              </div>
              {!session.current ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revokeMutation.isPending}
                  onClick={() => setRevokeCandidate(session.handle)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {t('revoke')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <AlertDialog open={revokeCandidate !== null} onOpenChange={open => !open && setRevokeCandidate(null)}>
        <AlertDialogContent finalFocus={headingRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('revokeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('revokeConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('revokeCancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => {
                if (revokeCandidate) revokeMutation.mutate(revokeCandidate, { onSettled: () => setRevokeCandidate(null) })
              }}
            >
              {t('revoke')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function PasswordSection({ t }: { t: Translator }) {
  const { toastApiError } = useApiError()
  const errorsT = useTranslations('Errors')
  const queryClient = useQueryClient()
  const [values, setValues] = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({})

  const mutation = useMutation({
    mutationFn: () => changePassword(values.current, values.next),
    onSuccess: async () => {
      setValues({ current: '', next: '', confirm: '' })
      setErrors({})
      toast.success(t('passwordChanged'), { description: t('passwordChangedDescription') })
      // The server revoked every other session: the list above is stale.
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() })
    },
    onError: error => {
      if (hasErrorCode(error, 'invalid-credentials')) {
        setErrors({ current: t('currentPasswordWrong') })
        return
      }
      if (hasErrorCode(error, 'validation-failed')) {
        // `password-policy` / `password-unchanged` carry the specific rule.
        const code = error instanceof APIError ? error.fieldErrors.find(f => f.field === 'new_password')?.code : undefined
        const key = `fields.${code ?? ''}`
        setErrors({ next: code && errorsT.has(key) ? errorsT(key) : t('newPasswordRejected') })
        return
      }
      toastApiError(error)
    },
  })

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: typeof errors = {}
    if (!values.current) next.current = t('required')
    if (values.next.length < 8) next.next = t('passwordTooShort')
    if (values.confirm !== values.next) next.confirm = t('passwordsDoNotMatch')
    setErrors(next)
    if (Object.keys(next).length > 0) return
    mutation.mutate()
  }

  const bind = (name: keyof typeof values) => ({
    value: values[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValues(prev => ({ ...prev, [name]: event.target.value })),
  })

  return (
    <section aria-labelledby="password-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="password-heading" className="flex items-center gap-2 text-lg font-semibold">
          <LockKeyhole size={18} aria-hidden="true" />
          {t('passwordTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('passwordDescription')}</p>
      </div>
      <form onSubmit={submit} className="flex max-w-md flex-col gap-4" noValidate>
        <Field>
          <FieldLabel>{t('currentPassword')}</FieldLabel>
          <FieldContent>
            <PasswordInput name="currentPassword" autoComplete="current-password" {...bind('current')} />
          </FieldContent>
          <FieldError>{errors.current}</FieldError>
        </Field>
        <Field>
          <FieldLabel>{t('newPassword')}</FieldLabel>
          <FieldContent>
            <PasswordInput name="newPassword" autoComplete="new-password" {...bind('next')} />
          </FieldContent>
          <FieldDescription>{t('passwordRule')}</FieldDescription>
          <FieldError>{errors.next}</FieldError>
        </Field>
        <Field>
          <FieldLabel>{t('confirmPassword')}</FieldLabel>
          <FieldContent>
            <PasswordInput name="confirmPassword" autoComplete="new-password" {...bind('confirm')} />
          </FieldContent>
          <FieldError>{errors.confirm}</FieldError>
        </Field>
        <div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : null}
            {t('changePassword')}
          </Button>
        </div>
      </form>
    </section>
  )
}

function TotpSection({ t, initialActive }: { t: Translator; initialActive: boolean }) {
  const { toastApiError } = useApiError()
  const queryClient = useQueryClient()
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState(false)
  // UX-082: `initialActive` is the server render's snapshot; a disable in
  // another tab must show here, so the live flag is re-read on focus.
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session(),
    queryFn: getSessionInfo,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
    retryDelay: 1_000,
  })
  const active = sessionQuery.data?.mfa_enabled ?? initialActive
  const setActive = (mfa_enabled: boolean) => {
    queryClient.setQueryData<SessionInfo>(queryKeys.auth.session(), prev => (prev ? { ...prev, mfa_enabled } : prev))
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.session() })
  }
  // Disabling unmounts the button that opened the dialog: focus the heading.
  const headingRef = useRef<HTMLHeadingElement>(null)

  // A 409 from enrol or verify means TOTP was activated elsewhere (another
  // tab): drop the form and show the live state (UX-110).
  const resyncActive = () => {
    setEnrollment(null)
    setActive(true)
    toast.info(t('totpAlreadyActive'))
  }

  const enrollMutation = useMutation({
    mutationFn: startTotpEnrollment,
    onSuccess: data => {
      setEnrollment(data)
      setCode('')
      setCodeError(null)
    },
    onError: error => {
      if (hasErrorCode(error, 'conflict')) {
        resyncActive()
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
      if (hasErrorCode(error, 'conflict')) {
        resyncActive()
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
        <h2 ref={headingRef} tabIndex={-1} id="totp-heading" className="flex items-center gap-2 text-lg font-semibold">
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
          <Button variant="outline" onClick={() => setConfirmDisable(true)} disabled={removeMutation.isPending}>
            {t('disableTotp')}
          </Button>
          <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
            <AlertDialogContent finalFocus={headingRef}>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('disableTotpConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('disableTotpConfirmDescription')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(undefined, { onSettled: () => setConfirmDisable(false) })}
                >
                  {t('disableTotp')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
