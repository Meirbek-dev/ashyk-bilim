import { PLATFORM_BRAND_NAME, PLATFORM_DESCRIPTION } from '@/lib/constants';
import { getEditableCourses } from '@services/courses/courses';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import CoursesHome from '@/app/_shared/dash/courses/client';

interface CourseDashboardSummary {
  total: number;
  ready: number;
  private: number;
  attention: number;
}

const COURSES_PER_PAGE = 24;

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? '';
}

function parseSort(value: string | string[] | undefined): 'updated' | 'name' {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'name' ? 'name' : 'updated';
}

function parsePreset(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const valid = ['all', 'drafts', 'published', 'private', 'recent', 'attention'];
  return valid.includes(raw ?? '') ? (raw ?? 'all') : 'all';
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('General');

  return {
    title: `${t('courses')} - ${PLATFORM_BRAND_NAME}`,
    description: PLATFORM_DESCRIPTION,
    keywords: `${PLATFORM_BRAND_NAME}, ${PLATFORM_DESCRIPTION}, ${t('courses')}, learning, education, online learning, edu, online courses, ${PLATFORM_BRAND_NAME} ${t('courses')}`,
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
    },
  };
}

export default function PlatformDashCoursesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PlatformDashCoursesPageInner searchParams={props.searchParams} />;
}

async function PlatformDashCoursesPageInner(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const currentPage = parsePage(searchParams.page);
  const query = parseQuery(searchParams.q);
  const sortBy = parseSort(searchParams.sort);
  const preset = parsePreset(searchParams.preset);

  const { courses, total, summary } = await getEditableCourses(currentPage, COURSES_PER_PAGE, query, sortBy, preset);

  return (
    <CoursesHome
      courses={courses}
      totalCourses={total}
      currentPage={currentPage}
      searchQuery={query}
      sortBy={sortBy}
      pageSize={COURSES_PER_PAGE}
      preset={preset}
      summaryCounts={summary as CourseDashboardSummary}
    />
  );
}
