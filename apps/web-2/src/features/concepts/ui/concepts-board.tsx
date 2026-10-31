import { useSuspenseQuery } from '@tanstack/react-query'

import { RunProgress, useAiRun } from '#/features/ai'
import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ListState } from '#/shared/components/list-state'
import { SubmitButton } from '#/shared/components/submit-button'
import { ListPage } from '#/shared/components/templates/list-page'
import { formatNumber } from '#/shared/i18n/format'

import { conceptRows, courseActivities } from '../model/graph'
import { curriculumOptions, graphKey, graphOptions, suggestQueue } from '../queries'
import type { ConceptsSearch } from '../route'
import { ClassMapSection } from './class-map-section'
import { ConceptList } from './concept-list'
import { ConceptSheet } from './concept-sheet'
import { CreateConceptDialog } from './create-concept-dialog'
import { LearnerSheet } from './learner-sheet'

type ConceptsBoardProps = { courseId: CourseId; search: ConceptsSearch; onClose: () => void }

/**
 * The course's concepts (docs/AI-FIRST.md 5): «Suggest concepts» runs the concept mapper (B-CON-03), the list takes
 * decisions in batch, `?concept=` opens one for editing, and the class mastery map closes the page (`?learner=`
 * opens a learner). Editing follows `ConceptGraph.can_edit` only (B-CON-02).
 */
export function ConceptsBoard({ courseId, search, onClose }: ConceptsBoardProps) {
  const graph = useSuspenseQuery(graphOptions(courseId))
  const { data: curriculum } = useSuspenseQuery(curriculumOptions(courseId))
  const activities = courseActivities(curriculum)
  const rows = conceptRows(graph.data, activities)
  const run = useAiRun(suggestQueue(courseId), [graphKey(courseId)])
  const suggest = () => run.start({})
  const editing = graph.data.can_edit
  const open = editing ? rows.find(row => row.concept.id === search.concept) : undefined
  return (
    <div className="flex flex-col gap-12">
      <ListPage
        title={m.concepts_title()}
        count={m.concepts_count({ count: formatNumber(rows.length) })}
        primaryAction={
          editing ? (
            <div className="flex flex-wrap gap-2">
              <CreateConceptDialog courseId={courseId} />
              <SubmitButton pending={run.pending} onClick={suggest}>
                {m.concepts_suggest()}
              </SubmitButton>
            </div>
          ) : null
        }
      >
        <p className="max-w-prose text-sm text-muted-foreground">{m.concepts_intro()}</p>
        <RunProgress state={run.state} onCancel={run.cancel} cancelling={run.cancelling} onRetry={suggest} />
        <ListState
          pending={false}
          error={graph.error}
          count={rows.length}
          filtered={false}
          emptyText={editing ? m.concepts_empty_editor() : m.concepts_empty()}
          onRetry={() => void graph.refetch()}
        >
          <ConceptList courseId={courseId} rows={rows} editing={editing} />
        </ListState>
      </ListPage>
      <ClassMapSection courseId={courseId} />
      {open ? (
        <ConceptSheet courseId={courseId} graph={graph.data} row={open} activities={activities} onClose={onClose} />
      ) : null}
      {search.learner ? <LearnerSheet courseId={courseId} userId={search.learner} onClose={onClose} /> : null}
    </div>
  )
}
