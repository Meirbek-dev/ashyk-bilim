import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { formatDateTime, formatNumber } from '#/shared/i18n/format'
import { toast } from '#/shared/ui/toast'

import { reindexOptions } from '../mutations'
import { indexOptions } from '../queries'

/**
 * The course's material index (B-AIG-05): sources, passages with embeddings, failed sources, when last indexed and
 * the embedder; «Переиндексировать» empties it for the minute sweep to rebuild.
 */
export function IndexCard({ courseId }: { courseId: CourseId }) {
  const { data: status } = useSuspenseQuery(indexOptions(courseId))
  const reindex = useMutation(reindexOptions(useQueryClient(), courseId))
  const facts = [
    [m.ai_grading_index_sources(), formatNumber(status.sources)],
    [
      m.ai_grading_index_chunks(),
      m.ai_grading_index_embedded({
        embedded: formatNumber(status.embedded_chunks),
        total: formatNumber(status.chunks),
      }),
    ],
    [m.ai_grading_index_failed(), formatNumber(status.failed_sources)],
    [
      m.ai_grading_index_last(),
      status.last_indexed_at === null ? m.ai_grading_index_never() : formatDateTime(status.last_indexed_at),
    ],
    [m.ai_grading_index_model(), status.model],
  ] as const
  return (
    <section
      aria-labelledby="ai-grading-index"
      className="flex max-w-prose flex-col gap-4 rounded-xl border bg-card p-gutter text-card-foreground shadow-xs"
    >
      <div className="flex flex-col gap-1">
        <h2 id="ai-grading-index" className="text-xl font-semibold">
          {m.ai_grading_index_title()}
        </h2>
        <p className="text-sm text-muted-foreground">{m.ai_grading_index_hint()}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="wrap-anywhere tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <SubmitButton
          type="button"
          variant="outline"
          pending={reindex.isPending}
          onClick={() =>
            reindex.mutate(
              { path: { course_id: courseId } },
              { onSuccess: () => toast.add({ title: m.ai_grading_reindexed() }) },
            )
          }
        >
          {m.ai_grading_reindex()}
        </SubmitButton>
      </div>
      {reindex.error ? <ErrorAlert>{presentError(reindex.error)}</ErrorAlert> : null}
    </section>
  )
}
