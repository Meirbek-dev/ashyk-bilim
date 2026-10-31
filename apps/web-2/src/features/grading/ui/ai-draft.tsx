import { useMutation, useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { GradeDraftView } from '#/shared/api/gen/types.gen'
import { toast } from '#/shared/ui/toast'

import { isReady } from '../model/ai-draft'
import { discardDraftOptions } from '../mutations'
import { subjectDraftOptions } from '../queries'
import { DraftCard } from './ai-draft-card'

type AiDraftProps = {
  ids: { activityId: string; submissionId: string }
  onTransfer: (draft: GradeDraftView) => void
}

/**
 * The work's AI draft above its grade form (B-GRD-43..45). Nothing without a ready draft: none yet, being written,
 * already applied or discarded, the feature off or no access to drafts (the read answers null then).
 */
export function AiDraft({ ids, onTransfer }: AiDraftProps) {
  const { data } = useSuspenseQuery(subjectDraftOptions(ids.submissionId))
  const discard = useMutation(discardDraftOptions(ids.activityId, ids.submissionId))
  const draft = data ?? undefined
  if (!isReady(draft)) return null
  return (
    <DraftCard
      draft={draft}
      onTransfer={onTransfer}
      discarding={discard.isPending}
      discardError={discard.error}
      onDiscard={() =>
        discard.mutate(
          { path: { draft_id: draft.id } },
          { onSuccess: () => toast.add({ title: m.grading_ai_discarded() }) },
        )
      }
    />
  )
}
