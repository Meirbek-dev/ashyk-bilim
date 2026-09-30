import NewCollection from '@/app/_shared/withmenu/collections/new/NewCollection'
import { getPlatformThumbnailImage } from '@services/media/media'
import { requirePermission } from '@/lib/auth/permissions'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { APP_NAME } from '@/lib/constants'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { Suspense } from 'react'

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

// The session check runs inside the boundary (Next 16: uncached data outside
// <Suspense> blocks the route — UX-231, UX-253).
export default function PlatformNewCollectionPage() {
  return (
    <Suspense fallback={<div className="bg-muted/60 m-8 h-64 animate-pulse rounded-xl" />}>
      <NewCollectionContent />
    </Suspense>
  )
}

async function NewCollectionContent() {
  await requirePermission(Actions.CREATE, Resources.COLLECTION, Scopes.APP)
  return <NewCollection />
}
