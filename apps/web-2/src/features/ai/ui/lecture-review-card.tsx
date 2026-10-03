import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { CourseId, LectureReview } from '#/shared/api/gen/types.gen'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { levelLabels } from '../model/labels'
import { dismissOptions } from '../queries'
import { Citations } from './citations'

/** One lecture review: its summary and the suggestions not dismissed yet; "Hide" dismisses one. */
export function LectureReviewCard({ courseId, review }: { courseId: CourseId; review: LectureReview }) {
  const queryClient = useQueryClient()
  const dismiss = useMutation(dismissOptions(queryClient, courseId))
  const report = review.suggestions
  const open = (report.suggestions ?? []).filter(item => !review.dismissed_suggestion_ids.includes(item.suggestion_id))
  return (
    <article className="flex flex-col gap-3 border-t pt-4">
      <p className="text-xs text-muted-foreground">
        {m.ai_critique_date({ date: formatDate(review.created_at_unix) })}
      </p>
      <Suspense fallback={<ListSkeleton />}>
        <MarkdownView content={report.summary} />
        <ul className="flex flex-col gap-4">
          {open.map(item => (
            <li key={item.suggestion_id} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                {item.priority ? <StatusBadge tone="info">{levelLabels[item.priority]()}</StatusBadge> : null}
                <h4 className="font-medium wrap-anywhere">{item.title}</h4>
              </div>
              {item.location ? (
                <p className="text-sm text-muted-foreground">{m.ai_location({ location: item.location })}</p>
              ) : null}
              {item.rationale ? <p className="text-sm">{item.rationale}</p> : null}
              {item.replacement_markdown ? (
                <section className="flex flex-col gap-1">
                  <h5 className="text-sm font-medium">{m.ai_replacement()}</h5>
                  <MarkdownView content={item.replacement_markdown} />
                </section>
              ) : null}
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={dismiss.isPending}
                  onClick={() =>
                    dismiss.mutate(
                      { path: { review_id: review.id }, body: { suggestion_id: item.suggestion_id } },
                      { onSuccess: () => toast.add({ title: m.ai_suggestion_hidden() }) },
                    )
                  }
                >
                  {m.ai_suggestion_hide()}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Suspense>
      <Citations citations={report.citations ?? []} />
    </article>
  )
}
