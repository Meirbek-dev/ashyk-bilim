import NewCollectionButton from '@/components/Objects/Elements/Buttons/NewCollectionButton'
import TypeOfContentTitle from '@/components/Objects/Elements/Titles/TypeOfContentTitle'
import CollectionsGrid from '@/app/_shared/withmenu/collections/CollectionsGrid'
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper'
import { PermissionGuard } from '@components/Security/PermissionGuard'
import ProtectedText from '@components/Objects/ContentPlaceHolder'
import { getPlatformThumbnailImage } from '@services/media/media'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { getCollections } from '@services/courses/collections'
import { getAbsoluteUrl } from '@services/config/config'
import { APP_NAME } from '@/lib/constants'
import { getTranslations } from 'next-intl/server'
import Link from '@components/ui/AppLink'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { connection } from 'next/server'

interface MetadataProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'HomePage.Collections' })

  return {
    title: `${t('title')} - ${APP_NAME}`,
    description: t('collectionOfCourses', { platformName: APP_NAME }),
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
      title: `${t('title')} - ${APP_NAME}`,
      description: t('collectionOfCourses', { platformName: APP_NAME }),
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

interface PageProps {
  params: Promise<{ locale: string }>
}

// Params are awaited inside the boundary (Next 16: uncached data outside
// <Suspense> blocks the route — UX-231).
export default function PlatformCollectionsPage(props: PageProps) {
  return (
    <Suspense fallback={<div className="bg-muted/60 m-8 h-64 animate-pulse rounded-xl" />}>
      <CollectionsContent params={props.params} />
    </Suspense>
  )
}

async function CollectionsContent({ params }: PageProps) {
  await connection()
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'HomePage.Collections' })
  const collections = await getCollections()

  return (
    <GeneralWrapper>
      <div className="mb-8 flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <TypeOfContentTitle title={t('title')} type="col" as="h1" />
          <PermissionGuard action={Actions.CREATE} resource={Resources.COLLECTION} scope={Scopes.APP} fallback={null}>
            <Link href={getAbsoluteUrl('/collections/new')}>
              <NewCollectionButton />
            </Link>
          </PermissionGuard>
        </div>
        <div className="grid-cards grid w-full gap-6">
          <CollectionsGrid
            initialCollections={collections}
            empty={
              <div className="col-span-full flex items-center justify-center py-8">
                <div className="text-center">
                  <h2 className="text-muted-foreground mb-2 text-xl font-bold">{t('noContent')}</h2>
                  <p className="text-base text-gray-400">
                    <ProtectedText
                      text={t('noContentUserAdmin')}
                      action={Actions.CREATE}
                      resource={Resources.COLLECTION}
                      scope={Scopes.APP}
                    />
                  </p>
                  <div className="mt-4 flex justify-center">
                    <PermissionGuard
                      action={Actions.CREATE}
                      resource={Resources.COLLECTION}
                      scope={Scopes.APP}
                      fallback={null}
                    >
                      <Link href={getAbsoluteUrl('/collections/new')}>
                        <NewCollectionButton />
                      </Link>
                    </PermissionGuard>
                  </div>
                </div>
              </div>
            }
          />
        </div>
      </div>
    </GeneralWrapper>
  )
}
