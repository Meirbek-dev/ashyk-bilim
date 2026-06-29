import NewCollection from '@/app/_shared/withmenu/collections/new/NewCollection'
import { getPlatformThumbnailImage } from '@services/media/media'
import { APP_NAME } from '@/lib/constants'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'NewCollectionPage' })

  return {
    title: `${t('metaTitle')} - ${APP_NAME}`,
    description: t('metaDescription', { platformName: APP_NAME }),
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
      },
    },
    openGraph: {
      title: `${t('metaTitle')} - ${APP_NAME}`,
      description: t('metaDescription', { platformName: APP_NAME }),
      type: 'website',
      images: [
        {
          url: getPlatformThumbnailImage(),
          width: 800,
          height: 600,
          alt: APP_NAME,
        },
      ],
    },
  }
}

export default async function PlatformNewCollectionPage() {
  return <NewCollection />
}
