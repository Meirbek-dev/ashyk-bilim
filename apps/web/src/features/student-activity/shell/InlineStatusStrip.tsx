'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { DATE_TIME_LONG_OPTIONS, formatDate } from '@/lib/date'
import { Badge } from '@/components/ui/badge'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { useAssessmentAttempt } from '@/features/assessments/hooks/useAssessment'
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext'
import { useTimeLimitLabel } from '@/features/assessments/shared/useTimeLimitLabel'
import type { AttemptState } from '@/lib/api/generated/zod'
import { queryKeys } from '@/lib/react-query/queryKeys'

interface InlineStatusStripProps {
  runtime: StudentActivityRuntime
}

const ASSESSMENT_TYPES = new Set(['TYPE_EXAM', 'TYPE_CUSTOM', 'TYPE_CODE_CHALLENGE', 'TYPE_FILE_SUBMISSION'])
/** Kinds whose attempt policy (max attempts, time limit) lives on the assessment, not the learner-state runtime. */
const ATTEMPT_POLICY_TYPES = new Set(['TYPE_EXAM', 'TYPE_CUSTOM', 'TYPE_CODE_CHALLENGE'])

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
  const t = useTranslations('ActivityPage')
  const locale = useLocale()
  const tKinds = useTranslations('Features.Assessments.Studio.kinds')
  const formatTimeLimit = useTimeLimitLabel()
  const { mode } = useActivityLayout()
  const activityType = runtime.activity?.type ?? ''
  const activityUuid = runtime.activity?.uuid.replace(/^activity_/, '') ?? null
  const hasAttemptPolicy = ATTEMPT_POLICY_TYPES.has(activityType)
  // Same effective policy the entry card renders (shares the react-query cache with InlineAssessmentWorkspace).
  const { vm: assessment } = useAssessmentAttempt(hasAttemptPolicy ? activityUuid : null)
  const attempt = assessment?.surface === 'ATTEMPT' ? assessment.vm : null
  const attemptState = useQueryClient().getQueryData<AttemptState>(
    queryKeys.assessments.attemptState(attempt?.assessmentUuid),
  )

  if (mode === 'ACTIVE_ATTEMPT') return null
  if (!ASSESSMENT_TYPES.has(activityType)) return null

  const { state } = runtime.progress
  const policy = attempt
    ? {
        maxAttempts: attempt.policy.maxAttempts,
        timeLimitSeconds: attempt.policy.timeLimitSeconds,
        attemptsUsed: attemptState?.attempts_used ?? 0,
      }
    : hasAttemptPolicy
      ? null // assessment policy not loaded yet — say nothing rather than "unlimited"
      : {
          maxAttempts: runtime.policy?.max_attempts ?? null,
          timeLimitSeconds: runtime.policy?.time_limit_seconds ?? null,
          attemptsUsed: runtime.progress.attempt_count ?? 0,
        }

  const items: string[] = []

  // Human-readable activity kind label
  items.push(tKinds(activityType))

  // State
  const stateLabel = getStateChip(state, t)
  if (stateLabel) items.push(stateLabel)

  // Passing score (not grade_release_mode)
  const passingScore = runtime.policy?.passing_score
  if (passingScore !== null && passingScore !== undefined) {
    items.push(t('passingScore', { score: passingScore }))
  }

  // Max attempts — student-readable
  if (policy?.maxAttempts) {
    items.push(t('attemptsUsed', { used: policy.attemptsUsed, max: policy.maxAttempts }))
  } else if (policy && activityType !== 'TYPE_FILE_SUBMISSION') {
    items.push(t('attemptsUnlimited'))
  }

  // Time limit
  if (policy?.timeLimitSeconds) {
    items.push(formatTimeLimit(policy.timeLimitSeconds))
  }

  // Due date
  const dueAt = attempt?.dueAt ?? runtime.policy?.due_at
  if (dueAt) {
    const dueDate = new Date(dueAt)
    const isOverdue = dueDate < new Date() && state !== 'complete' && state !== 'passed' && state !== 'published'
    const duePart = `${t('dueDate')}: ${formatDate(dueAt, locale, DATE_TIME_LONG_OPTIONS)}`
    if (isOverdue) {
      items.push(`⚠ ${duePart}`)
    } else {
      items.push(duePart)
    }
  }

  if (items.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className="text-xs font-normal">
          {item}
        </Badge>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStateChip(state: string, t: (key: string) => string): string | null {
  switch (state) {
    case 'not_started': {
      return t('notStarted')
    }
    case 'in_progress': {
      return t('draft')
    }
    case 'submitted':
    case 'needs_grading': {
      return t('submitted')
    }
    case 'returned': {
      return t('needsRevision')
    }
    case 'graded_hidden': {
      return t('statusGradingInProgress')
    }
    case 'published':
    case 'passed':
    case 'complete': {
      return t('statusComplete')
    }
    case 'failed': {
      return t('failed')
    }
    default: {
      return null
    }
  }
}
