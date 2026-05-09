import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import ForgotPasswordClient from './forgot';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.Forgot');
  return {
    title: t('title'),
  };
}

const ForgotPasswordPage = () => {
  return <ForgotPasswordClient />;
};

export default ForgotPasswordPage;
