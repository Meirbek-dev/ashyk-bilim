import PageLoading from '@components/Objects/Loaders/PageLoading';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import SignUpClient from './signup';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.Signup');

  return {
    title: t('title', { platformName: 'Ashyk Bilim' }),
  };
}

const SignUp = async () => {
  return (
    <Suspense fallback={<PageLoading />}>
      <SignUpClient />
    </Suspense>
  );
};

export default SignUp;
