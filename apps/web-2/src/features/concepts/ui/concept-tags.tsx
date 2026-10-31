import type { CourseId } from '#/shared/api/gen/types.gen'
import { m } from '#/paraglide/messages'

import type { ActivityInfo, ConceptRow } from '../model/graph'
import { AddTag } from './add-tag'
import { TagActions } from './tag-actions'
import { TagLine } from './tag-line'

type ConceptTagsProps = { courseId: CourseId; row: ConceptRow; activities: readonly ActivityInfo[] }

/** The activities that exercise the concept (B-CON-08): approve, reject or remove each, add another. */
export function ConceptTags({ courseId, row, activities }: ConceptTagsProps) {
  const tagged = new Set(row.tags.filter(tag => !tag.question).map(tag => tag.tag.activity_id))
  return (
    <div className="flex flex-col gap-4">
      {row.tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.concepts_tags_none()}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {row.tags.map(tag => (
            <li key={tag.tag.id} className="flex flex-col gap-1">
              <TagLine tag={tag} />
              <TagActions courseId={courseId} tag={tag} />
            </li>
          ))}
        </ul>
      )}
      <AddTag
        courseId={courseId}
        conceptId={row.concept.id}
        activities={activities.filter(activity => !tagged.has(activity.id))}
      />
    </div>
  )
}
