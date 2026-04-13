import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { getCollectionById } from '@services/courses/collections';
import { getAbsoluteUrl } from '@services/config/config';
import { PLATFORM_BRAND_NAME } from '@/lib/constants';
import { getTranslations } from 'next-intl/server';
import Link from '@/components/ui/ServerLink';
import type { Metadata } from 'next';

interface MetadataProps {
  params: Promise<{ collectionid: string }>;
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params;
  const t = await getTranslations('General');
  const col = await getCollectionById(params.collectionid);

  return {
    title: `${t('collection')}: ${col.name} - ${PLATFORM_BRAND_NAME}`,
    description: `${col.description}`,
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
      title: `${t('collection')}: ${col.name} - ${PLATFORM_BRAND_NAME}`,
      description: `${col.description}`,
      type: 'website',
    },
  };
}

export default async function PlatformCollectionPage(props: { params: Promise<{ collectionid: string }> }) {
  const t = await getTranslations('General');
  const { collectionid } = await props.params;
  const col = await getCollectionById(collectionid);

  return (
    <GeneralWrapper>
      <h2 className="text-sm font-semibold text-gray-400">{t('collection')}</h2>
      <h1 className="text-3xl font-semibold">{col.name}</h1>
      <br />
      <div className="home_courses flex flex-wrap">
        {col.courses.map((course: any) => (
          <div
            className="pr-8"
            key={course.course_uuid}
          >
            <Link
              prefetch={false}
              href={getAbsoluteUrl(`/course/${course.course_uuid.replace('course_', '')}`)}
            >
              <div
                className="relative inset-0 h-[131px] w-[249px] rounded-lg bg-cover shadow-xl ring-1 ring-black/10 ring-inset"
                style={{
                  backgroundImage: course.thumbnail_image
                    ? `url(${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)})`
                    : `url('/empty_thumbnail.webp')`,
                }}
              />
            </Link>
            <h2 className="w-[250px] py-2 text-lg font-semibold">{course.name}</h2>
          </div>
        ))}
      </div>
    </GeneralWrapper>
  );
}
