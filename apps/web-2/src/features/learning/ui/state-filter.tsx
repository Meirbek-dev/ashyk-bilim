import { m } from '#/paraglide/messages'
import type { TrailRun } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

import { countByState, RUN_STATES, type RunState } from '../model/learning'
import { runStateMeta } from './run-item'

/** The state filter as links: the URL (`?state=`) is the filter, each option says how many courses it holds. */
export function StateFilter({ runs }: { runs: readonly TrailRun[] }) {
  const counts = countByState(runs)
  const options: { state: RunState | undefined; label: string; count: number }[] = [
    { state: undefined, label: m.learning_filter_all(), count: runs.length },
    ...RUN_STATES.map(state => ({ state, label: runStateMeta[state].label(), count: counts[state] })),
  ]
  return (
    <nav aria-label={m.learning_filter_label()} className="flex flex-wrap">
      {options.map(option => (
        <Link
          key={option.state ?? 'all'}
          to="/learning"
          search={option.state ? { state: option.state } : {}}
          activeOptions={{ exact: true }}
          variant="tab"
        >
          {option.label}
          <span className="ms-2 text-muted-foreground tabular-nums">{option.count}</span>
        </Link>
      ))}
    </nav>
  )
}
