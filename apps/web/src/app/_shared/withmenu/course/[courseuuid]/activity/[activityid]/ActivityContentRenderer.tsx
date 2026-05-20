'use client';

import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext';
import { normalizeTiptapJsonContent } from '@components/Objects/Editor/core/editor-content';
import CourseEndView from '@components/Pages/Activity/CourseEndView';
import { useTrailCurrent } from '@/features/trail/hooks/useTrail';

const InteractiveViewer = dynamic(
  () =>
    import('@components/Objects/Editor/views/InteractiveViewer').then((module_) => ({
      default: module_.InteractiveViewer,
    })),
  { loading: () => <LoadingFallback />, ssr: false },
);

const VideoActivity = dynamic(() => import('@components/Objects/Activities/Video/Video'), {
  loading: () => <LoadingFallback />,
  ssr: false,
});

const DocumentPdfActivity = dynamic(() => import('@components/Objects/Activities/DocumentPdf/DocumentPdf'), {
  loading: () => <LoadingFallback />,
  ssr: false,
});

const FileSubmissionWorkspace = dynamic(() => import('@/features/file-submissions/student/FileSubmissionWorkspace'), {
  loading: () => <LoadingFallback />,
  ssr: false,
});

const InlineAssessmentWorkspace = dynamic(() => import('@/features/assessments/shell/InlineAssessmentWorkspace'), {
  loading: () => <LoadingFallback />,
  ssr: false,
});

export function ActivityContentRenderer({
  activity,
  canView,
  course,
  courseuuid,
  isCourseEnd,
}: {
  activity: Activity | null;
  canView: boolean;
  course: CourseStructure;
  courseuuid: string;
  isCourseEnd: boolean;
}) {
  const t = useTranslations('ActivityPage');

  if (isCourseEnd) {
    return (
      <CourseEndPanel
        course={course}
        courseuuid={courseuuid}
      />
    );
  }

  if (!activity || !canView) {
    return (
      <div className="border-border bg-muted/30 rounded-lg border p-6">
        <p className="text-sm font-medium">{t('activityNotPublished')}</p>
      </div>
    );
  }

  switch (activity.activity_type) {
    case 'TYPE_DYNAMIC': {
      return (
        <div className="w-full">
          <InteractiveViewer
            content={getValidTiptapContent(activity.content)}
            activity={activity}
          />
        </div>
      );
    }
    case 'TYPE_VIDEO': {
      return (
        <section className="w-full">
          <VideoActivity
            course={course}
            activity={activity as any}
          />
        </section>
      );
    }
    case 'TYPE_DOCUMENT': {
      return (
        <section className="border-border bg-background h-[calc(100dvh-6.25rem-3.5rem)] overflow-hidden rounded-lg border">
          <DocumentPdfActivity
            course={course}
            activity={activity}
          />
        </section>
      );
    }
    case 'TYPE_FILE_SUBMISSION': {
      return (
        <section className="mx-auto w-full max-w-5xl">
          <FileSubmissionWorkspace
            course={course}
            activity={activity}
          />
        </section>
      );
    }
    case 'TYPE_EXAM':
    case 'TYPE_CODE_CHALLENGE':
    case 'TYPE_CUSTOM': {
      const cleanActivityUuid = activity.activity_uuid?.replace(/^activity_/, '') ?? '';
      return (
        <InlineAssessmentWorkspace
          activityUuid={cleanActivityUuid}
          courseUuid={courseuuid}
        />
      );
    }
    default: {
      return (
        <div className="border-border bg-muted/30 text-muted-foreground rounded-lg border p-6 text-sm">
          {t('unsupportedActivityType', { type: activity.activity_type ?? 'unknown' })}
        </div>
      );
    }
  }
}

function CourseEndPanel({ course, courseuuid }: { course: CourseStructure; courseuuid: string }) {
  const { data: trailData } = useTrailCurrent();
  return (
    <CourseEndView
      courseName={course.name ?? ''}
      courseUuid={courseuuid}
      thumbnailImage={course.thumbnail_image ?? ''}
      course={course}
      trailData={trailData}
    />
  );
}

export function LoadingFallback() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

function getValidTiptapContent(content: unknown) {
  return normalizeTiptapJsonContent(content);
}
