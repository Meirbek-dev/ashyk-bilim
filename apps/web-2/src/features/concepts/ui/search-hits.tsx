import { m } from '#/paraglide/messages'
import type { CourseId, SearchHit } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

/** The passages found (B-CON-12), best first: where (a link when it is an activity) and the passage itself. */
export function SearchHits({ courseId, hits }: { courseId: CourseId; hits: readonly SearchHit[] }) {
  if (hits.length === 0) return <p className="text-sm text-muted-foreground">{m.concepts_search_empty()}</p>
  return (
    <ul className="flex flex-col gap-4">
      {hits.map(hit => (
        <li key={hit.chunk_id} className="flex max-w-prose flex-col gap-1">
          <span className="text-sm font-medium wrap-anywhere">
            {hit.activity_id ? (
              <Link to="/learn/$courseId/$activityId" params={{ courseId, activityId: hit.activity_id }}>
                {hit.label}
              </Link>
            ) : (
              hit.label
            )}
          </span>
          <p className="text-sm wrap-anywhere whitespace-pre-line text-muted-foreground">{hit.excerpt}</p>
        </li>
      ))}
    </ul>
  )
}
