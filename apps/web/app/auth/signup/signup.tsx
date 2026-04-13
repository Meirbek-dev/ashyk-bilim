'use client';

import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field';
import { AuthErrorBanner, AuthSubmitButton } from '@components/auth/AuthForm';
import { getAbsoluteUrl, getPublicAPIUrl } from '@services/config/config';
import { signupAction } from '@/app/actions/auth';
import PasswordInput from '@components/ui/custom/password-input';
import { SiGoogle } from '@icons-pack/react-simple-icons';
import { Separator } from '@components/ui/separator';
import { passwordSchema } from '@/lib/auth/schemas';
import { useActionState, useTransition } from 'react';
import { Button } from '@components/ui/button';
import AuthLogo from '@components/auth/logo';
import AuthCard from '@components/auth/card';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import * as v from 'valibot';

const SIGNUP_ERROR_MAP: Record<string, string> = {
  email_taken: 'emailTaken',
  username_taken: 'usernameTaken',
};

interface SignupState {
  error: string | null;
  fieldErrors: {
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  };
}

const SignUpClient = () => {
  const t = useTranslations('Auth.Signup');
  const validationT = useTranslations('Validation');
  const [isPendingGoogle, startGoogleTransition] = useTransition();

  const schema = v.pipe(
    v.object({
      firstName: v.pipe(v.string(), v.minLength(1, validationT('required'))),
      lastName: v.pipe(v.string(), v.minLength(1, validationT('required'))),
      email: v.pipe(v.string(), v.email(validationT('invalidEmail'))),
      password: passwordSchema(validationT),
      confirmPassword: v.string(),
    }),
    v.forward(
      v.partialCheck(
        [['password'], ['confirmPassword']],
        (data) => data.password === data.confirmPassword,
        validationT('passwordsDontMatch'),
      ),
      ['confirmPassword'],
    ),
  );

  const [state, action, isPending] = useActionState(
    async (_prev: SignupState, formData: FormData): Promise<SignupState> => {
      const result = v.safeParse(schema, {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        email: formData.get('email'),
        password: formData.get('password'),
        confirmPassword: formData.get('confirmPassword'),
      });

      if (!result.success) {
        const flat = v.flatten(result.issues);
        return {
          error: null,
          fieldErrors: {
            firstName: flat.nested?.firstName?.[0],
            lastName: flat.nested?.lastName?.[0],
            email: flat.nested?.email?.[0],
            password: flat.nested?.password?.[0],
            confirmPassword: flat.nested?.confirmPassword?.[0],
          },
        };
      }

      const { firstName, lastName, email, password } = result.output;
      const response = await signupAction({
        email,
        firstName,
        lastName,
        password,
      });

      if (!response.ok) {
        const code = response.signupCode;
        const msgKey = code && SIGNUP_ERROR_MAP[code] ? SIGNUP_ERROR_MAP[code] : null;
        return {
          error: msgKey ? t(msgKey) : t('errorSomethingWentWrong'),
          fieldErrors: {},
        };
      }

      return { error: null, fieldErrors: {} };
    },
    { error: null, fieldErrors: {} },
  );

  const handleGoogleSignIn = () => {
    startGoogleTransition(() => {
      const frontendCallback = getAbsoluteUrl('/redirect_from_auth');
      const authorizeUrl = new URL(`${getPublicAPIUrl()}auth/google/authorize`);
      authorizeUrl.searchParams.set('callback', frontendCallback);
      globalThis.location.href = authorizeUrl.toString();
    });
  };

  const anyPending = isPending || isPendingGoogle;

  return (
    <AuthCard className="max-w-md">
      <Link
        prefetch={false}
        href={getAbsoluteUrl('/')}
      >
        <AuthLogo />
      </Link>
      <p className="mt-4 text-xl font-semibold tracking-tight">{t('title')}</p>

      <Button
        className="mt-8 w-full gap-3"
        onClick={handleGoogleSignIn}
        disabled={anyPending}
      >
        <SiGoogle />
        {t('continueWithGoogle')}
      </Button>

      <div className="my-7 flex w-full items-center justify-center overflow-hidden">
        <Separator />
        <span className="px-2 text-sm">{t('or')}</span>
        <Separator />
      </div>

      <form
        className="w-full space-y-4"
        action={action}
      >
        {state.error ? <AuthErrorBanner message={state.error} /> : null}

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>{t('firstName')}</FieldLabel>
            <FieldContent>
              <Input
                name="firstName"
                type="text"
                placeholder={t('firstNamePlaceholder')}
                autoComplete="given-name"
                className="w-full"
              />
            </FieldContent>
            <FieldError>{state.fieldErrors.firstName}</FieldError>
          </Field>

          <Field>
            <FieldLabel>{t('lastName')}</FieldLabel>
            <FieldContent>
              <Input
                name="lastName"
                type="text"
                placeholder={t('lastNamePlaceholder')}
                autoComplete="family-name"
                className="w-full"
              />
            </FieldContent>
            <FieldError>{state.fieldErrors.lastName}</FieldError>
          </Field>
        </div>

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
              autoComplete="new-password"
              className="w-full"
            />
          </FieldContent>
          <FieldError>{state.fieldErrors.password}</FieldError>
        </Field>

        <Field>
          <FieldLabel>{t('confirmPassword')}</FieldLabel>
          <FieldContent>
            <PasswordInput
              name="confirmPassword"
              placeholder={t('confirmPasswordPlaceholder')}
              autoComplete="new-password"
              className="w-full"
            />
          </FieldContent>
          <FieldError>{state.fieldErrors.confirmPassword}</FieldError>
        </Field>

        <AuthSubmitButton
          isPending={anyPending}
          label={t('createAccount')}
          pendingLabel={t('loading')}
          className="mt-2 w-full"
        />
      </form>

      <p className="mt-5 text-center text-sm">
        {t('alreadyHaveAccount')}
        <Link
          prefetch={false}
          href={getAbsoluteUrl('/login')}
          className="text-muted-foreground ml-1 underline"
        >
          {t('signIn')}
        </Link>
      </p>
    </AuthCard>
  );
};

export default SignUpClient;
