'use client';

import dynamic from 'next/dynamic';

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext';
import { ActivityAIChatProvider } from '@components/Contexts/AI/ActivityAIChatContext';
import { CourseProvider } from '@components/Contexts/CourseContext';
import StudentActivityWorkspace from '@/features/student-activity/shell/StudentActivityWorkspace';
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime';
import { ActivityLayoutProvider } from '@/features/assessments/shell/ActivityLayoutContext';
import { ActivityContentRenderer } from './ActivityContentRenderer';

const AIActivityAsk = dynamic(() => import('@components/Objects/Activities/AI/AIActivityAsk'), { ssr: false });

interface ActivityClientProps {
  activityid: string;
  courseuuid: string;
  activity: Activity | null;
  course: CourseStructure;
  runtime: StudentActivityRuntime | null;
}

export default function ActivityClient({ activityid, courseuuid, activity, course, runtime }: ActivityClientProps) {
  const resolvedRuntime = runtime ?? buildCourseEndRuntime(course);

  return (
    <CourseProvider courseuuid={course.course_uuid}>
      <ActivityAIChatProvider activityUuid={activity?.activity_uuid ?? ''}>
        <ActivityLayoutProvider>
          <StudentActivityWorkspace
            activity={activity}
            courseUuid={courseuuid}
            onAskAi={activity ? <AIActivityAsk activity={activity} /> : null}
            runtime={resolvedRuntime}
          >
            <ActivityContentRenderer
              activity={activity}
              canView={resolvedRuntime.permissions.can_view}
              course={course}
              courseuuid={courseuuid}
              isCourseEnd={activityid === 'end'}
            />
          </StudentActivityWorkspace>
        </ActivityLayoutProvider>
      </ActivityAIChatProvider>
    </CourseProvider>
  );
}

function buildCourseEndRuntime(course: CourseStructure): StudentActivityRuntime {
  const outline = (course.chapters ?? []).map((chapter: any, chapterIndex: number) => ({
    id: Number(chapter.id ?? chapterIndex),
    title: chapter.name ?? `Chapter ${chapterIndex + 1}`,
    index: chapterIndex,
    activities: (chapter.activities ?? []).map((activity: any) => ({
      id: Number(activity.id ?? 0),
      uuid: activity.activity_uuid ?? '',
      title: activity.name ?? '',
      type: activity.activity_type ?? '',
      published: activity.published === true,
      complete: true,
      state: 'complete' as const,
    })),
  }));

  return {
    course: {
      id: Number((course as any).id ?? 0),
      uuid: course.course_uuid,
      title: course.name ?? '',
      public: Boolean((course as any).public),
    },
    activity: null,
    content: null,
    outline,
    permissions: {
      is_authenticated: true,
      can_view: true,
      can_contribute: false,
      can_update: false,
    },
    policy: null,
    previous: null,
    next: null,
    primary_action: {
      id: 'back_to_course',
      enabled: true,
      reason: null,
      target_activity_uuid: null,
    },
    progress: {
      state: 'course_end',
      canonical_state: null,
      complete: true,
      score: null,
      passed: null,
      due_at: null,
      is_late: false,
      teacher_action_required: false,
      attempt_count: 0,
      latest_submission_uuid: null,
      latest_submission_status: null,
      submitted_at: null,
      graded_at: null,
      completed_at: null,
      status_reason: null,
    },
  };
}
