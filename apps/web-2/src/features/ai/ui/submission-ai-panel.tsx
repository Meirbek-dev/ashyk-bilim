import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import { ListSkeleton } from '#/shared/components/list-skeleton'

import { PanelError } from './panel-error'
import { SubmissionAiBody } from './submission-ai-body'

/**
 * The grader's AI (slice 6.1 mounts it in the submission workspace): the analysis of one submission (an assessment
 * submission id or a file-submission attempt id) and its remediation gate. Failures stay in this panel.
 */
export function SubmissionAiPanel({ submissionId }: { submissionId: string }) {
  return (
    <CatchBoundary getResetKey={() => submissionId} errorComponent={PanelError}>
      <Suspense fallback={<ListSkeleton />}>
        <SubmissionAiBody submissionId={submissionId} />
      </Suspense>
    </CatchBoundary>
  )
}
