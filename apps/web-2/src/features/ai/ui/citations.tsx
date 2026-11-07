import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { Citation } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

import { citedActivity, readableExcerpt } from '../model/ai'

/**
 * The sources an answer cites: label and the quoted excerpt; a cited activity of this course is a link into the
 * player (B-AI-27). Nothing when there are none.
 */
export function Citations({ citations }: { citations: Citation[] }) {
  const { courseId } = useParams({ strict: false })
  if (citations.length === 0) return null
  return (
    <section className="mt-1 flex flex-col gap-1 border-t pt-2">
      <h4 className="text-xs font-normal text-muted-foreground">{m.ai_citations()}</h4>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {citations.map(citation => {
          const activityId = citedActivity(citation)
          const excerpt = readableExcerpt(citation.excerpt)
          return (
            <li key={citation.citation_id} className="wrap-anywhere">
              {courseId && activityId ? (
                <Link to="/learn/$courseId/$activityId" params={{ courseId, activityId }}>
                  {citation.label}
                </Link>
              ) : (
                <span className="text-foreground">{citation.label}</span>
              )}
              {excerpt ? ` — ${excerpt}` : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
