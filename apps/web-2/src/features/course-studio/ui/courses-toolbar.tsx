import type { CourseSummary } from '#/shared/api/gen/types.gen'

import type { CoursesSearch } from '../model/course'
import { CoursesPresets } from './courses-presets'
import { CoursesSearchBox } from './courses-search'
import { CoursesSortMenu } from './courses-sort'

type CoursesToolbarProps = {
  search: CoursesSearch
  summary: CourseSummary | undefined
}

/**
 * The presets are the list's sections, so they stay in sight on a phone (as tabs, not behind a «Filters» sheet): wide,
 * one row on one rule with the search, and the order.
 */
export function CoursesToolbar({ search, summary }: CoursesToolbarProps) {
  return (
    <div className="flex w-full flex-col gap-3 @4xl:flex-row @4xl:items-end @4xl:justify-between @4xl:gap-6 @4xl:border-b">
      <CoursesPresets search={search} summary={summary} />
      <div className="flex flex-wrap items-end gap-2 @4xl:mb-2 @4xl:flex-nowrap">
        {/* Keyed by the URL value: "back" to another search refills the box. */}
        <CoursesSearchBox key={search.q ?? ''} search={search} />
        <CoursesSortMenu search={search} />
      </div>
    </div>
  )
}
