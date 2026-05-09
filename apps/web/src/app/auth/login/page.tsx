import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import LoginClient from './login';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.Login');

  return {
    title: t('title', { platformName: 'Ashyk Bilim' }),
  };
}

const Login = async () => <LoginClient />;

export default Login;
