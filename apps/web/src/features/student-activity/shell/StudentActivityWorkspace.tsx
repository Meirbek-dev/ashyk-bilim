'use client';

import { useEffect, useState } from 'react';

import type { Activity } from '@components/Contexts/CourseContext';
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime';
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext';
import ActivityHeader from './ActivityHeader';
import OutlineRail from './OutlineRail';
import BottomActionBar from './BottomActionBar';
import InlineStatusStrip from './InlineStatusStrip';
import LockStateCard from './LockStateCard';

interface StudentActivityWorkspaceProps {
  activity: Activity | null;
  children: React.ReactNode;
  courseUuid: string;
  onAskAi?: React.ReactNode;
  runtime: StudentActivityRuntime;
}

/**
 * StudentActivityWorkspace
 *
 * Top-level student activity shell. Two-zone flex layout:
 *
 *   ┌─ ActivityHeader (sticky, 44px) ────────────────────────────────────────┐
 *   ├─ flex row ─────────────────────────────────────────────────────────────┤
 *   │  OutlineRail (56px collapsed | 280px overlay) | ContentZone (flex-1)   │
 *   └─ BottomActionBar (fixed, 64px) ─────────────────────────────────────────┘
 *
 * Replaces the old xl:grid-cols-[17rem_minmax(0,1fr)_18rem] three-column grid.
 * Deletes: ActivityActionPanel, ActivityMobileActionBar.
 *
 * Layout modes (owned by ActivityLayoutContext):
 * - CONTENT / PREFLIGHT / RESULT: outline rail visible, bottom bar visible
 * - ACTIVE_ATTEMPT: outline rail hidden (CSS), bottom bar hidden
 * - focus (local state): outline rail hidden (CSS), bottom bar hidden (CSS)
 */
export default function StudentActivityWorkspace({
  activity,
  children,
  courseUuid,
  runtime,
}: StudentActivityWorkspaceProps) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const { mode } = useActivityLayout();
  const isAttemptActive = mode === 'ACTIVE_ATTEMPT';

  // Sync focus mode to CSS data attribute (no localStorage, no events)
  useEffect(() => {
    if (isAttemptActive) return;
    document.documentElement.dataset.layoutMode = focusMode ? 'focus' : mode.toLowerCase().replace(/_/g, '-');
  }, [focusMode, isAttemptActive, mode]);

  // Escape key exits focus mode
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  // Keyboard shortcut 'O' toggles outline rail
  useEffect(() => {
    if (isAttemptActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'o' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        setOutlineOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAttemptActive]);

  const isLocked =
    runtime.progress.state === 'locked' || runtime.progress.state === 'unavailable';

  return (
    <div className="bg-background text-foreground flex min-h-[calc(100dvh-3.5rem)] flex-col">
      {/* Header — hidden in ACTIVE_ATTEMPT (AssessmentLayout owns its own header) */}
      {!isAttemptActive ? (
        <ActivityHeader
          runtime={runtime}
          focusMode={focusMode}
          onToggleFocusMode={() => setFocusMode((v) => !v)}
          onToggleOutline={() => setOutlineOpen((v) => !v)}
          outlineOpen={outlineOpen}
        />
      ) : null}

      {/* Body: outline rail + content zone */}
      <div className="relative flex flex-1">
        {!isAttemptActive ? (
          <OutlineRail
            runtime={runtime}
            open={outlineOpen}
            onClose={() => setOutlineOpen(false)}
          />
        ) : null}

        <main
          id="activity-main-content"
          className="min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-6 lg:px-8"
        >
          {/* Status strip (assessment / file submission types) */}
          {!isAttemptActive && !isLocked ? <InlineStatusStrip runtime={runtime} /> : null}

          {/* Locked / unavailable state */}
          {isLocked ? (
            <LockStateCard runtime={runtime} />
          ) : (
            children
          )}

          {/* AI ask (inline footer position) */}
          {activity && runtime.permissions.can_view && !isAttemptActive ? null : null}
        </main>
      </div>

      {/* Persistent bottom action bar */}
      <BottomActionBar
        courseUuid={courseUuid}
        runtime={runtime}
      />
    </div>
  );
}
