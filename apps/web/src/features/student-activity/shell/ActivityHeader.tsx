'use client';

import { useEffect, useMemo, useState } from 'react';
import { Focus, ListTree, PanelLeftClose } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Link from '@components/ui/AppLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime';
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext';
import ActivityOutlineContent from './ActivityOutlineContent';

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanUuid(uuid: string | null | undefined, prefix: 'course_' | 'activity_') {
  return uuid?.replace(new RegExp(`^${prefix}`), '') ?? '';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActivityStatusBadge({ state }: { state: string }) {
  const t = useTranslations('ActivityPage');
  const complete = state === 'complete' || state === 'passed' || state === 'published';
  const attention = state === 'returned' || state === 'failed' || state === 'locked' || state === 'unavailable';
  const label = (() => {
    switch (state) {
      case 'complete':
      case 'passed':
        return t('statusComplete');
      case 'in_progress':
      case 'viewed':
        return t('continueActivity');
      case 'draft':
        return t('draft');
      case 'submitted':
      case 'needs_grading':
        return t('submitted');
      case 'returned':
        return t('needsRevision');
      case 'graded_hidden':
        return t('statusGradingInProgress');
      case 'published':
        return t('viewResult');
      case 'failed':
        return t('failed');
      case 'locked':
        return t('accessBlocked');
      case 'attempt_exhausted':
        return t('attemptExhausted');
      case 'unavailable':
        return t('unpublishedActivity');
      case 'course_end':
        return t('courseComplete');
      default:
        return t('notStarted');
    }
  })();
  return <Badge variant={attention ? 'destructive' : complete ? 'default' : 'secondary'}>{label}</Badge>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ActivityHeaderProps {
  runtime: StudentActivityRuntime;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  onToggleOutline: () => void;
  outlineOpen: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Single-line 44px sticky header (h-11).
 *
 * Left:  [≡ outline toggle] breadcrumb › title · status badge
 * Right: position counter · focus toggle
 *
 * Progress fill: absolute 3px bar at bottom edge (no separate row).
 *
 * In ACTIVE_ATTEMPT mode the header collapses to breadcrumb + title only.
 */
export default function ActivityHeader({
  runtime,
  focusMode,
  onToggleFocusMode,
  onToggleOutline,
  outlineOpen,
}: ActivityHeaderProps) {
  const t = useTranslations('ActivityPage');
  const { mode } = useActivityLayout();
  const isAttemptActive = mode === 'ACTIVE_ATTEMPT';

  const position = useMemo(() => {
    if (!runtime.activity) return null;
    const items = (runtime.outline ?? []).flatMap((ch) => ch.activities ?? []);
    const index = items.findIndex((item) => item.id === runtime.activity?.id);
    return { current: index >= 0 ? index + 1 : 1, total: items.length || 1 };
  }, [runtime.activity, runtime.outline]);

  const percent = useMemo(() => {
    const items = (runtime.outline ?? []).flatMap((ch) => ch.activities ?? []);
    if (items.length === 0) return 0;
    const done = items.filter((i) => i.complete || i.state === 'complete' || i.state === 'passed').length;
    return Math.round((done / items.length) * 100);
  }, [runtime.outline]);

  const courseHref = `/course/${cleanUuid(runtime.course.uuid, 'course_')}`;

  return (
    <header className="border-border/70 bg-background/95 sticky top-14 z-30 border-b backdrop-blur">
      <div className="relative flex h-11 items-center gap-2 px-3 sm:px-4">
        {/* Left group */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {/* Outline toggle — desktop; Sheet trigger — mobile */}
          {!isAttemptActive ? (
            <>
              {/* Desktop toggle */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleOutline}
                aria-label={t('courseContent')}
                className="hidden shrink-0 lg:flex"
              >
                {outlineOpen ? <PanelLeftClose className="size-4" /> : <ListTree className="size-4" />}
              </Button>

              {/* Mobile sheet trigger */}
              <MobileOutlineSheet runtime={runtime} />
            </>
          ) : null}

          {/* Breadcrumb */}
          <nav
            aria-label="breadcrumb"
            className="flex min-w-0 items-center gap-1 text-xs"
          >
            <Link
              href={courseHref}
              className="text-muted-foreground hover:text-foreground min-w-0 max-w-[8rem] truncate"
            >
              {runtime.course.title}
            </Link>
            {runtime.activity?.chapter_title ? (
              <>
                <span className="text-muted-foreground shrink-0">/</span>
                <span className="text-muted-foreground min-w-0 max-w-[8rem] truncate">
                  {runtime.activity.chapter_title}
                </span>
              </>
            ) : null}
            <span className="text-muted-foreground shrink-0">/</span>
            <span className="text-foreground min-w-0 max-w-[20rem] truncate font-medium">
              {runtime.activity?.title ?? runtime.course.title}
            </span>
          </nav>

          {/* Status badge — hidden on mobile to save space */}
          {!isAttemptActive && runtime.progress.state !== 'not_started' ? (
            <span className="hidden sm:block">
              <ActivityStatusBadge state={runtime.progress.state} />
            </span>
          ) : null}
        </div>

        {/* Right group */}
        {!isAttemptActive ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {position ? (
              <span className="text-muted-foreground hidden text-xs tabular-nums sm:block">
                {t('activityCounter', { current: position.current, total: position.total })}
              </span>
            ) : null}
            <Button
              type="button"
              variant={focusMode ? 'default' : 'ghost'}
              size="icon"
              onClick={onToggleFocusMode}
              aria-label={focusMode ? t('exitFocusMode') : t('focusMode')}
              title={focusMode ? t('exitFocusMode') : t('focusMode')}
            >
              {focusMode ? <PanelLeftClose className="size-4" /> : <Focus className="size-4" />}
            </Button>
          </div>
        ) : null}

        {/* 3px progress fill bar at bottom of header */}
        {!isAttemptActive ? (
          <div
            className="bg-primary absolute inset-x-0 bottom-0 h-[3px] transition-[width] duration-500"
            style={{ width: `${percent}%` }}
            aria-hidden
          />
        ) : null}
      </div>
    </header>
  );
}

// ── Mobile outline sheet ──────────────────────────────────────────────────────

function MobileOutlineSheet({ runtime }: { runtime: StudentActivityRuntime }) {
  const t = useTranslations('ActivityPage');
  return (
    <Sheet>
      <SheetTrigger
        render={(triggerProps: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            aria-label={t('courseContent')}
            {...triggerProps}
          >
            <ListTree className="size-4" />
          </Button>
        )}
      />
      <SheetContent
        side="left"
        className="w-[min(92vw,22rem)] p-0"
      >
        <SheetHeader className="px-4 pt-4">
          <SheetTitle>{t('courseContent')}</SheetTitle>
        </SheetHeader>
        <ActivityOutlineContent
          runtime={runtime}
          className="mt-2 flex-1 overflow-y-auto"
        />
      </SheetContent>
    </Sheet>
  );
}
