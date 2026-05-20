'use client';

import { cn } from '@/lib/utils';
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime';
import ActivityOutlineContent from './ActivityOutlineContent';

interface OutlineRailProps {
  runtime: StudentActivityRuntime;
  open: boolean;
  onClose: () => void;
}

/**
 * OutlineRail
 *
 * Always position:fixed — never participates in the DOM layout flow.
 * Zero-width impact on content zone in both open and closed states.
 *
 * Closed: -translate-x-full + opacity-0 + pointer-events-none (invisible, no layout impact)
 * Open:   translate-x-0 + opacity-100 (300px overlay from left)
 *
 * Toggled by ActivityHeader's outline button or keyboard shortcut 'O'.
 * Dismisses on Escape (handled by StudentActivityWorkspace) or click-outside backdrop.
 */
export default function OutlineRail({ runtime, open, onClose }: OutlineRailProps) {
  return (
    <>
      {/* Overlay panel — always position:fixed, zero DOM-flow impact */}
      <div
        className={cn(
          'outline-rail fixed left-0 top-[6.25rem] z-20',
          'h-[calc(100dvh-6.25rem)] w-[300px]',
          'flex flex-col border-r border-border bg-background shadow-xl',
          'transition-[transform,opacity] duration-200 ease-out will-change-transform',
          open
            ? 'translate-x-0 opacity-100'
            : '-translate-x-full opacity-0 pointer-events-none',
        )}
        aria-label="Course outline"
        role="navigation"
      >
        <div className="flex-1 overflow-y-auto">
          <ActivityOutlineContent runtime={runtime} />
        </div>
      </div>

      {/* Click-outside backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-10"
          aria-hidden
          onClick={onClose}
        />
      ) : null}
    </>
  );
}
