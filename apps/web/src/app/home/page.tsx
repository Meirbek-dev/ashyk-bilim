import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import HomeClient from './home';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('General');
  return {
    title: t('home'),
  };
}
const Home = () => {
  return (
    <div>
      <HomeClient />
    </div>
  );
};

export default Home;
