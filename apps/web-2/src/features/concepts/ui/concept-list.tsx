import { useState } from 'react'

import type { ConceptId, CourseId } from '#/shared/api/gen/types.gen'

import { toggled, type ConceptRow as Row } from '../model/graph'
import { ConceptRow } from './concept-row'
import { ReviewBar } from './review-bar'

type ConceptListProps = { courseId: CourseId; rows: readonly Row[]; editing: boolean }

/** The concepts, each with a checkbox when the graph is editable; the selected ones are decided together (B-CON-04). */
export function ConceptList({ courseId, rows, editing }: ConceptListProps) {
  const [selected, setSelected] = useState<ReadonlySet<ConceptId>>(new Set())
  return (
    <div className="@container/concepts flex flex-col">
      {editing ? <ReviewBar courseId={courseId} selected={selected} onDone={() => setSelected(new Set())} /> : null}
      {/* The review bar closes with its own hairline: the list does not draw a second one under it. */}
      <ul className={`flex flex-col divide-y ${editing && selected.size > 0 ? '' : 'border-t'}`}>
        {rows.map(row => (
          <li key={row.concept.id} className="py-3.5">
            <ConceptRow
              courseId={courseId}
              row={row}
              selection={
                editing
                  ? {
                      checked: selected.has(row.concept.id),
                      onToggle: () => setSelected(current => toggled(current, row.concept.id)),
                    }
                  : null
              }
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
