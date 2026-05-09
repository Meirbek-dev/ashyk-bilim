'use client';

import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field';
import { AuthErrorBanner, AuthSuccessBanner, AuthSubmitButton } from '@components/auth/AuthForm';
import PasswordInput from '@components/ui/custom/password-input';
import { getAbsoluteUrl } from '@services/config/config';
import { resetPassword } from '@services/auth/auth';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthLogo from '@components/auth/logo';
import AuthCard from '@components/auth/card';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import * as v from 'valibot';

interface ResetState {
  error: string | null;
  message: string | null;
  fieldErrors: {
    email?: string;
    reset_code?: string;
    new_password?: string;
    confirm_password?: string;
  };
}

const ResetPasswordClient = () => {
  const validationT = useTranslations('Validation');
  const t = useTranslations('Auth.Reset');
  const searchParams = useSearchParams();

  // Pre-filled from email link — passed as uncontrolled defaultValue.
  const token = searchParams.get('token') ?? searchParams.get('resetCode') ?? '';
  const email = searchParams.get('email') ?? '';

  const schema = v.pipe(
    v.object({
      email: v.pipe(v.string(), v.minLength(1, validationT('required')), v.email(validationT('invalidEmail'))),
      new_password: v.pipe(
        v.string(),
        v.minLength(1, validationT('required')),
        v.minLength(8, validationT('passwordMinLength', { length: 8 })),
      ),
      confirm_password: v.pipe(v.string(), v.minLength(1, validationT('required'))),
      reset_code: v.pipe(v.string(), v.minLength(1, validationT('required'))),
    }),
    v.forward(
      v.partialCheck(
        [['new_password'], ['confirm_password']],
        (data) => data.new_password === data.confirm_password,
        validationT('passwordsDoNotMatch'),
      ),
      ['confirm_password'],
    ),
  );

  const [state, action, isPending] = useActionState(
    async (_prev: ResetState, formData: FormData): Promise<ResetState> => {
      const result = v.safeParse(schema, {
        email: formData.get('email'),
        new_password: formData.get('new_password'),
        confirm_password: formData.get('confirm_password'),
        reset_code: formData.get('reset_code'),
      });

      if (!result.success) {
        const flat = v.flatten(result.issues);
        return {
          error: null,
          message: null,
          fieldErrors: {
            email: flat.nested?.email?.[0],
            reset_code: flat.nested?.reset_code?.[0],
            new_password: flat.nested?.new_password?.[0],
            confirm_password: flat.nested?.confirm_password?.[0],
          },
        };
      }

      const res = await resetPassword(result.output.reset_code, result.output.new_password);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        return { error: body?.detail ?? t('unknownError'), message: null, fieldErrors: {} };
      }

      return { error: null, message: t('success'), fieldErrors: {} };
    },
    { error: null, message: null, fieldErrors: {} },
  );

  return (
    <AuthCard className="max-w-md">
      <AuthLogo />
      <p className="mt-4 text-xl font-semibold tracking-tight">{t('title')}</p>
      <p className="text-muted-foreground mt-2 text-center text-sm">{t('enterResetDetails')}</p>

      {state.error ? (
        <div className="mt-4">
          <AuthErrorBanner message={state.error} />
        </div>
      ) : null}

      {state.message ? (
        <div className="mt-4 w-full space-y-2">
          <AuthSuccessBanner message={state.message} />
          <Link
            href={getAbsoluteUrl('/login')}
            className="block text-center text-sm underline"
          >
            {t('loginAgain')}
          </Link>
        </div>
      ) : null}

      <form
        className="mt-6 w-full space-y-4"
        action={action}
      >
        <Field>
          <FieldLabel>{t('email')}</FieldLabel>
          <FieldContent>
            <Input
              name="email"
              type="email"
              placeholder={t('emailPlaceholder')}
              autoComplete="email"
              defaultValue={email}
              className="w-full"
            />
          </FieldContent>
          <FieldError>{state.fieldErrors.email}</FieldError>
        </Field>

        <Field>
          <FieldLabel>{t('resetCode')}</FieldLabel>
          <FieldContent>
            <Input
              name="reset_code"
              type="text"
              placeholder={t('resetCodePlaceholder')}
              autoComplete="one-time-code"
              defaultValue={token}
              className="w-full"
            />
          </FieldContent>
          <FieldError>{state.fieldErrors.reset_code}</FieldError>
        </Field>

        <Field>
          <FieldLabel>{t('newPassword')}</FieldLabel>
          <FieldContent>
            <PasswordInput
              name="new_password"
              placeholder={t('newPasswordPlaceholder')}
              autoComplete="new-password"
              className="w-full"
            />
          </FieldContent>
          <FieldError>{state.fieldErrors.new_password}</FieldError>
        </Field>

        <Field>
          <FieldLabel>{t('confirmPassword')}</FieldLabel>
          <FieldContent>
            <PasswordInput
              name="confirm_password"
              placeholder={t('confirmPasswordPlaceholder')}
              autoComplete="new-password"
              className="w-full"
            />
          </FieldContent>
          <FieldError>{state.fieldErrors.confirm_password}</FieldError>
        </Field>

        <AuthSubmitButton
          isPending={isPending}
          label={t('changePassword')}
          pendingLabel={t('loading')}
        />
      </form>
    </AuthCard>
  );
};

export default ResetPasswordClient;
