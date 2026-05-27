import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { getCourseMetadata } from '@services/courses/courses';
import { getSession } from '@/lib/auth/session';
import { PLATFORM_BRAND_NAME } from '@/lib/constants';
import { cache } from 'react';
import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { courseDiscussionsQueryOptions } from '@/features/courses/queries/course.query';
import { trailCurrentQueryOptions } from '@/features/courses/queries/course.query';

import CourseClient from './course';

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

  // SEO
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

const CoursePage = async (params: any) => {
  const { courseuuid } = await params.params;

  const [course_meta, session] = await Promise.all([fetchCourseMetadata(courseuuid), getSession()]);

  const queryClient = new QueryClient();

  if (session?.user && course_meta?.course_uuid) {
    // Prefetch data that CourseClient fetches client-side so the page renders
    // without loading spinners and avoids a client-side waterfall.
    await Promise.all([
      queryClient.prefetchQuery(
        courseDiscussionsQueryOptions(course_meta.course_uuid, { includeReplies: true, limit: 50, offset: 0 }),
      ),
      queryClient.prefetchQuery(trailCurrentQueryOptions()),
    ]);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CourseClient
        courseuuid={courseuuid}
        course={course_meta}
      />
    </HydrationBoundary>
  );
};

export default CoursePage;
