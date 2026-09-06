'use client'

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@components/ui/field'
import { AuthErrorBanner, AuthSubmitButton } from '@components/auth/AuthForm'
import { getAbsoluteUrl, getPublicAPIUrl } from '@services/config/config'
import { loginAction } from '@/app/actions/auth'
import type { AuthActionResult, LoginFailureReason } from '@/app/actions/auth'
import { getPostAuthRedirect, normalizeReturnTo } from '@/lib/auth/redirect'
import PasswordInput from '@components/ui/custom/password-input'
import { SiGoogle } from '@icons-pack/react-simple-icons'
import { Separator } from '@components/ui/separator'
import { useActionState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@components/ui/button'
import AuthLogo from '@components/auth/logo'
import AuthCard from '@components/auth/card'
import { Input } from '@components/ui/input'
import { useTranslations } from 'next-intl'
import Link from '@components/ui/AppLink'
import * as v from 'valibot'

/** Validates returnTo, rejecting open-redirect attempts. */
function getSafeReturnTo(raw: string | null): string {
  return getPostAuthRedirect(normalizeReturnTo(raw))
}

type LoginStep = 'credentials' | 'totp'

interface LoginState {
  step: LoginStep
  /** Credentials kept across the TOTP step so the second submit can resend them. */
  login: string
  password: string
  error: string | null
  fieldErrors: { login?: string; password?: string; totpCode?: string }
}

const INITIAL_STATE: LoginState = { step: 'credentials', login: '', password: '', error: null, fieldErrors: {} }

/**
 * Login against the v2 BFF: password (+ optional TOTP second step) or Google.
 *
 * Failures come back as contract error codes (`invalid-credentials`,
 * `mfa-required`, `invalid-totp-code`, `account-disabled`, `rate-limited`);
 * Google failures land here as `?error=<code>` from the backend redirect.
 */
function LoginClient() {
  const validationT = useTranslations('Validation')
  const t = useTranslations('Auth.Login')
  const errorsT = useTranslations('Errors')
  const searchParams = useSearchParams()
  const [isPendingGoogle, startGoogleTransition] = useTransition()

  const messageForCode = (code: string | null | undefined): string | null => {
    if (!code) return null
    if (code === 'google-cancelled') return t('googleCancelled')
    const key = `codes.${code}`
    return errorsT.has(key) ? errorsT(key) : null
  }

  const messageForFailure = (result: AuthActionResult): string => {
    const reason: LoginFailureReason = result.reason ?? 'login_failed'
    switch (reason) {
      case 'invalid_credentials':
        return t('wrongCredentials')
      case 'invalid_totp_code':
        return t('invalidTotpCode')
      case 'account_disabled':
        return t('accountDisabled')
      case 'rate_limited':
        return t('rateLimited')
      case 'service_unavailable':
        return t('serviceUnavailable')
      case 'mfa_required':
        return t('totpHint')
      default:
        return messageForCode(result.code) ?? t('wrongCredentials')
    }
  }

  const credentialsSchema = v.object({
    login: v.pipe(v.string(), v.trim(), v.minLength(1, validationT('required'))),
    password: v.pipe(v.string(), v.minLength(1, validationT('required'))),
  })

  const totpSchema = v.object({
    totpCode: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1, validationT('required')),
      v.regex(/^\d{6,8}$/u, t('invalidTotpCode')),
    ),
  })

  const [state, action, isPending] = useActionState(
    async (prev: LoginState, formData: FormData): Promise<LoginState> => {
      const returnTo = searchParams.get('returnTo')

      if (prev.step === 'totp') {
        const parsed = v.safeParse(totpSchema, { totpCode: formData.get('totpCode') })
        if (!parsed.success) {
          const flat = v.flatten(parsed.issues)
          return { ...prev, error: null, fieldErrors: { totpCode: flat.nested?.totpCode?.[0] ?? '' } }
        }
        const result = await loginAction({
          login: prev.login,
          password: prev.password,
          totpCode: parsed.output.totpCode,
          returnTo,
        })
        if (!result.ok) {
          if (result.reason === 'invalid_totp_code' || result.reason === 'mfa_required') {
            return { ...prev, error: null, fieldErrors: { totpCode: t('invalidTotpCode') } }
          }
          return { ...INITIAL_STATE, error: messageForFailure(result) }
        }
        return { ...prev, error: null, fieldErrors: {} }
      }

      const parsed = v.safeParse(credentialsSchema, {
        login: formData.get('login'),
        password: formData.get('password'),
      })

      if (!parsed.success) {
        const flat = v.flatten(parsed.issues)
        const loginError = flat.nested?.login?.[0]
        const passwordError = flat.nested?.password?.[0]
        return {
          ...INITIAL_STATE,
          fieldErrors: {
            ...(loginError ? { login: loginError } : {}),
            ...(passwordError ? { password: passwordError } : {}),
          },
        }
      }

      const result = await loginAction({
        login: parsed.output.login,
        password: parsed.output.password,
        returnTo,
      })

      if (!result.ok) {
        if (result.reason === 'mfa_required') {
          return {
            step: 'totp',
            login: parsed.output.login,
            password: parsed.output.password,
            error: null,
            fieldErrors: {},
          }
        }
        return { ...INITIAL_STATE, error: messageForFailure(result) }
      }

      return { ...INITIAL_STATE }
    },
    INITIAL_STATE,
  )

  const handleGoogleSignIn = () => {
    startGoogleTransition(() => {
      const postLoginPath = getSafeReturnTo(searchParams.get('returnTo'))
      const authorizeUrl = new URL(`${getPublicAPIUrl()}auth/google`)
      authorizeUrl.searchParams.set('callback', postLoginPath.startsWith('/') ? postLoginPath : '/')
      globalThis.location.href = authorizeUrl.toString()
    })
  }

  const anyPending = isPending || isPendingGoogle
  const redirectError = state.error ? null : messageForCode(searchParams.get('error'))
  const bannerError = state.error ?? redirectError

  return (
    <AuthCard>
      <Link href={getAbsoluteUrl('/')}>
        <AuthLogo />
      </Link>

      {state.step === 'credentials' ? (
        <>
          <Button className="mt-8 w-full gap-3" onClick={handleGoogleSignIn} disabled={anyPending}>
            <SiGoogle />
            {t('signInWithGoogle')}
          </Button>

          <div className="my-7 flex w-full items-center justify-center overflow-hidden">
            <Separator />
            <span className="px-2 text-sm">{t('or')}</span>
            <Separator />
          </div>
        </>
      ) : (
        <div className="mt-8" />
      )}

      {bannerError ? (
        <div className="mb-4">
          <AuthErrorBanner message={bannerError} />
        </div>
      ) : null}

      <form className="w-full space-y-4" action={action}>
        {state.step === 'credentials' ? (
          <>
            <Field>
              <FieldLabel>{t('loginIdentifier')}</FieldLabel>
              <FieldContent>
                <Input
                  name="login"
                  type="text"
                  placeholder={t('loginIdentifierPlaceholder')}
                  autoComplete="username"
                  className="w-full"
                />
              </FieldContent>
              <FieldError>{state.fieldErrors.login}</FieldError>
            </Field>

            <Field>
              <FieldLabel>{t('password')}</FieldLabel>
              <FieldContent>
                <PasswordInput
                  name="password"
                  placeholder={t('passwordPlaceholder')}
                  autoComplete="current-password"
                  className="w-full"
                />
              </FieldContent>
              <FieldError>{state.fieldErrors.password}</FieldError>
            </Field>

            <AuthSubmitButton isPending={anyPending} label={t('login')} pendingLabel={t('loading')} />
          </>
        ) : (
          <>
            <Field>
              <FieldLabel>{t('totpCode')}</FieldLabel>
              <FieldContent>
                <Input
                  name="totpCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={t('totpCodePlaceholder')}
                  className="w-full"
                  autoFocus
                />
              </FieldContent>
              <FieldDescription>{t('totpHint')}</FieldDescription>
              <FieldError>{state.fieldErrors.totpCode}</FieldError>
            </Field>

            <AuthSubmitButton isPending={anyPending} label={t('verifyCode')} pendingLabel={t('loading')} />
            <Link
              href={getAbsoluteUrl('/login')}
              className="text-muted-foreground block w-full text-center text-sm underline"
            >
              {t('backToPassword')}
            </Link>
          </>
        )}
      </form>

      <p className="text-muted-foreground mt-5 text-center text-xs">{t('noAccountHint')}</p>
    </AuthCard>
  )
}

export default LoginClient
