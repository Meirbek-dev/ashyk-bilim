import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import ResetPasswordClient from './reset';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.Reset');
  return {
    title: t('title'),
  };
}

const ResetPasswordPage = () => {
  return <ResetPasswordClient />;
};

export default ResetPasswordPage;
