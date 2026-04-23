import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { getCollectionById } from '@services/courses/collections';
import { getAbsoluteUrl } from '@services/config/config';
import { PLATFORM_BRAND_NAME } from '@/lib/constants';
import { getTranslations } from 'next-intl/server';
import Link from '@/components/ui/ServerLink';
import { Layers } from 'lucide-react';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';

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
  const tCol = await getTranslations('Components.CollectionThumbnail');
  const { collectionid } = await props.params;
  const col = await getCollectionById(collectionid);

  return (
    <GeneralWrapper>
      {/* Header Section */}
      <div className="border-border mb-10 flex flex-col items-start gap-4 border-b pt-4 pb-8">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="rounded-md px-2 py-1 font-medium"
          >
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            {t('collection')}
          </Badge>
          <Badge
            variant="outline"
            className="text-muted-foreground rounded-md px-2 py-1 font-medium"
          >
            {tCol('courseCount', { count: col.courses.length })}
          </Badge>
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">{col.name}</h1>

        {col.description && (
          <p className="text-muted-foreground mt-2 max-w-[800px] leading-relaxed md:text-lg">{col.description}</p>
        )}
      </div>

      {/* Courses Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {col.courses.map((course: any) => (
          <Link
            prefetch={false}
            href={getAbsoluteUrl(`/course/${course.course_uuid.replace('course_', '')}`)}
            key={course.course_uuid}
            className="group border-border bg-card text-card-foreground hover:border-primary/20 flex flex-col overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-md"
          >
            <div className="border-border/50 bg-muted relative aspect-[16/9] w-full overflow-hidden border-b">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{
                  backgroundImage: course.thumbnail_image
                    ? `url(${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)})`
                    : `url('/empty_thumbnail.avif')`,
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>

            <div className="flex flex-1 flex-col p-4">
              <h3 className="group-hover:text-primary line-clamp-2 text-lg font-semibold transition-colors">
                {course.name}
              </h3>
            </div>
          </Link>
        ))}
      </div>

      {col.courses.length === 0 && (
        <div className="border-border bg-muted/30 mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <Layers className="text-muted-foreground/30 mb-4 h-12 w-12" />
          <h3 className="text-xl font-semibold">No courses found</h3>
          <p className="text-muted-foreground mt-2">This collection doesn't have any courses yet.</p>
        </div>
      )}
    </GeneralWrapper>
  );
}
