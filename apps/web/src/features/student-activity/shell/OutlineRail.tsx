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
 * Desktop-only (hidden on < lg). Two states:
 *
 * Collapsed (open=false): 56px-wide sticky column showing chapter progress
 *   dots/rings as visual indicators.
 *
 * Expanded (open=true): 280px fixed overlay (does not shrink ContentZone)
 *   showing the full chapter + activity tree.
 *
 * Toggled by ActivityHeader's outline button or keyboard shortcut `O`.
 * Expanded panel dismisses on Escape or click-outside.
 */
export default function OutlineRail({ runtime, open, onClose }: OutlineRailProps) {
  return (
    <>
      {/* Collapsed rail — always visible on desktop, provides chapter context */}
      <aside
        className={cn(
          'outline-rail sticky top-[calc(3.5rem+2.75rem)] hidden shrink-0 flex-col items-center gap-2 self-start pb-20 pt-3 lg:flex',
          'h-[calc(100dvh-6.25rem)] w-14',
          open && 'invisible',
        )}
        aria-hidden={open}
      >
        <ChapterDots runtime={runtime} />
      </aside>

      {/* Expanded overlay */}
      <div
        className={cn(
          'outline-rail fixed left-0 top-[calc(3.5rem+2.75rem)] z-20 hidden h-[calc(100dvh-6.25rem)] w-[280px] flex-col border-r border-border bg-background shadow-lg transition-transform duration-200 ease-out lg:flex',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Course outline"
      >
        <div className="flex-1 overflow-y-auto">
          <ActivityOutlineContent runtime={runtime} />
        </div>
      </div>

      {/* Click-outside backdrop — dismisses expanded rail */}
      {open ? (
        <div
          className="fixed inset-0 z-10 hidden lg:block"
          aria-hidden
          onClick={onClose}
        />
      ) : null}
    </>
  );
}

// ── Chapter progress dots ─────────────────────────────────────────────────────

function ChapterDots({ runtime }: { runtime: StudentActivityRuntime }) {
  const currentActivityId = runtime.activity?.id ?? null;

  return (
    <div className="flex flex-col gap-2">
      {(runtime.outline ?? []).map((chapter) => {
        const activities = chapter.activities ?? [];
        const total = activities.length;
        const done = activities.filter((a) => a.complete || a.state === 'complete' || a.state === 'passed').length;
        const isCurrent = activities.some((a) => a.id === currentActivityId);
        const pct = total > 0 ? done / total : 0;

        return (
          <ChapterRing
            key={chapter.id}
            index={chapter.index}
            title={chapter.title}
            percent={pct}
            isCurrent={isCurrent}
          />
        );
      })}
    </div>
  );
}

function ChapterRing({
  index,
  title,
  percent,
  isCurrent,
}: {
  index: number;
  title: string;
  percent: number;
  isCurrent: boolean;
}) {
  const size = 32;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * percent;

  return (
    <div
      title={title}
      aria-label={`Chapter ${index + 1}: ${title}`}
      className="group relative flex items-center justify-center"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-border"
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        {percent > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className={isCurrent ? 'stroke-primary' : 'stroke-primary/50'}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </svg>
      {/* Chapter number */}
      <span
        className={cn(
          'absolute text-[10px] font-semibold tabular-nums',
          isCurrent ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {index + 1}
      </span>
    </div>
  );
}
