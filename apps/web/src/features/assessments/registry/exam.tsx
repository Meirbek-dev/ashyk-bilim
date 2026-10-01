/**
 * Registry module for TYPE_EXAM.
 */

import type { ComponentType } from 'react'
import type { KindAttemptProps, KindAuthorProps, KindModule, KindReviewProps } from './index'

export const examModuleFactory = async (): Promise<KindModule> => {
  const [
    { NativeItemStudioProvider, NativeItemOutline, NativeItemAuthor },
    { default: GradingReviewWorkspace },
    { default: ExamReviewDetail },
    { default: ExamAttemptContent },
  ] = await Promise.all([
    import('@/features/assessments/studio/NativeItemStudio'),
    import('@/features/grading/review/GradingReviewWorkspace'),
    import('./exam-review-detail'),
    import('./exam/ExamAttemptContent'),
  ])

  const OutlineSlot: ComponentType<KindAuthorProps> = _props => (
    <NativeItemOutline allowedKinds={['CHOICE', 'MATCHING']} itemNoun="Question" itemNounKey="question" />
  )

  const AuthorSlot: ComponentType<KindAuthorProps> = _props => (
    <NativeItemAuthor mode="exam" itemNoun="Question" itemNounKey="question" allowedKinds={['CHOICE', 'MATCHING']} />
  )

  // Rendered as an element: calling the workspace as a function ran its hooks
  // inside this wrapper's render.
  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => (
    <GradingReviewWorkspace
      activityId={activityId}
      initialSubmissionUuid={submissionUuid ?? null}
      {...(title !== undefined ? { title } : {})}
    />
  )

  return {
    label: 'Exam',
    iconName: 'GraduationCap',
    Provider: NativeItemStudioProvider,
    Outline: OutlineSlot,
    Author: AuthorSlot,
    Attempt: ExamAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
    ReviewDetail: ExamReviewDetail,
  }
}
