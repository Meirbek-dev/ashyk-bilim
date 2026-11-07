import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import type { StatusTone } from '#/shared/components/status-badge'
import { Checkbox } from '#/shared/ui/checkbox'

import type { ConceptRow as Row } from '../model/graph'
import { conceptStatusMeta } from './labels'
import { TagLine } from './tag-line'

const statusInk: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
  destructive: 'text-destructive',
}

type ConceptRowProps = {
  courseId: CourseId
  row: Row
  /** The batch checkbox; `null` when the graph is read-only (no `can_edit`). */
  selection: { checked: boolean; onToggle: () => void } | null
}

/**
 * One concept (B-CON-01): name with its status, description, the concepts it requires and the activities that
 * exercise it. An editor opens it in the side sheet by its name (`?concept=`, B-CON-06).
 */
export function ConceptRow({ courseId, row, selection }: ConceptRowProps) {
  const { concept, status, requires, tags } = row
  const meta = conceptStatusMeta[status]
  return (
    <article className="flex items-start gap-3">
      {selection ? (
        <Checkbox
          className="mt-0.5"
          aria-label={m.concepts_select({ name: concept.name })}
          checked={selection.checked}
          onCheckedChange={selection.onToggle}
        />
      ) : null}
      {/* What the concept is on the left; where it is exercised beside it, so the list reads down one edge. */}
      <div className="grid min-w-0 flex-1 gap-x-10 gap-y-1.5 @3xl/concepts:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="min-w-0 text-base font-medium wrap-anywhere">
              {selection ? (
                <Link
                  variant="title"
                  to="/teach/courses/$courseId/concepts"
                  params={{ courseId }}
                  search={prev => ({ ...prev, concept: concept.id, learner: undefined })}
                >
                  {concept.name}
                </Link>
              ) : (
                concept.name
              )}
            </h2>
            <span className={`text-xs ${statusInk[meta.tone]}`}>{meta.label()}</span>
          </div>
          {concept.description ? (
            <p className="max-w-prose text-sm wrap-anywhere text-muted-foreground">{concept.description}</p>
          ) : null}
          {requires.length > 0 ? (
            <p className="text-sm wrap-anywhere">
              {m.concepts_requires({ names: requires.map(required => required.name).join(', ') })}
            </p>
          ) : null}
        </div>
        {tags.length > 0 ? (
          <ul aria-label={m.concepts_tags_title()} className="flex min-w-0 flex-col gap-1">
            {tags.map(tag => (
              <li key={tag.tag.id}>
                <TagLine tag={tag} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{m.concepts_tags_none()}</p>
        )}
      </div>
    </article>
  )
}
