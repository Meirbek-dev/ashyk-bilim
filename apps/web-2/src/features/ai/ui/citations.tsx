import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { Citation } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

import { citedActivity, readableExcerpt } from '../model/ai'

/**
 * The sources an answer cites, numbered: the label and two lines of the quoted excerpt on a quiet field each; a cited
 * activity of this course is a link into the player (B-AI-27). Nothing when there are none.
 */
export function Citations({ citations }: { citations: Citation[] }) {
  const { courseId } = useParams({ strict: false })
  if (citations.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5 pt-1">
      <h4 className="font-sans text-xs font-medium text-muted-foreground">{m.ai_citations()}</h4>
      <ol className="flex flex-col gap-1.5">
        {citations.map((citation, index) => {
          const activityId = citedActivity(citation)
          const excerpt = readableExcerpt(citation.excerpt)
          return (
            <li key={citation.citation_id} className="flex gap-2.5 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span aria-hidden className="pt-px text-xs/5 text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5 wrap-anywhere">
                {courseId && activityId ? (
                  <Link to="/learn/$courseId/$activityId" params={{ courseId, activityId }}>
                    {citation.label}
                  </Link>
                ) : (
                  <span className="font-medium">{citation.label}</span>
                )}
                {excerpt ? <p className="line-clamp-2 text-xs text-muted-foreground">{excerpt}</p> : null}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
