'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
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
import { registerAction } from '@/app/actions/auth'

const USERNAME_RE = /^[A-Za-z0-9._-]{3,48}$/u
const FIELDS = ['username', 'email', 'password', 'confirmPassword', 'firstName', 'lastName'] as const
type FieldName = (typeof FIELDS)[number]

interface SignupState {
  values: Record<FieldName, string>
  error: string | null
  fieldErrors: Partial<Record<FieldName, string>>
  /** Bumped per submit: the form re-mounts so `defaultValue` re-applies (Base UI warns otherwise). */
  version: number
}

const EMPTY_VALUES: SignupState['values'] = {
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  firstName: '',
  lastName: '',
}
const INITIAL_STATE: SignupState = { values: EMPTY_VALUES, error: null, fieldErrors: {}, version: 0 }

/** Wire field names → form field names (server field errors land on the right input). */
const WIRE_TO_FIELD: Record<string, FieldName> = {
  username: 'username',
  email: 'email',
  password: 'password',
  first_name: 'firstName',
  last_name: 'lastName',
}

/**
 * Self-registration against `POST /auth/register` (DECISIONS.md 2026-09-12).
 * Success → toast + the login page; the verification code arrives by email
 * and is confirmed on `/auth/verify-email` (login does not depend on it).
 */
function SignupClient() {
  const t = useTranslations('Auth.Signup')
  const validationT = useTranslations('Validation')
  const errorsT = useTranslations('Errors')
  const router = useRouter()

  const schema = v.pipe(
    v.object({
      firstName: v.pipe(v.string(), v.trim(), v.minLength(1, validationT('required')), v.maxLength(100)),
      lastName: v.pipe(v.string(), v.trim(), v.minLength(1, validationT('required')), v.maxLength(100)),
      username: v.pipe(
        v.string(),
        v.trim(),
        v.minLength(1, validationT('required')),
        v.regex(USERNAME_RE, t('usernameRule')),
      ),
      email: v.pipe(v.string(), v.trim(), v.minLength(1, validationT('required')), v.email(validationT('invalidEmail'))),
      password: v.pipe(v.string(), v.minLength(8, validationT('passwordTooShort')), v.maxLength(200)),
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

  const [state, action, isPending] = useActionState(async (prev: SignupState, formData: FormData): Promise<SignupState> => {
    const version = prev.version + 1
    const values = Object.fromEntries(FIELDS.map(name => [name, String(formData.get(name) ?? '')])) as SignupState['values']
    const parsed = v.safeParse(schema, values)
    if (!parsed.success) {
      const flat = v.flatten<typeof schema>(parsed.issues)
      const fieldErrors: SignupState['fieldErrors'] = {}
      for (const name of FIELDS) {
        const message = flat.nested?.[name]?.[0]
        if (message) fieldErrors[name] = message
      }
      return { values, error: null, fieldErrors, version }
    }

    const result = await registerAction(parsed.output)
    if (!result.ok) {
      const fieldErrors: SignupState['fieldErrors'] = {}
      for (const [wire, code] of Object.entries(result.fieldErrors ?? {})) {
        const name = WIRE_TO_FIELD[wire]
        if (!name) continue
        const key = `fields.${code}`
        fieldErrors[name] = errorsT.has(key) ? errorsT(key) : errorsT('fields.invalid')
      }
      if (result.code === 'username-taken') fieldErrors.username = errorsT('codes.username-taken')
      if (result.code === 'email-taken') fieldErrors.email = errorsT('codes.email-taken')
      const codeKey = `codes.${result.code}`
      const banner =
        Object.keys(fieldErrors).length > 0 ? null : errorsT.has(codeKey) ? errorsT(codeKey) : t('failed')
      return { values, error: banner, fieldErrors, version }
    }

    toast.success(t('success'), { description: t('successDescription') })
    router.push('/auth/login')
    return INITIAL_STATE
  }, INITIAL_STATE)

  const field = (name: FieldName, label: string, input: React.ReactNode, hint?: string) => (
    <Field key={name}>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>{input}</FieldContent>
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      <FieldError>{state.fieldErrors[name]}</FieldError>
    </Field>
  )

  return (
    <AuthCard>
      <Link href={getAbsoluteUrl('/')}>
        <AuthLogo />
      </Link>
      <h1 className="mt-8 text-center text-xl font-semibold">{t('heading')}</h1>
      <p className="text-muted-foreground mt-1 mb-4 text-center text-sm">{t('subtitle')}</p>

      {state.error ? (
        <div className="mb-4">
          <AuthErrorBanner message={state.error} />
        </div>
      ) : null}

      <form key={state.version} className="w-full space-y-4" action={action} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            'firstName',
            t('firstName'),
            <Input name="firstName" defaultValue={state.values.firstName} autoComplete="given-name" className="w-full" />,
          )}
          {field(
            'lastName',
            t('lastName'),
            <Input name="lastName" defaultValue={state.values.lastName} autoComplete="family-name" className="w-full" />,
          )}
        </div>
        {field(
          'username',
          t('username'),
          <Input
            name="username"
            defaultValue={state.values.username}
            autoComplete="username"
            placeholder={t('usernamePlaceholder')}
            className="w-full"
          />,
          t('usernameRule'),
        )}
        {field(
          'email',
          t('email'),
          <Input
            name="email"
            type="email"
            defaultValue={state.values.email}
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            className="w-full"
          />,
        )}
        {field(
          'password',
          t('password'),
          <PasswordInput name="password" autoComplete="new-password" placeholder={t('passwordPlaceholder')} className="w-full" />,
          t('passwordRule'),
        )}
        {field(
          'confirmPassword',
          t('confirmPassword'),
          <PasswordInput name="confirmPassword" autoComplete="new-password" className="w-full" />,
        )}

        <AuthSubmitButton isPending={isPending} label={t('submit')} pendingLabel={t('submitting')} />
      </form>

      <p className="text-muted-foreground mt-5 text-center text-sm">
        {t('haveAccount')}{' '}
        <Link href={getAbsoluteUrl('/login')} className="text-primary underline">
          {t('login')}
        </Link>
      </p>
    </AuthCard>
  )
}

export default SignupClient
