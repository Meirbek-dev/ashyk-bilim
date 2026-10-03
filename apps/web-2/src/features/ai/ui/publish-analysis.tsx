import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AiCourseAnalysisId, CourseId } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { publishAnalysisOptions } from '../queries'

/** Publishing the analysis asks first: learners will see it (B-AI-15). */
export function PublishAnalysis({ courseId, analysisId }: { courseId: CourseId; analysisId: AiCourseAnalysisId }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const publish = useMutation(publishAnalysisOptions(queryClient, courseId))
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) publish.reset()
      }}
      trigger={<Button>{m.ai_publish()}</Button>}
      title={m.ai_publish_title()}
      consequence={m.ai_publish_consequence()}
      confirmLabel={m.ai_publish()}
      onConfirm={() =>
        publish.mutate(
          { path: { analysis_id: analysisId } },
          {
            onSuccess: () => {
              setOpen(false)
              toast.add({ title: m.ai_published() })
            },
          },
        )
      }
      pending={publish.isPending}
      error={publish.error}
    />
  )
}
