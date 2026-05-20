'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime';
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext';

interface InlineStatusStripProps {
  runtime: StudentActivityRuntime;
}

const ASSESSMENT_TYPES = new Set(['TYPE_EXAM', 'TYPE_CUSTOM', 'TYPE_CODE_CHALLENGE', 'TYPE_FILE_SUBMISSION']);

/**
 * InlineStatusStrip
 *
 * Single-line horizontal strip of student-readable metadata rendered above
 * the activity content for assessment and file submission types.
 *
 * Rules:
 * - `grade_release_mode` is NEVER shown
 * - Activity type uses translated human label (not raw enum)
 * - Due date rendered with `text-destructive` when overdue
 * - Hidden in ACTIVE_ATTEMPT mode
 * - Hidden for TYPE_DYNAMIC, TYPE_VIDEO, TYPE_DOCUMENT
 */
export default function InlineStatusStrip({ runtime }: InlineStatusStripProps) {
  const t = useTranslations('ActivityPage');
  const { mode } = useActivityLayout();

  if (mode === 'ACTIVE_ATTEMPT') return null;

  const activityType = runtime.activity?.type ?? '';
  if (!ASSESSMENT_TYPES.has(activityType)) return null;

  const policy = runtime.policy;
  const state = runtime.progress.state;

  const items: string[] = [];

  // Human-readable activity kind label
  items.push(getKindLabel(activityType, t));

  // State
  const stateLabel = getStateChip(state, t);
  if (stateLabel) items.push(stateLabel);

  // Passing score (not grade_release_mode)
  if (policy?.passing_score !== null && policy?.passing_score !== undefined) {
    items.push(t('passingScore', { score: policy.passing_score }));
  }

  // Max attempts — student-readable
  if (policy?.max_attempts) {
    items.push(t('attemptsUsed', { used: runtime.progress.attempt_count ?? 0, max: policy.max_attempts }));
  } else if (activityType !== 'TYPE_FILE_SUBMISSION') {
    items.push(t('attemptsUnlimited'));
  }

  // Time limit
  if (policy?.time_limit_seconds) {
    items.push(formatDuration(policy.time_limit_seconds));
  }

  // Due date
  if (policy?.due_at) {
    const dueDate = new Date(policy.due_at);
    const isOverdue = dueDate < new Date() && state !== 'complete' && state !== 'passed' && state !== 'published';
    const duePart = `${t('dueDate')}: ${formatDate(policy.due_at)}`;
    if (isOverdue) {
      items.push(`⚠ ${duePart}`);
    } else {
      items.push(duePart);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className="text-xs font-normal">
          {item}
        </Badge>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getKindLabel(activityType: string, t: (key: string) => string): string {
  switch (activityType) {
    case 'TYPE_EXAM':
      return t('activityTypes.exam');
    case 'TYPE_CUSTOM':
      return t('activityTypes.learningMaterial');
    case 'TYPE_CODE_CHALLENGE':
      return t('activityTypes.codeChallenge');
    case 'TYPE_FILE_SUBMISSION':
      return t('activityTypes.fileSubmission');
    default:
      return activityType;
  }
}

function getStateChip(state: string, t: (key: string) => string): string | null {
  switch (state) {
    case 'not_started':
      return t('notStarted');
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
    case 'passed':
    case 'complete':
      return t('statusComplete');
    case 'failed':
      return t('failed');
    default:
      return null;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
