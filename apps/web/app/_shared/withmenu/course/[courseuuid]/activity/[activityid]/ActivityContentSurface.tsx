'use client';

import type { ReactNode } from 'react';
import { Loader2, Minimize2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext';
import CourseEndView from '@components/Pages/Activity/CourseEndView';
import { useTrailCurrent } from '@/features/trail/hooks/useTrail';
import ActivityToolbar from './ActivityToolbar';

const Canva = dynamic(
  () => import('@components/Objects/Editor/views/InteractiveViewer').then((m) => ({ default: m.InteractiveViewer })),
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

export function ActivityContent({ activity, course }: { activity: Activity; course: CourseStructure }) {
  switch (activity.activity_type) {
    case 'TYPE_DYNAMIC': {
      return (
        <Canva
          content={getValidTiptapContent(activity.content)}
          activity={activity}
        />
      );
    }
    case 'TYPE_VIDEO': {
      return (
        <VideoActivity
          course={course}
          activity={activity as any}
        />
      );
    }
    case 'TYPE_DOCUMENT': {
      return (
        <DocumentPdfActivity
          course={course}
          activity={activity}
        />
      );
    }
    default: {
      return <div className="text-muted-foreground text-sm">Unsupported activity type.</div>;
    }
  }
}

export function FocusActivityView({
  activity,
  activityid,
  children,
  course,
  courseuuid,
  onExit,
}: {
  activity: Activity;
  activityid: string;
  children: ReactNode;
  course: CourseStructure;
  courseuuid: string;
  onExit: () => void;
}) {
  const t = useTranslations('ActivityPage');

  return (
    <div className="bg-background fixed inset-0 z-50 overflow-auto">
      <div className="border-border bg-background/95 sticky top-0 z-50 border-b px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{course.name}</p>
            <h1 className="truncate text-sm font-semibold">{activity.name}</h1>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="border-border text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors"
          >
            <Minimize2 size={15} />
            {t('exitFocusMode')}
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
      <div className="border-border bg-background/95 sticky bottom-0 border-t px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-6xl">
          <ActivityToolbar
            activity={activity}
            activityid={activityid}
            course={course}
            courseuuid={courseuuid}
            showFocusButton={false}
            showNavigation
          />
        </div>
      </div>
    </div>
  );
}

export function CourseEndPanel({ course, courseuuid }: { course: CourseStructure; courseuuid: string }) {
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
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
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
