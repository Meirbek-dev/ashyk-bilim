'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Code2,
  FileText,
  Focus,
  Layers,
  ListTree,
  Loader2,
  PanelLeftClose,
  PanelRightOpen,
  Video,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext';
import { ActivityAIChatProvider } from '@components/Contexts/AI/ActivityAIChatContext';
import { CourseProvider } from '@components/Contexts/CourseContext';
import Link from '@components/ui/AppLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { useSession } from '@/hooks/useSession';
import { ActivityLayoutProvider, useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext';
import { cn } from '@/lib/utils';
import { useTrailCurrent } from '@/features/trail/hooks/useTrail';
import { ActivityContentRenderer } from './ActivityContentRenderer';
import {
  type ActivityNavItem,
  type StudentActivityViewModel,
  buildStudentActivityViewModel,
} from './activity-view-model';
import { useActivityCompletion } from './useActivityCompletion';

const AIActivityAsk = dynamic(() => import('@components/Objects/Activities/AI/AIActivityAsk'), { ssr: false });

interface ActivityClientProps {
  activityid: string;
  assessmentUuid?: string | null;
  courseuuid: string;
  activity: Activity | null;
  course: CourseStructure;
}

export default function ActivityClient({ activityid, assessmentUuid, courseuuid, activity, course }: ActivityClientProps) {
  const { isAuthenticated } = useSession();
  const { contributorStatus } = useContributorStatus(course.course_uuid);
  const { data: trailData } = useTrailCurrent({ enabled: isAuthenticated });
  const canContribute = contributorStatus === 'ACTIVE';
  const vm = useMemo(
    () =>
      buildStudentActivityViewModel({
        activity,
        activityId: activityid,
        assessmentUuid,
        canContribute,
        course,
        isAuthenticated,
        trailData,
      }),
    [activity, activityid, assessmentUuid, canContribute, course, isAuthenticated, trailData],
  );

  return (
    <CourseProvider courseuuid={course.course_uuid}>
      <ActivityAIChatProvider activityUuid={activity?.activity_uuid ?? ''}>
        <ActivityLayoutProvider>
          <StudentActivityPageShell
            activity={activity}
            assessmentUuid={assessmentUuid ?? null}
            course={course}
            courseuuid={courseuuid}
            vm={vm}
          />
        </ActivityLayoutProvider>
      </ActivityAIChatProvider>
    </CourseProvider>
  );
}

function StudentActivityPageShell({
  activity,
  assessmentUuid,
  course,
  courseuuid,
  vm,
}: {
  activity: Activity | null;
  assessmentUuid: string | null;
  course: CourseStructure;
  courseuuid: string;
  vm: StudentActivityViewModel;
}) {
  const [readingMode, setReadingMode] = useState(false);
  const { mode } = useActivityLayout();
  const isAttemptActive = mode === 'ACTIVE_ATTEMPT';

  // Sync reading-mode focus state via data attribute — no localStorage or CustomEvent
  useEffect(() => {
    if (isAttemptActive) return; // ACTIVE_ATTEMPT already sets its own data-layout-mode
    document.documentElement.dataset.layoutMode = readingMode ? 'focus' : 'content';
  }, [readingMode, isAttemptActive]);

  useEffect(() => {
    if (!readingMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReadingMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readingMode]);

  const isFullWidth = isAttemptActive || readingMode;

  return (
    <div className="bg-background text-foreground min-h-[calc(100dvh-4rem)]">
      {!isAttemptActive ? (
        <ActivityHeader
          onToggleReadingMode={() => setReadingMode((value) => !value)}
          readingMode={readingMode}
          vm={vm}
        />
      ) : null}
      <main
        className={cn(
          'mx-auto grid w-full max-w-[100rem] gap-6 px-4 pb-28 pt-4 sm:px-6 lg:px-8',
          isFullWidth ? 'grid-cols-1' : 'lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_19rem]',
          isAttemptActive && 'max-w-none px-0 pb-0 pt-0 sm:px-0 lg:px-0',
        )}
      >
        {!isFullWidth ? (
          <aside className="hidden lg:block">
            <ActivityOutline
              vm={vm}
              className="sticky top-20 max-h-[calc(100dvh-6rem)]"
            />
          </aside>
        ) : null}

        <section
          id="activity-main-content"
          className={cn('min-w-0', isAttemptActive && 'w-full')}>
          {readingMode && !isAttemptActive ? (
            <ReadingModeBar
              onExit={() => setReadingMode(false)}
              vm={vm}
            />
          ) : null}
          <ActivityContentRenderer
            activity={activity}
            assessmentUuid={assessmentUuid}
            canView={vm.permissions.canView}
            course={course}
            courseuuid={courseuuid}
            isCourseEnd={vm.state.isCourseEnd}
          />
        </section>

        {!isFullWidth ? (
          <aside className="hidden xl:block">
            <ActivityActionPanel
              activity={activity}
              onToggleReadingMode={() => setReadingMode(true)}
              vm={vm}
            />
          </aside>
        ) : null}
      </main>
      {!isAttemptActive ? (
        <ActivityMobileActionBar
          activity={activity}
          vm={vm}
        />
      ) : null}
    </div>
  );
}

function ActivityHeader({
  onToggleReadingMode,
  readingMode,
  vm,
}: {
  onToggleReadingMode: () => void;
  readingMode: boolean;
  vm: StudentActivityViewModel;
}) {
  const t = useTranslations('ActivityPage');
  return (
    <header className="border-border/70 bg-background/95 sticky top-14 z-30 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-[100rem] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0 space-y-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Link
              href={`/course/${vm.course.cleanUuid}`}
              className="hover:text-foreground truncate"
            >
              {vm.course.title}
            </Link>
            {vm.chapterTitle ? (
              <>
                <span>/</span>
                <span className="truncate">{vm.chapterTitle}</span>
              </>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-[52rem] truncate text-lg font-semibold tracking-tight sm:text-xl">
              {vm.state.isCourseEnd ? t('courseComplete') : vm.title}
            </h1>
            <ActivityStatusBadge status={vm.status} />
          </div>
          {!vm.state.isCourseEnd && vm.activity ? (
            <p className="text-muted-foreground text-xs">
              {t('activityCounter', {
                current: vm.activity.absoluteIndex + 1,
                total: vm.progress.totalActivities,
              })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MobileOutlineButton vm={vm} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onToggleReadingMode}
            aria-label={readingMode ? t('exitFocusMode') : t('focusMode')}
            title={readingMode ? t('exitFocusMode') : t('focusMode')}
          >
            {readingMode ? <PanelRightOpen className="size-4" /> : <Focus className="size-4" />}
          </Button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[100rem] px-4 pb-3 sm:px-6 lg:px-8">
        <ActivityProgressSummary vm={vm} />
      </div>
    </header>
  );
}

function ActivityProgressSummary({ vm }: { vm: StudentActivityViewModel }) {
  const t = useTranslations('ActivityPage');
  const percent =
    vm.progress.totalActivities > 0
      ? Math.round((vm.progress.completedActivities / vm.progress.totalActivities) * 100)
      : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="bg-muted h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {t('activityCounter', {
          current: vm.progress.completedActivities,
          total: vm.progress.totalActivities,
        })}
      </span>
    </div>
  );
}

function ActivityOutline({ className, vm }: { className?: string; vm: StudentActivityViewModel }) {
  const t = useTranslations('ActivityPage');
  return (
    <nav
      aria-label={t('courseContent')}
      className={cn('border-border bg-background overflow-hidden rounded-lg border', className)}
    >
      <div className="border-border flex items-center gap-2 border-b px-3 py-3">
        <ListTree className="size-4 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t('courseContent')}</p>
          <p className="text-muted-foreground text-xs">
            {vm.progress.completedActivities}/{vm.progress.totalActivities}
          </p>
        </div>
      </div>
      <ScrollArea className="h-full">
        <div className="space-y-4 p-3">
          {vm.progress.chapters.map((chapter) => (
            <section
              key={chapter.id ?? chapter.index}
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="truncate text-xs font-medium text-muted-foreground">
                  {chapter.index + 1}. {chapter.title}
                </p>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {chapter.completeCount}/{chapter.totalCount}
                </span>
              </div>
              <div className="space-y-1">
                {chapter.activities.map((item) => (
                  <ActivityOutlineItem
                    key={item.uuid || item.cleanUuid}
                    item={item}
                    vm={vm}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    </nav>
  );
}

function ActivityOutlineItem({ item, vm }: { item: ActivityNavItem; vm: StudentActivityViewModel }) {
  const current = item.cleanUuid === vm.activity?.cleanUuid;
  const href = `/course/${vm.course.cleanUuid}/activity/${item.cleanUuid}`;
  const Icon = getActivityIcon(item.type);
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'group flex min-h-10 items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        current ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          item.complete ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
        )}
      >
        {item.complete ? <Check className="size-3" /> : <Icon className="size-3" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {current ? <span className="bg-primary size-1.5 rounded-full" /> : null}
    </Link>
  );
}

function ActivityActionPanel({
  activity,
  onToggleReadingMode,
  vm,
}: {
  activity: Activity | null;
  onToggleReadingMode: () => void;
  vm: StudentActivityViewModel;
}) {
  const t = useTranslations('ActivityPage');
  const completion = useActivityCompletion(vm);
  return (
    <div className="sticky top-24 space-y-3">
      <section className="border-border bg-background rounded-lg border p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t('status')}</p>
            <p className="text-muted-foreground text-xs">{getStatusLabel(vm.status, t)}</p>
          </div>
          <ActivityStatusIcon status={vm.status} />
        </div>
        <PrimaryAction
          completion={completion}
          vm={vm}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NavButton
            item={vm.progress.previous}
            label={t('previous')}
            side="prev"
            vm={vm}
          />
          <NavButton
            item={vm.progress.next}
            label={t('next')}
            side="next"
            vm={vm}
          />
        </div>
      </section>
      <section className="border-border bg-background rounded-lg border p-4">
        <p className="mb-3 text-sm font-semibold">{t('support')}</p>
        <div className="grid gap-2">
          {activity && vm.permissions.canView ? <AIActivityAsk activity={activity} /> : null}
          <Button
            type="button"
            variant="outline"
            onClick={onToggleReadingMode}
          >
            <Focus className="size-4" />
            {t('focusMode')}
          </Button>
        </div>
      </section>
    </div>
  );
}

function PrimaryAction({
  completion,
  vm,
}: {
  completion: ReturnType<typeof useActivityCompletion>;
  vm: StudentActivityViewModel;
}) {
  const t = useTranslations('ActivityPage');
  const router = useRouter();

  if (vm.state.isCourseEnd) {
    return (
      <Button
        className="w-full"
        nativeButton={false}
        render={<Link href={`/course/${vm.course.cleanUuid}`} />}
      >
        {t('backToCourse')}
      </Button>
    );
  }

  if (vm.progress.currentComplete && vm.progress.next) {
    return (
      <Button
        className="w-full"
        onClick={() => router.push(`/course/${vm.course.cleanUuid}/activity/${vm.progress.next?.cleanUuid}`)}
      >
        {t('next')}
        <ChevronRight className="size-4" />
      </Button>
    );
  }

  if (completion.canMarkComplete) {
    return (
      <Button
        className="w-full"
        onClick={vm.progress.currentComplete ? completion.unmarkComplete : completion.markComplete}
        disabled={completion.isPending}
      >
        {completion.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        {vm.progress.currentComplete ? t('statusComplete') : t('markAsComplete')}
      </Button>
    );
  }

  return (
    <Button
      className="w-full"
      variant="secondary"
      disabled
    >
      {t('noAction')}
    </Button>
  );
}

function ActivityMobileActionBar({ activity, vm }: { activity: Activity | null; vm: StudentActivityViewModel }) {
  const completion = useActivityCompletion(vm);
  const t = useTranslations('ActivityPage');
  const router = useRouter();
  const { mode } = useActivityLayout();

  const isAssessmentType =
    activity?.activity_type === 'TYPE_EXAM' ||
    activity?.activity_type === 'TYPE_CODE_CHALLENGE' ||
    activity?.activity_type === 'TYPE_CUSTOM' ||
    activity?.activity_type === 'TYPE_FILE_SUBMISSION';

  function scrollToContent() {
    document.getElementById('activity-main-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t p-3 backdrop-blur xl:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <NavIconButton
          item={vm.progress.previous}
          side="prev"
          vm={vm}
        />
        <div className="min-w-0 flex-1">
          {completion.canMarkComplete ? (
            <Button
              className="w-full"
              onClick={vm.progress.currentComplete ? completion.unmarkComplete : completion.markComplete}
              disabled={completion.isPending}
            >
              {completion.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {vm.progress.currentComplete ? t('statusComplete') : t('markAsComplete')}
            </Button>
          ) : isAssessmentType && mode === 'PREFLIGHT' ? (
            <Button
              className="w-full"
              onClick={scrollToContent}
            >
              <Layers className="size-4" />
              {t('viewAssessment')}
            </Button>
          ) : isAssessmentType && mode === 'RESULT' ? (
            <Button
              className="w-full"
              variant="outline"
              onClick={scrollToContent}
            >
              <CheckCircle2 className="size-4" />
              {t('viewResult')}
            </Button>
          ) : activity && vm.progress.next ? (
            <Button
              className="w-full"
              onClick={() => router.push(`/course/${vm.course.cleanUuid}/activity/${vm.progress.next?.cleanUuid}`)}
            >
              {t('next')}
            </Button>
          ) : (
            <Button
              className="w-full"
              disabled
              variant="secondary"
            >
              {t('noAction')}
            </Button>
          )}
        </div>
        <NavIconButton
          item={vm.progress.next}
          side="next"
          vm={vm}
        />
      </div>
    </div>
  );
}

function MobileOutlineButton({ vm }: { vm: StudentActivityViewModel }) {
  const t = useTranslations('ActivityPage');
  return (
    <Sheet>
      <SheetTrigger
        render={(triggerProps) => (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={t('courseContent')}
            {...triggerProps}
          >
            <ListTree className="size-4" />
          </Button>
        )}
      />
      <SheetContent
        side="left"
        className="w-[min(92vw,24rem)] p-0"
      >
        <SheetHeader>
          <SheetTitle>{t('courseContent')}</SheetTitle>
        </SheetHeader>
        <ActivityOutline
          vm={vm}
          className="mx-4 mb-4 flex-1"
        />
      </SheetContent>
    </Sheet>
  );
}

function ReadingModeBar({ onExit, vm }: { onExit: () => void; vm: StudentActivityViewModel }) {
  const t = useTranslations('ActivityPage');
  return (
    <div className="border-border bg-muted/30 mb-4 flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-muted-foreground truncate text-xs">{vm.course.title}</p>
        <p className="truncate text-sm font-medium">{vm.title}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onExit}
      >
        <PanelLeftClose className="size-4" />
        {t('exitFocusMode')}
      </Button>
    </div>
  );
}

function NavButton({
  item,
  label,
  side,
  vm,
}: {
  item: ActivityNavItem | null;
  label: string;
  side: 'next' | 'prev';
  vm: StudentActivityViewModel;
}) {
  if (!item) {
    return (
      <Button
        variant="secondary"
        disabled
      >
        {label}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={<Link href={`/course/${vm.course.cleanUuid}/activity/${item.cleanUuid}`} />}
    >
      {side === 'prev' ? <ChevronLeft className="size-4" /> : null}
      <span className="truncate">{label}</span>
      {side === 'next' ? <ChevronRight className="size-4" /> : null}
    </Button>
  );
}

function NavIconButton({
  item,
  side,
  vm,
}: {
  item: ActivityNavItem | null;
  side: 'next' | 'prev';
  vm: StudentActivityViewModel;
}) {
  if (!item) {
    return (
      <Button
        variant="outline"
        size="icon"
        disabled
      >
        {side === 'prev' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="icon"
      nativeButton={false}
      render={<Link href={`/course/${vm.course.cleanUuid}/activity/${item.cleanUuid}`} />}
    >
      {side === 'prev' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </Button>
  );
}

function ActivityStatusBadge({ status }: { status: StudentActivityViewModel['status'] }) {
  const t = useTranslations('ActivityPage');
  return (
    <Badge variant={status === 'complete' || status === 'course_end' ? 'default' : 'secondary'}>
      {getStatusLabel(status, t)}
    </Badge>
  );
}

function ActivityStatusIcon({ status }: { status: StudentActivityViewModel['status'] }) {
  if (status === 'complete' || status === 'course_end') return <CheckCircle2 className="size-5 text-primary" />;
  if (status === 'assessment') return <ClipboardList className="size-5 text-muted-foreground" />;
  return <Circle className="size-5 text-muted-foreground" />;
}

function getStatusLabel(status: StudentActivityViewModel['status'], t: (key: string) => string): string {
  switch (status) {
    case 'course_end':
      return t('courseComplete');
    case 'complete':
      return t('statusComplete');
    case 'assessment':
      return t('assessmentTitle');
    case 'submitted':
      return t('submitted');
    case 'needs_revision':
      return t('needsRevision');
    case 'unavailable':
      return t('unpublishedActivity');
    default:
      return t('notStarted');
  }
}

function getActivityIcon(type?: string | null) {
  switch (type) {
    case 'TYPE_VIDEO':
      return Video;
    case 'TYPE_DOCUMENT':
      return FileText;
    case 'TYPE_FILE_SUBMISSION':
      return FileArchive;
    case 'TYPE_EXAM':
      return ClipboardList;
    case 'TYPE_CODE_CHALLENGE':
      return Code2;
    case 'TYPE_DYNAMIC':
      return Layers;
    default:
      return BookOpen;
  }
}
