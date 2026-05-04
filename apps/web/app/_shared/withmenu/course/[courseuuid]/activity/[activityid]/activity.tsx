'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext';
import { CourseProvider } from '@components/Contexts/CourseContext';
import { ActivityAIChatProvider } from '@components/Contexts/AI/ActivityAIChatContext';
import ActivityIndicators from '@components/Pages/Courses/ActivityIndicators';
import FixedActivitySecondaryBar from '@components/Pages/Activity/FixedActivitySecondaryBar';
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper';
import { CourseBreadcrumbs } from '@/components/ui/app-breadcrumbs';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { buildCourseActivityIndex, normalizeActivityUuid } from '@/lib/course-activity-index';
import { ActivityContent, CourseEndPanel, FocusActivityView, LoadingFallback } from './ActivityContentSurface';
import ActivityToolbar from './ActivityToolbar';

interface ActivityClientProps {
  activityid: string;
  courseuuid: string;
  activity: Activity | null;
  course: CourseStructure;
}

export default function ActivityClient({ activityid, courseuuid, activity, course }: ActivityClientProps) {
  const t = useTranslations('ActivityPage');
  const { contributorStatus } = useContributorStatus(courseuuid);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const canView = activity ? activity.published === true || contributorStatus === 'ACTIVE' : false;
  const cleanActivityId = normalizeActivityUuid(activityid);
  const activityIndex = useMemo(() => buildCourseActivityIndex<Activity>(course.chapters), [course.chapters]);
  const currentEntry = activityIndex.allActivities[activityIndex.indexByCleanUuid.get(cleanActivityId) ?? -1];
  const chapterLabel = currentEntry
    ? `${t('chapter')} ${currentEntry.chapterIndex + 1} : ${currentEntry.chapterName ?? ''}`
    : null;

  useEffect(() => {
    const saved = globalThis.localStorage?.getItem('globalFocusMode');
    setIsFocusMode(saved === 'true');
  }, []);

  const setFocusMode = (next: boolean) => {
    setIsFocusMode(next);
    globalThis.localStorage?.setItem('globalFocusMode', String(next));
    globalThis.dispatchEvent?.(new CustomEvent('focusModeChange', { detail: { isFocusMode: next } }));
  };

  const isAssessable = activity
    ? activity.activity_type === 'TYPE_ASSIGNMENT' ||
      activity.activity_type === 'TYPE_EXAM' ||
      activity.activity_type === 'TYPE_CODE_CHALLENGE'
    : false;

  const body =
    activityid === 'end' ? (
      <CourseEndPanel
        course={course}
        courseuuid={courseuuid}
      />
    ) : activity && canView ? (
      <ActivityContent
        activity={activity}
        course={course}
      />
    ) : (
      <div className="border-border bg-muted/30 rounded-lg border p-7">
        <p className="text-muted-foreground text-sm font-medium">{t('activityNotPublished')}</p>
      </div>
    );

  return (
    <CourseProvider courseuuid={course.course_uuid}>
      <ActivityAIChatProvider activityUuid={activity?.activity_uuid ?? ''}>
        {isFocusMode && activity && canView ? (
          <FocusActivityView
            activity={activity}
            course={course}
            courseuuid={courseuuid}
            activityid={activityid}
            onExit={() => setFocusMode(false)}
          >
            {body}
          </FocusActivityView>
        ) : (
          <GeneralWrapper>
            <div className="space-y-4 pt-2">
              {activityid !== 'end' ? (
                <>
                  <CourseBreadcrumbs
                    course={{ ...course, name: course.name ?? '' }}
                    activity={activity ? { ...activity, name: activity.name ?? '' } : { name: '' }}
                  />
                  <header className="space-y-4 pb-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                          {activity?.name ?? ''}
                        </h1>
                        <p className="text-muted-foreground mt-0.5 text-sm">{chapterLabel}</p>
                      </div>
                      {activity && canView ? (
                        <ActivityToolbar
                          activity={activity}
                          activityid={activityid}
                          course={course}
                          courseuuid={courseuuid}
                          showFocusButton={!isAssessable}
                          showMarkComplete={!isAssessable}
                          showNavigation={false}
                          onEnterFocus={() => setFocusMode(true)}
                        />
                      ) : null}
                    </div>
                    <ActivityIndicators
                      course_uuid={courseuuid}
                      current_activity={activityid}
                      course={course}
                      enableNavigation
                    />
                  </header>
                </>
              ) : null}

              <Suspense fallback={<LoadingFallback />}>
                <div className="border-border relative rounded-lg border p-7">{body}</div>
              </Suspense>

              {activity && canView ? (
                <>
                  <ActivityToolbar
                    activity={activity}
                    activityid={activityid}
                    course={course}
                    courseuuid={courseuuid}
                    showFocusButton={false}
                    showMarkComplete
                  />
                  <FixedActivitySecondaryBar
                    course={course}
                    currentActivityId={activityid}
                    activity={activity}
                  />
                </>
              ) : null}
              <div className="h-[100px]" />
            </div>
          </GeneralWrapper>
        )}
      </ActivityAIChatProvider>
    </CourseProvider>
  );
}
