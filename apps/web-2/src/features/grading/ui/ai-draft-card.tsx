import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { GradeDraftView } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'

import { DraftPart } from './ai-draft-part'
import { DraftSummary } from './ai-draft-summary'

type DraftCardProps = {
  draft: GradeDraftView
  onTransfer: (draft: GradeDraftView) => void
  /** Runs once the grader confirmed «Отклонить». */
  onDiscard: () => void
  discarding: boolean
  discardError: unknown
}

/**
 * The review's «Черновик ИИ» (B-GRD-43): the summary, then per question or rubric criterion the proposed points with
 * the quotes they rest on and the rationale, the overall feedback. «Перенести в форму» fills the grade form and says so
 * (B-GRD-44), «Отклонить» asks, then discards it (B-GRD-45).
 */
export function DraftCard({ draft, onTransfer, onDiscard, discarding, discardError }: DraftCardProps) {
  const [moved, setMoved] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const proposal = draft.proposal
  return (
    <section
      aria-labelledby="grading-ai-draft"
      className="flex flex-col gap-4 rounded-xl border bg-card p-gutter text-card-foreground shadow-xs"
    >
      <DraftSummary draft={draft} />
      {(proposal?.parts ?? []).map(part => (
        <DraftPart key={part.part_id} part={part} titled={!draft.is_file} />
      ))}
      {proposal?.overall_feedback.trim() ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">{m.grading_ai_feedback()}</h3>
          <p className="text-sm wrap-anywhere whitespace-pre-line">{proposal.overall_feedback}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onTransfer(draft)
            setMoved(true)
          }}
        >
          {m.grading_ai_transfer()}
        </Button>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          trigger={
            <Button type="button" variant="ghost">
              {m.grading_ai_discard()}
            </Button>
          }
          title={m.grading_ai_discard_title()}
          consequence={m.grading_ai_discard_text()}
          confirmLabel={m.grading_ai_discard()}
          pending={discarding}
          error={discardError}
          onConfirm={onDiscard}
        />
        <output className="text-sm text-muted-foreground">{moved ? m.grading_ai_transferred() : null}</output>
      </div>
    </section>
  )
}
