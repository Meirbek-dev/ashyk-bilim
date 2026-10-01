import type { LearnerCourseState } from '@/features/learner-course/api'
import type { AttemptReview, AttemptViewModel } from './view-models'

export type ActivityProgress = LearnerCourseState['outline'][number]['activities'][number]

/**
 * UX-116 / UX-140: the one grade-of-record source for every learner surface.
 * Headline = the projection's score (best submitted attempt, what the outline
 * sidebar ticks from), falling back to the latest attempt; the review is the
 * released attempt that carries that score.
 */
export function gradeOfRecord(
  vm: Pick<AttemptViewModel, 'score' | 'attemptReviews'>,
  activityState?: Pick<ActivityProgress, 'score'>,
): { pct: number | null; latestPct: number | null; reviews: AttemptReview[]; recordAttempt: AttemptReview | null } {
  const latestPct = vm.score?.percent ?? null
  const pct = activityState?.score ?? latestPct
  const reviews = vm.attemptReviews ?? []
  const recordAttempt = reviews.find(r => r.percent === pct) ?? reviews[0] ?? null
  return { pct, latestPct, reviews, recordAttempt }
}

/**
 * UX-224: the verdict a hand-in toast states - the counted result (projection
 * score + passed, what the result card shows), falling back to this attempt's
 * released score. `null` while the score is not released.
 */
export function submitVerdict(
  releasedScore: number | null | undefined,
  counted: Pick<ActivityProgress, 'score' | 'passed'> | undefined,
  passingScore: number | null,
): { score: number; passed: boolean; latest: number | null } | null {
  if (typeof releasedScore !== 'number') return null
  const score = counted?.score ?? releasedScore
  return {
    score,
    passed: counted?.passed ?? score >= (passingScore ?? 60),
    // This attempt, when it is not the one counted (the card's «latest attempt» line).
    latest: score === releasedScore ? null : releasedScore,
  }
}
