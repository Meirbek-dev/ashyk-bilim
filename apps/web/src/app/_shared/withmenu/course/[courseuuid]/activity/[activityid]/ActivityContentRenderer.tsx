'use client';

import { ClipboardList, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext';
import CourseEndView from '@components/Pages/Activity/CourseEndView';
import { Button } from '@/components/ui/button';
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

const FileSubmissionActivity = dynamic(() => import('@/features/file-submissions/student/FileSubmissionActivity'), {
  loading: () => <LoadingFallback />,
  ssr: false,
});

export function ActivityContentRenderer({
  activity,
  assessmentUrl,
  canView,
  course,
  courseuuid,
  isCourseEnd,
}: {
  activity: Activity | null;
  assessmentUrl: string | null;
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
        <div className="mx-auto w-full max-w-4xl">
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
        <section className="border-border bg-background min-h-[70vh] overflow-hidden rounded-lg border">
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
          <FileSubmissionActivity
            course={course}
            activity={activity}
          />
        </section>
      );
    }
    case 'TYPE_EXAM':
    case 'TYPE_CODE_CHALLENGE':
    case 'TYPE_CUSTOM': {
      return (
        <AssessmentHandoff
          assessmentUrl={assessmentUrl}
          type={activity.activity_type}
        />
      );
    }
    default: {
      return (
        <div className="border-border bg-muted/30 rounded-lg border p-6 text-sm text-muted-foreground">
          {t('unsupportedActivityType', { type: activity.activity_type ?? 'unknown' })}
        </div>
      );
    }
  }
}

function AssessmentHandoff({ assessmentUrl, type }: { assessmentUrl: string | null; type: string }) {
  const t = useTranslations('ActivityPage');
  return (
    <div className="mx-auto flex min-h-[28rem] max-w-2xl flex-col items-center justify-center gap-5 text-center">
      <div className="bg-muted flex size-14 items-center justify-center rounded-lg">
        <ClipboardList className="size-7 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{getAssessmentTitle(type, t)}</h2>
        <p className="text-muted-foreground text-sm leading-6">{t('assessmentDescription')}</p>
      </div>
      {assessmentUrl ? (
        <Button
          nativeButton={false}
          render={<Link href={assessmentUrl} />}
          size="lg"
        >
          {t('openAssessment')}
        </Button>
      ) : (
        <p className="border-border bg-muted/30 rounded-md border px-3 py-2 text-sm text-muted-foreground">
          {t('assessmentUnavailable')}
        </p>
      )}
    </div>
  );
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

function getAssessmentTitle(type: string, t: (key: string) => string): string {
  if (type === 'TYPE_CODE_CHALLENGE') return t('activityTypes.codeChallenge');
  if (type === 'TYPE_CUSTOM') return t('activityTypes.learningMaterial');
  return t('assessmentTitle');
}

function getValidTiptapContent(content: any): any {
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch {
      return { type: 'doc', content: [{ type: 'paragraph' }] };
    }
  }
  if (content && typeof content === 'object' && content.type === 'doc' && Array.isArray(content.content)) {
    return content;
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}
