'use client'

import { useActionState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { toast } from 'sonner'
import * as v from 'valibot'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@components/ui/field'
import { AuthErrorBanner, AuthSubmitButton } from '@components/auth/AuthForm'
import PasswordInput from '@components/ui/custom/password-input'
import { Input } from '@components/ui/input'
import AuthLogo from '@components/auth/logo'
import AuthCard from '@components/auth/card'
import Link from '@components/ui/AppLink'
import { getAbsoluteUrl } from '@services/config/config'
import { confirmPasswordResetAction, requestPasswordResetAction } from '@/app/actions/auth'
import { meetsPasswordPolicy } from '@/lib/auth/schemas'

type FieldName = 'login' | 'code' | 'password' | 'confirmPassword'

interface ResetState {
  /** `request` asks for a code; `confirm` sets the new password with it. */
  step: 'request' | 'confirm'
  login: string
  /** Submitted code, re-applied after a failure (the form action resets uncontrolled inputs). */
  code: string
  error: string | null
  fieldErrors: Partial<Record<FieldName, string>>
  /** Bumped per submit: the form re-mounts so `defaultValue` re-applies. */
  version: number
}

interface ResetPasswordClientProps {
  /** `?email=` from the email link: opens the code step. */
  email: string
  /** `?code=` from the email link (prefill only). */
  code: string
}

/**
 * Forgotten password (`POST /auth/password-reset` + `/confirm`, S-08). The
 * request step always succeeds (no enumeration); the email link lands on the
 * code step with `?email=&code=` filled in.
 */
function ResetPasswordClient({ email, code }: ResetPasswordClientProps) {
  const t = useTranslations('Auth.ResetPassword')
  const validationT = useTranslations('Validation')
  const errorsT = useTranslations('Errors')
  const locale = useLocale()
  const router = useRouter()

  const required = (max: number) =>
    v.pipe(v.string(), v.trim(), v.minLength(1, validationT('required')), v.maxLength(max))
  const requestSchema = v.object({ login: required(320) })
  const confirmSchema = v.pipe(
    v.object({
      code: required(32),
      password: v.pipe(
        v.string(),
        v.minLength(8, validationT('passwordTooShort')),
        v.maxLength(72),
        v.check(meetsPasswordPolicy, errorsT('fields.password-policy')),
      ),
      confirmPassword: v.string(),
    }),
    v.forward(
      v.partialCheck(
        [['password'], ['confirmPassword']],
        input => input.password === input.confirmPassword,
        validationT('passwordsDoNotMatch'),
      ),
      ['confirmPassword'],
    ),
  )

  const bannerFor = (code?: string) => {
    const key = `codes.${code}`
    return errorsT.has(key) ? errorsT(key) : t('failed')
  }

  const initialState: ResetState = {
    step: email ? 'confirm' : 'request',
    login: email,
    code,
    error: null,
    fieldErrors: {},
    version: 0,
  }

  const [state, action, isPending] = useActionState(
    async (prev: ResetState, formData: FormData): Promise<ResetState> => {
      const version = prev.version + 1
      const base = { ...prev, error: null, fieldErrors: {}, version }

      if (prev.step === 'request') {
        const parsed = v.safeParse(requestSchema, { login: String(formData.get('login') ?? '') })
        if (!parsed.success) return { ...base, fieldErrors: { login: parsed.issues[0].message } }
        const result = await requestPasswordResetAction({ login: parsed.output.login, locale })
        if (!result.ok) return { ...base, login: parsed.output.login, error: bannerFor(result.code) }
        return { ...base, step: 'confirm', login: parsed.output.login, code: '' }
      }

      if (formData.get('intent') === 'restart') return { ...base, step: 'request', code: '' }
      const values = {
        code: String(formData.get('code') ?? ''),
        password: String(formData.get('password') ?? ''),
        confirmPassword: String(formData.get('confirmPassword') ?? ''),
      }
      const parsed = v.safeParse(confirmSchema, values)
      if (!parsed.success) {
        const flat = v.flatten<typeof confirmSchema>(parsed.issues).nested
        return {
          ...base,
          code: values.code,
          fieldErrors: {
            ...(flat?.code?.[0] ? { code: flat.code[0] } : {}),
            ...(flat?.password?.[0] ? { password: flat.password[0] } : {}),
            ...(flat?.confirmPassword?.[0] ? { confirmPassword: flat.confirmPassword[0] } : {}),
          },
        }
      }
      const result = await confirmPasswordResetAction({
        login: prev.login,
        code: parsed.output.code,
        newPassword: parsed.output.password,
      })
      if (!result.ok) {
        if (result.code === 'reset-code-invalid' || result.fieldErrors?.code) {
          return { ...base, code: values.code, fieldErrors: { code: t('invalidCode') } }
        }
        const passwordCode = result.fieldErrors?.new_password
        if (passwordCode) {
          const key = `fields.${passwordCode}`
          return {
            ...base,
            code: values.code,
            fieldErrors: { password: errorsT.has(key) ? errorsT(key) : errorsT('fields.invalid') },
          }
        }
        return { ...base, code: values.code, error: bannerFor(result.code) }
      }
      toast.success(t('success'))
      router.push('/auth/login')
      return { ...base, code: '' }
    },
    initialState,
  )

  const fieldErrors = isPending ? {} : state.fieldErrors
  const field = (name: FieldName, label: string, input: React.ReactNode, hint?: string) => (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>{input}</FieldContent>
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      <FieldError>{fieldErrors[name]}</FieldError>
    </Field>
  )

  return (
    <AuthCard>
      <Link href={getAbsoluteUrl('/')}>
        <AuthLogo />
      </Link>
      <h1 className="mt-8 text-center text-xl font-semibold">{t('heading')}</h1>
      <p className="text-muted-foreground mt-1 mb-4 text-center text-sm">
        {state.step === 'request' ? t('requestHint') : t('codeSent', { login: state.login })}
      </p>

      {state.error ? (
        <div className="mb-4">
          <AuthErrorBanner message={state.error} />
        </div>
      ) : null}

      <form key={state.version} className="w-full space-y-4" action={action} noValidate>
        {state.step === 'request' ? (
          <>
            {field(
              'login',
              t('login'),
              <Input name="login" defaultValue={state.login} autoComplete="username" className="w-full" />,
            )}
            <AuthSubmitButton isPending={isPending} label={t('sendCode')} pendingLabel={t('sending')} />
          </>
        ) : (
          <>
            {field(
              'code',
              t('code'),
              <Input
                name="code"
                defaultValue={state.code}
                autoComplete="one-time-code"
                autoCapitalize="characters"
                className="w-full"
              />,
              t('codeHint'),
            )}
            {field(
              'password',
              t('newPassword'),
              <PasswordInput name="password" autoComplete="new-password" className="w-full" />,
              t('passwordRule'),
            )}
            {field(
              'confirmPassword',
              t('confirmPassword'),
              <PasswordInput name="confirmPassword" autoComplete="new-password" className="w-full" />,
            )}
            <AuthSubmitButton isPending={isPending} label={t('submit')} pendingLabel={t('submitting')} />
            <button
              type="submit"
              name="intent"
              value="restart"
              formNoValidate
              className="text-muted-foreground block w-full text-center text-sm underline"
            >
              {t('requestAgain')}
            </button>
          </>
        )}
      </form>

      <p className="text-muted-foreground mt-5 text-center text-sm">
        <Link href={getAbsoluteUrl('/login')} className="underline">
          {t('backToLogin')}
        </Link>
      </p>
    </AuthCard>
  )
}

export default ResetPasswordClient
