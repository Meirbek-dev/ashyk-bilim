'use client';

import { getAbsoluteUrl } from '@services/config/config';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import AuthLogo from '@components/auth/logo';
import AuthCard from '@components/auth/card';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import Link from '@components/ui/AppLink';

/**
 * Google OAuth callback page.
 *
 * After the backend completes the Authorization Code flow with Google, it
 * redirects here with either:
 *   - ?error=<reason>  — failure; show an error and offer a retry link
 *   - otherwise        — redirect into the authenticated app flow
 */
const GoogleCallbackPage = () => {
  const searchParams = useSearchParams();
  const t = useTranslations('Auth.Login');
  const [error, setError] = useState('');

  useEffect(() => {
    const oauthError = searchParams.get('error');

    if (oauthError) {
      setError(t('wrongCredentials'));
      return;
    }

    globalThis.location.href = '/redirect_from_auth';
  }, [searchParams, t]);

  return (
    <AuthCard>
      <Link
        prefetch={false}
        href={getAbsoluteUrl('/')}
      >
        <AuthLogo />
      </Link>

      <div className="mt-8 flex flex-col items-center gap-4">
        {error ? (
          <>
            <div className="flex w-full items-center gap-2 rounded-md bg-red-200 p-3 text-red-950">
              <AlertTriangle size={18} />
              <span className="text-sm font-semibold">{error}</span>
            </div>
            <Link
              prefetch={false}
              href={getAbsoluteUrl('/login')}
              className="text-muted-foreground text-sm underline"
            >
              {t('login')}
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-muted-foreground text-sm">{t('loading')}</p>
          </>
        )}
      </div>
    </AuthCard>
  );
};

export default GoogleCallbackPage;
