'use client';

import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field';
import { AuthErrorBanner, AuthSuccessBanner, AuthSubmitButton } from '@components/auth/AuthForm';
import { ArrowLeft } from 'lucide-react';
import { getAbsoluteUrl } from '@services/config/config';
import { sendResetLink } from '@services/auth/auth';
import { useActionState } from 'react';
import AuthLogo from '@components/auth/logo';
import AuthCard from '@components/auth/card';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import * as v from 'valibot';

interface ForgotState {
  error: string | null;
  message: string | null;
  fieldErrors: { email?: string };
}

const ForgotPasswordClient = () => {
  const t = useTranslations('Auth.Forgot');
  const validationT = useTranslations('Validation');

  const schema = v.object({
    email: v.pipe(v.string(), v.minLength(1, validationT('required')), v.email(validationT('invalidEmail'))),
  });

  const [state, action, isPending] = useActionState(
    async (_prev: ForgotState, formData: FormData): Promise<ForgotState> => {
      const result = v.safeParse(schema, { email: formData.get('email') });

      if (!result.success) {
        const flat = v.flatten(result.issues);
        return { error: null, message: null, fieldErrors: { email: flat.nested?.email?.[0] } };
      }

      const res = await sendResetLink(result.output.email);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        return { error: body?.detail ?? t('unknownError'), message: null, fieldErrors: {} };
      }

      return { error: null, message: t('checkEmail'), fieldErrors: {} };
    },
    { error: null, message: null, fieldErrors: {} },
  );

  return (
    <AuthCard>
      <Link
        prefetch={false}
        href={getAbsoluteUrl('/')}
      >
        <AuthLogo />
      </Link>
      <p className="mt-4 text-xl font-semibold tracking-tight">{t('title')}</p>
      <p className="text-muted-foreground mt-2 text-center text-sm">{t('enterEmailMessage')}</p>

      {state.error ? (
        <div className="mt-4">
          <AuthErrorBanner message={state.error} />
        </div>
      ) : null}
      {state.message ? (
        <div className="mt-4">
          <AuthSuccessBanner message={state.message} />
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
              className="w-full"
            />
          </FieldContent>
          <FieldError>{state.fieldErrors.email}</FieldError>
        </Field>

        <AuthSubmitButton
          isPending={isPending}
          label={t('sendResetLink')}
          pendingLabel={t('loading')}
        />
      </form>

      <Link
        prefetch={false}
        href={getAbsoluteUrl('/login')}
        className="text-muted-foreground mt-5 flex items-center gap-1 text-sm underline"
      >
        <ArrowLeft size={14} />
        {t('backToLogin')}
      </Link>
    </AuthCard>
  );
};

export default ForgotPasswordClient;
