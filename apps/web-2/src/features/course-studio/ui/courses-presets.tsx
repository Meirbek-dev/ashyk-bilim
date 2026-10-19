import { m } from '#/paraglide/messages'
import type { CourseSummary } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

import { type CoursesSearch, presetCount, type Preset } from '../model/course'

const presetLabels: Record<Preset | 'all', () => string> = {
  all: m.studio_preset_all,
  drafts: m.studio_preset_drafts,
  published: m.studio_preset_published,
  archived: m.studio_preset_archived,
}
const PRESETS = ['all', 'drafts', 'published', 'archived'] as const

/** The preset tabs of `/teach/courses` (`?preset=`), each with its count from the list's `summary`. */
export function CoursesPresets({ search, summary }: { search: CoursesSearch; summary: CourseSummary | undefined }) {
  return (
    <nav aria-label={m.studio_preset_label()} className="flex flex-wrap">
      {PRESETS.map(preset => {
        const value = preset === 'all' ? undefined : preset
        return (
          <Link
            key={preset}
            to="/teach/courses"
            search={{ q: search.q, preset: value, sort: search.sort }}
            activeOptions={{ exact: true }}
            variant="tab"
          >
            {presetLabels[preset]()}
            {summary ? (
              <span className="ms-2 text-muted-foreground tabular-nums">{presetCount(summary, value)}</span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
