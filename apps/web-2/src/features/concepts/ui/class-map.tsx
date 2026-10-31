import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { ClassConcept, CourseId } from '#/shared/api/gen/types.gen'
import { ScoreBar } from '#/shared/components/charts/score-bar'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { LEVELS, percentOf } from '../model/mastery'
import { classOptions } from '../queries'
import { levelMeta } from './labels'

// A function: the headers are read in the current locale at render.
const columns = (courseId: CourseId): DataColumn<ClassConcept>[] => [
  { id: 'concept', header: m.concepts_col_concept(), priority: 1, cell: concept => concept.name },
  {
    id: 'mean',
    header: m.concepts_col_mean(),
    priority: 2,
    cell: concept => {
      const percent = percentOf(concept.mean_p)
      return percent === null ? m.concepts_no_evidence() : <ScoreBar value={percent} text={formatPercent(percent)} />
    },
  },
  ...LEVELS.map((level): DataColumn<ClassConcept> => ({
    id: level,
    header: levelMeta[level].label(),
    priority: 2,
    cell: concept => <span className="tabular-nums">{formatNumber(concept[level])}</span>,
  })),
  {
    id: 'behind',
    header: m.concepts_col_behind(),
    priority: 2,
    wrap: true,
    cell: concept =>
      concept.struggling_learners.length === 0 ? null : (
        <span className="flex flex-wrap gap-x-2 gap-y-1">
          {concept.struggling_learners.map(learner => (
            <Link
              key={learner.user_id}
              to="/teach/courses/$courseId/concepts"
              params={{ courseId }}
              search={prev => ({ ...prev, learner: learner.user_id, concept: undefined })}
            >
              {learner.name}
            </Link>
          ))}
        </span>
      ),
  },
]

/**
 * The class mastery map (B-CON-09): per approved concept the mean estimate, how many learners are at each level and
 * who is behind (struggling), each a link to their concepts (`?learner=`, B-CON-10).
 */
export function ClassMap({ courseId }: { courseId: CourseId }) {
  const { data } = useSuspenseQuery(classOptions(courseId))
  if (data.concepts.length === 0) return <p className="text-sm text-muted-foreground">{m.concepts_class_empty()}</p>
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground tabular-nums">
        {m.concepts_class_learners({ count: formatNumber(data.learners) })}
      </p>
      <DataTable
        label={m.concepts_class_title()}
        rows={data.concepts}
        columns={columns(courseId)}
        getKey={concept => concept.concept_id}
      />
    </div>
  )
}
