'use client';

import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field';
import { AuthErrorBanner, AuthSubmitButton } from '@components/auth/AuthForm';
import { getAbsoluteUrl, getPublicAPIUrl } from '@services/config/config';
import { loginAction } from '@/app/actions/auth';
import { getPostAuthRedirect, normalizeReturnTo } from '@/lib/auth/redirect';
import PasswordInput from '@components/ui/custom/password-input';
import { SiGoogle } from '@icons-pack/react-simple-icons';
import { Separator } from '@components/ui/separator';
import { useActionState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@components/ui/button';
import AuthLogo from '@components/auth/logo';
import AuthCard from '@components/auth/card';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import * as v from 'valibot';

/** Validates returnTo, rejecting open-redirect attempts. */
function getSafeReturnTo(raw: string | null): string {
  return getPostAuthRedirect(normalizeReturnTo(raw));
}

interface LoginState {
  error: string | null;
  fieldErrors: { email?: string; password?: string };
}

const LoginClient = () => {
  const validationT = useTranslations('Validation');
  const t = useTranslations('Auth.Login');
  const searchParams = useSearchParams();
  const [isPendingGoogle, startGoogleTransition] = useTransition();

  const schema = v.object({
    email: v.pipe(v.string(), v.minLength(1, validationT('required')), v.email(validationT('invalidEmail'))),
    password: v.pipe(
      v.string(),
      v.minLength(1, validationT('required')),
      v.minLength(8, validationT('passwordMinLength', { length: 8 })),
    ),
  });

  const [state, action, isPending] = useActionState(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      const result = v.safeParse(schema, {
        email: formData.get('email'),
        password: formData.get('password'),
      });

      if (!result.success) {
        const flat = v.flatten(result.issues);
        return {
          error: null,
          fieldErrors: {
            email: flat.nested?.email?.[0],
            password: flat.nested?.password?.[0],
          },
        };
      }

      const response = await loginAction({
        email: result.output.email,
        password: result.output.password,
        returnTo: searchParams.get('returnTo'),
      });

      if (!response.ok) {
        const message = response.reason === 'service_unavailable' ? t('serviceUnavailable') : t('wrongCredentials');
        return { error: message, fieldErrors: {} };
      }

      return { error: null, fieldErrors: {} };
    },
    { error: null, fieldErrors: {} },
  );

  const handleGoogleSignIn = () => {
    startGoogleTransition(() => {
      const postLoginPath = getSafeReturnTo(searchParams.get('returnTo'));
      const frontendCallback = getAbsoluteUrl(postLoginPath.startsWith('/') ? postLoginPath : '/redirect_from_auth');
      const authorizeUrl = new URL(`${getPublicAPIUrl()}auth/google/authorize`);
      authorizeUrl.searchParams.set('callback', frontendCallback);
      globalThis.location.href = authorizeUrl.toString();
    });
  };

  const anyPending = isPending || isPendingGoogle;

  return (
    <AuthCard>
      <Link
        prefetch={false}
        href={getAbsoluteUrl('/')}
      >
        <AuthLogo />
      </Link>

      <Button
        className="mt-8 w-full gap-3"
        onClick={handleGoogleSignIn}
        disabled={anyPending}
      >
        <SiGoogle />
        {t('signInWithGoogle')}
      </Button>

      <div className="my-7 flex w-full items-center justify-center overflow-hidden">
        <Separator />
        <span className="px-2 text-sm">{t('or')}</span>
        <Separator />
      </div>

      {state.error ? (
        <div className="mb-4">
          <AuthErrorBanner message={state.error} />
        </div>
      ) : null}

      <form
        className="w-full space-y-4"
        action={action}
      >
        <input
          type="hidden"
          name="returnTo"
          value={searchParams.get('returnTo') ?? ''}
        />
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

        <div className="flex justify-end">
          <Link
            prefetch={false}
            href={getAbsoluteUrl('/forgot')}
            className="text-muted-foreground text-xs underline"
          >
            {t('forgotPassword')}
          </Link>
        </div>

        <AuthSubmitButton
          isPending={anyPending}
          label={t('login')}
          pendingLabel={t('loading')}
        />
      </form>

      <p className="mt-5 text-center text-sm">
        {t('noAccount')}
        <Link
          prefetch={false}
          href={getAbsoluteUrl('/signup')}
          className="text-muted-foreground ml-1 underline"
        >
          {t('signup')}
        </Link>
      </p>
    </AuthCard>
  );
};

export default LoginClient;
