import { getPlatformThumbnailImage } from '@services/media/media';
import { PLATFORM_BRAND_NAME } from '@/lib/constants';
import { getTranslations } from 'next-intl/server';
import NewCollection from './NewCollection';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('NewCollectionPage');

  return {
    title: `${t('metaTitle')} - ${PLATFORM_BRAND_NAME}`,
    description: t('metaDescription', { platformName: PLATFORM_BRAND_NAME }),
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        'index': true,
        'follow': true,
        'max-image-preview': 'large',
      },
    },
    openGraph: {
      title: `${t('metaTitle')} - ${PLATFORM_BRAND_NAME}`,
      description: t('metaDescription', { platformName: PLATFORM_BRAND_NAME }),
      type: 'website',
      images: [
        {
          url: getPlatformThumbnailImage(),
          width: 800,
          height: 600,
          alt: PLATFORM_BRAND_NAME,
        },
      ],
    },
  };
}

export default async function Page(props: any) {
  void props;
  return <NewCollection />;
}
