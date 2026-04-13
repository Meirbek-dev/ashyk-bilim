import { PLATFORM_BRAND_NAME, PLATFORM_DESCRIPTION } from '@/lib/constants';
import { LandingContent } from '@/app/_shared/withmenu/LandingContent';
import { getPlatformThumbnailImage } from '@services/media/media';
import { PageSuspense } from '@components/Utils/PageSuspense';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

function CourseGridSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-8">
      <div className="space-y-12">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="bg-muted h-7 w-32 animate-pulse rounded" />
          </div>
          <div className="grid w-full grid-cols-1 justify-items-center gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex w-full max-w-sm justify-center"
              >
                <div className="w-full animate-pulse overflow-hidden rounded-lg border shadow-md">
                  <div className="bg-muted aspect-video w-full" />
                  <div className="space-y-2 p-4">
                    <div className="bg-muted h-5 w-3/4 rounded" />
                    <div className="bg-muted h-4 w-full rounded" />
                    <div className="flex items-center gap-2 pt-1">
                      <div className="bg-muted h-8 w-8 rounded-full" />
                      <div className="bg-muted h-3 w-24 rounded" />
                    </div>
                  </div>
                  <div className="border-t p-3">
                    <div className="bg-muted h-8 w-full rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetadataProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(_props: MetadataProps): Promise<Metadata> {
  const t = await getTranslations('General');

  return {
    title: `${t('home')} - ${PLATFORM_BRAND_NAME}`,
    description: PLATFORM_DESCRIPTION,
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
      title: `${t('home')} - ${PLATFORM_BRAND_NAME}`,
      description: PLATFORM_DESCRIPTION,
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

export default async function PlatformHomePage() {
  return (
    <div className="w-full">
      <PageSuspense fallback={<CourseGridSkeleton />}>
        <LandingContent />
      </PageSuspense>
    </div>
  );
}
