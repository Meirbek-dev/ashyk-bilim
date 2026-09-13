'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { toast } from 'sonner'
import * as v from 'valibot'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@components/ui/field'
import { AuthErrorBanner, AuthSubmitButton } from '@components/auth/AuthForm'
import { Input } from '@components/ui/input'
import AuthLogo from '@components/auth/logo'
import AuthCard from '@components/auth/card'
import Link from '@components/ui/AppLink'
import { getAbsoluteUrl } from '@services/config/config'
import { verifyEmailAction } from '@/app/actions/auth'

interface VerifyState {
  /** Submitted values, re-applied after a failure (the form action resets uncontrolled inputs). */
  values: { email: string; code: string }
  error: string | null
  fieldErrors: { email?: string; code?: string }
  /** Bumped per submit: the form re-mounts so `defaultValue` re-applies (Base UI warns otherwise). */
  version: number
}

interface VerifyEmailClientProps {
  /** `?email=` from the email link (prefill only). */
  email: string
  /** `?code=` from the email link (prefill only). */
  code: string
}

/**
 * Confirms the emailed verification code (`POST /auth/verify-email`). The
 * email link lands here with `?email=&code=` prefilled; the form is also
 * usable by hand.
 */
function VerifyEmailClient({ email, code }: VerifyEmailClientProps) {
  const t = useTranslations('Auth.VerifyEmail')
  const validationT = useTranslations('Validation')
  const errorsT = useTranslations('Errors')
  const router = useRouter()

  const schema = v.object({
    email: v.pipe(v.string(), v.trim(), v.minLength(1, validationT('required')), v.email(validationT('invalidEmail'))),
    code: v.pipe(v.string(), v.trim(), v.minLength(1, validationT('required')), v.maxLength(32)),
  })

  const initialState: VerifyState = { values: { email, code }, error: null, fieldErrors: {}, version: 0 }
  const [state, action, isPending] = useActionState(async (prev: VerifyState, formData: FormData): Promise<VerifyState> => {
    const version = prev.version + 1
    const values = { email: String(formData.get('email') ?? ''), code: String(formData.get('code') ?? '') }
    const parsed = v.safeParse(schema, values)
    if (!parsed.success) {
      const flat = v.flatten<typeof schema>(parsed.issues)
      return {
        values,
        error: null,
        fieldErrors: {
          ...(flat.nested?.email?.[0] ? { email: flat.nested.email[0] } : {}),
          ...(flat.nested?.code?.[0] ? { code: flat.nested.code[0] } : {}),
        },
        version,
      }
    }
    const result = await verifyEmailAction(parsed.output)
    if (!result.ok) {
      if (result.fieldErrors?.code) return { values, error: null, fieldErrors: { code: t('invalidCode') }, version }
      const key = `codes.${result.code}`
      return { values, error: errorsT.has(key) ? errorsT(key) : t('failed'), fieldErrors: {}, version }
    }
    toast.success(t('success'))
    router.push('/auth/login')
    return { ...initialState, version }
  }, initialState)

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
        <Field>
          <FieldLabel>{t('email')}</FieldLabel>
          <FieldContent>
            <Input
              name="email"
              type="email"
              defaultValue={state.values.email}
              autoComplete="email"
              className="w-full"
            />
          </FieldContent>
          <FieldError>{state.fieldErrors.email}</FieldError>
        </Field>
        <Field>
          <FieldLabel>{t('code')}</FieldLabel>
          <FieldContent>
            <Input
              name="code"
              defaultValue={state.values.code}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              className="w-full"
            />
          </FieldContent>
          <FieldDescription>{t('codeHint')}</FieldDescription>
          <FieldError>{state.fieldErrors.code}</FieldError>
        </Field>
        <AuthSubmitButton isPending={isPending} label={t('submit')} pendingLabel={t('submitting')} />
      </form>

      <p className="text-muted-foreground mt-5 text-center text-sm">
        <Link href={getAbsoluteUrl('/login')} className="underline">
          {t('backToLogin')}
        </Link>
      </p>
    </AuthCard>
  )
}

export default VerifyEmailClient
