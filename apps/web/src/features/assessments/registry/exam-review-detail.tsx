'use client'
import type { KindReviewDetailProps } from './index'
import { SubmittedAnswers, getCanonicalAnswersByItem } from '@/features/grading/review/components/SubmissionInspector'

export default function ExamReviewDetail({ submission, activityUuid }: KindReviewDetailProps) {
  return (
    <SubmittedAnswers
      submission={submission}
      answersByItem={getCanonicalAnswersByItem(submission)}
      {...(activityUuid !== undefined ? { activityUuid } : {})}
    />
  )
}
