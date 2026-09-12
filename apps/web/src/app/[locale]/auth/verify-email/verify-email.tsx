'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
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
  error: string | null
  fieldErrors: { email?: string; code?: string }
}

const INITIAL_STATE: VerifyState = { error: null, fieldErrors: {} }

/**
 * Confirms the emailed verification code (`POST /auth/verify-email`). The
 * email link lands here with `?email=&code=` prefilled; the form is also
 * usable by hand.
 */
function VerifyEmailClient() {
  const t = useTranslations('Auth.VerifyEmail')
  const validationT = useTranslations('Validation')
  const errorsT = useTranslations('Errors')
  const searchParams = useSearchParams()
  const router = useRouter()

  const schema = v.object({
    email: v.pipe(v.string(), v.trim(), v.minLength(1, validationT('required')), v.email(validationT('invalidEmail'))),
    code: v.pipe(v.string(), v.trim(), v.minLength(1, validationT('required')), v.maxLength(32)),
  })

  const [state, action, isPending] = useActionState(async (_prev: VerifyState, formData: FormData): Promise<VerifyState> => {
    const parsed = v.safeParse(schema, { email: formData.get('email'), code: formData.get('code') })
    if (!parsed.success) {
      const flat = v.flatten<typeof schema>(parsed.issues)
      return {
        error: null,
        fieldErrors: {
          ...(flat.nested?.email?.[0] ? { email: flat.nested.email[0] } : {}),
          ...(flat.nested?.code?.[0] ? { code: flat.nested.code[0] } : {}),
        },
      }
    }
    const result = await verifyEmailAction(parsed.output)
    if (!result.ok) {
      if (result.fieldErrors?.code) return { error: null, fieldErrors: { code: t('invalidCode') } }
      const key = `codes.${result.code}`
      return { error: errorsT.has(key) ? errorsT(key) : t('failed'), fieldErrors: {} }
    }
    toast.success(t('success'))
    router.push('/auth/login')
    return INITIAL_STATE
  }, INITIAL_STATE)

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

      <form className="w-full space-y-4" action={action} noValidate>
        <Field>
          <FieldLabel>{t('email')}</FieldLabel>
          <FieldContent>
            <Input
              name="email"
              type="email"
              defaultValue={searchParams.get('email') ?? ''}
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
              defaultValue={searchParams.get('code') ?? ''}
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
