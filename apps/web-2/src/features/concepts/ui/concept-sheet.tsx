import { m } from '#/paraglide/messages'
import type { ConceptGraph, CourseId } from '#/shared/api/gen/types.gen'
import { SheetPanel } from '#/shared/components/sheet-panel'

import type { ActivityInfo, ConceptRow } from '../model/graph'
import { ConceptForm } from './concept-form'
import { ConceptTags } from './concept-tags'
import { DeleteConcept } from './delete-concept'
import { PrerequisitesEditor } from './prerequisites-editor'

type ConceptSheetProps = {
  courseId: CourseId
  graph: ConceptGraph
  row: ConceptRow
  activities: readonly ActivityInfo[]
  onClose: () => void
}

/**
 * The concept open by `?concept=` (B-CON-06..08): its name and description, what it requires, the activities that
 * exercise it, and «Delete». Each part saves on its own.
 */
export function ConceptSheet({ courseId, graph, row, activities, onClose }: ConceptSheetProps) {
  return (
    <SheetPanel
      open
      onOpenChange={open => {
        if (!open) onClose()
      }}
      side="right"
      title={row.concept.name}
    >
      {/* Keyed by the concept: another one opened from the list starts from its own values. */}
      <ConceptForm key={row.concept.id} courseId={courseId} concept={row.concept} />
      <section className="flex flex-col gap-2 border-t pt-4">
        <h3 className="font-medium">{m.concepts_prerequisites_title()}</h3>
        <PrerequisitesEditor key={row.concept.id} courseId={courseId} graph={graph} conceptId={row.concept.id} />
      </section>
      <section className="flex flex-col gap-2 border-t pt-4">
        <h3 className="font-medium">{m.concepts_tags_title()}</h3>
        <ConceptTags courseId={courseId} row={row} activities={activities} />
      </section>
      <div className="flex justify-end border-t pt-4">
        <DeleteConcept courseId={courseId} concept={row.concept} onDeleted={onClose} />
      </div>
    </SheetPanel>
  )
}
