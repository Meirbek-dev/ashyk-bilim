import NewCollectionButton from '@/components/Objects/Elements/Buttons/NewCollectionButton';
import TypeOfContentTitle from '@/components/Objects/Elements/Titles/TypeOfContentTitle';
import CollectionThumbnail from '@components/Objects/Thumbnails/CollectionThumbnail';
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper';
import { PermissionGuard } from '@components/Security/PermissionGuard';
import ProtectedText from '@components/Objects/ContentPlaceHolder';
import { getPlatformThumbnailImage } from '@services/media/media';
import { Actions, Resources, Scopes } from '@/types/permissions';
import { getCollections } from '@services/courses/collections';
import { getAbsoluteUrl } from '@services/config/config';
import { PLATFORM_BRAND_NAME } from '@/lib/constants';
import { getTranslations } from 'next-intl/server';
import Link from '@components/ui/AppLink';
import type { Metadata } from 'next';

interface MetadataProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(_props: MetadataProps): Promise<Metadata> {
  const t = await getTranslations('HomePage.Collections');

  return {
    title: `${t('title')} - ${PLATFORM_BRAND_NAME}`,
    description: `${t('collectionOfCourses', { platformName: PLATFORM_BRAND_NAME })}`,
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
      title: `${t('title')} - ${PLATFORM_BRAND_NAME}`,
      description: `${t('collectionOfCourses', { platformName: PLATFORM_BRAND_NAME })}`,
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

export default async function PlatformCollectionsPage() {
  const t = await getTranslations('HomePage.Collections');
  const collections = await getCollections();

  return (
    <GeneralWrapper>
      <div className="mb-8 flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <TypeOfContentTitle
            title={t('title')}
            type="col"
          />
          <PermissionGuard
            action={Actions.CREATE}
            resource={Resources.COLLECTION}
            scope={Scopes.PLATFORM}
            fallback={null}
          >
            <Link href={getAbsoluteUrl('/collections/new')}>
              <NewCollectionButton />
            </Link>
          </PermissionGuard>
        </div>
        <div className="grid w-full grid-cols-2 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4">
          {collections.map((collection: any) => (
            <div
              key={collection.collection_uuid}
              className="p-3"
            >
              <CollectionThumbnail collection={collection} />
            </div>
          ))}
          {collections.length === 0 && (
            <div className="col-span-full flex items-center justify-center py-8">
              <div className="text-center">
                <h1 className="mb-2 text-xl font-bold text-gray-600">{t('noContent')}</h1>
                <p className="text-base text-gray-400">
                  <ProtectedText
                    text={t('noContentUserAdmin')}
                    action={Actions.CREATE}
                    resource={Resources.COLLECTION}
                    scope={Scopes.PLATFORM}
                  />
                </p>
                <div className="mt-4 flex justify-center">
                  <PermissionGuard
                    action={Actions.CREATE}
                    resource={Resources.COLLECTION}
                    scope={Scopes.PLATFORM}
                    fallback={null}
                  >
                    <Link href={getAbsoluteUrl('/collections/new')}>
                      <NewCollectionButton />
                    </Link>
                  </PermissionGuard>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </GeneralWrapper>
  );
}
