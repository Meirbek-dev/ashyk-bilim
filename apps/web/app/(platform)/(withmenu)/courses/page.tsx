import { PLATFORM_BRAND_NAME, PLATFORM_DESCRIPTION } from '@/lib/constants';
import { getPlatformThumbnailImage } from '@services/media/media';
import { getCourses } from '@services/courses/courses';
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import type { Metadata } from 'next';

import Courses from '@/app/_shared/withmenu/courses/courses';

interface MetadataProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(_props: MetadataProps): Promise<Metadata> {
  const t = await getTranslations('General');

  return {
    title: `${t('courses')} - ${PLATFORM_BRAND_NAME}`,
    description: PLATFORM_DESCRIPTION,
    keywords: `${PLATFORM_BRAND_NAME}, ${PLATFORM_DESCRIPTION}, ${t('courses')}, ${t('learning')}, ${t('education')}, ${t('onlineLearning')}, ${t('edu')}, ${t('onlineCourses')}, ${PLATFORM_BRAND_NAME} ${t('courses')}`,
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
      title: `${t('courses')} - ${PLATFORM_BRAND_NAME}`,
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

export default async function PlatformCoursesPage() {
  await connection();
  const { courses, total } = await getCourses();

  return (
    <div>
      <Courses
        courses={courses}
        totalCourses={total}
      />
    </div>
  );
}
