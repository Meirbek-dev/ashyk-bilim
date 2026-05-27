import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PLATFORM_BRAND_NAME } from '@/lib/constants';
import LoginClient from './login';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.Login');

  return {
    title: t('title', { platformName: PLATFORM_BRAND_NAME }),
  };
}

const Login = async () => <LoginClient />;

export default Login;
