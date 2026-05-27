import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { getCourseMetadata } from '@services/courses/courses';
import { getCourseDiscussions } from '@services/courses/discussions';
import { getCurrentTrail } from '@services/courses/activity';
import { getSession } from '@/lib/auth/session';
import { PLATFORM_BRAND_NAME } from '@/lib/constants';
import { cache } from 'react';
import type { Metadata } from 'next';

import CourseClient from '@/app/_shared/withmenu/course/[courseuuid]/course';

interface MetadataProps {
  params: Promise<{ courseuuid: string }>;
}

const fetchCourseMetadata = cache(async (courseuuid: string) => {
  const session = await getSession();
  return await getCourseMetadata(courseuuid, undefined, !!session);
});

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params;
  const course_meta = await fetchCourseMetadata(params.courseuuid);

  return {
    title: `${course_meta.name} - ${PLATFORM_BRAND_NAME}`,
    description: course_meta.description,
    keywords: course_meta.learnings,
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
      title: `${course_meta.name} - ${PLATFORM_BRAND_NAME}`,
      description: course_meta.description || '',
      images: [
        {
          url: getCourseThumbnailMediaDirectory(course_meta?.course_uuid, course_meta?.thumbnail_image),
          width: 800,
          height: 600,
          alt: course_meta.name,
        },
      ],
      type: 'article',
      publishedTime: course_meta.creation_date || '',
      tags: course_meta.learnings || [],
    },
  };
}

export default async function PlatformCoursePage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;

  const [course_meta, session] = await Promise.all([fetchCourseMetadata(courseuuid), getSession()]);

  const [discussions, trailData] = await Promise.all([
    session?.user && course_meta?.course_uuid
      ? getCourseDiscussions(course_meta.course_uuid, true, 50, 0)
      : Promise.resolve([]),
    session?.user ? getCurrentTrail() : Promise.resolve(null),
  ]);

  return (
    <CourseClient
      courseuuid={courseuuid}
      course={course_meta}
      initialDiscussions={discussions}
      trailData={trailData}
    />
  );
}
