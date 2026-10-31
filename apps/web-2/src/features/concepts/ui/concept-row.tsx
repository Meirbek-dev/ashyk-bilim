import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { Checkbox } from '#/shared/ui/checkbox'

import type { ConceptRow as Row } from '../model/graph'
import { conceptStatusMeta } from './labels'
import { TagLine } from './tag-line'

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
          className="mt-1"
          aria-label={m.concepts_select({ name: concept.name })}
          checked={selection.checked}
          onCheckedChange={selection.onToggle}
        />
      ) : null}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-base font-semibold wrap-anywhere">
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
          <StatusBadge tone={meta.tone}>{meta.label()}</StatusBadge>
        </div>
        {concept.description ? (
          <p className="max-w-prose text-sm wrap-anywhere text-muted-foreground">{concept.description}</p>
        ) : null}
        {requires.length > 0 ? (
          <p className="text-sm wrap-anywhere">
            {m.concepts_requires({ names: requires.map(required => required.name).join(', ') })}
          </p>
        ) : null}
        {tags.length > 0 ? (
          <ul aria-label={m.concepts_tags_title()} className="flex flex-col gap-1">
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
