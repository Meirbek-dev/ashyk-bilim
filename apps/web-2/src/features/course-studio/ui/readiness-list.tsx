import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { ReadinessItem } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

import { groupReadiness, readinessCode, readinessTarget, type ReadinessCode } from '../model/studio'
import { readinessOptions } from '../queries'

const readinessLabels: Record<ReadinessCode, () => string> = {
  'no-live-activity': m.studio_readiness_no_live_activity,
  'assessment-not-ready': m.studio_readiness_assessment_not_ready,
  'code-challenge-unconfigured': m.studio_readiness_code_challenge_unconfigured,
  'file-submission-unpublished': m.studio_readiness_file_submission_unpublished,
  'file-submission-not-ready': m.studio_readiness_file_submission_not_ready,
  'activity-unpublished': m.studio_readiness_activity_unpublished,
  'thumbnail-missing': m.studio_readiness_thumbnail_missing,
  'certificate-not-configured': m.studio_readiness_certificate_not_configured,
}

/** How many links one line names; the rest are «и ещё N», a link to the content (ten drafts were ten lines of links). */
const SHOWN = 5

const label = (raw: string, count: number) => {
  const code = readinessCode(raw)
  if (code === 'activity-unpublished' && count > 1) return m.studio_readiness_activities_unpublished({ count })
  return code ? readinessLabels[code]() : m.studio_readiness_unknown({ code: raw })
}

/** One readiness item: what is wrong, and a link to where it is fixed. */
function where(courseId: string, item: ReadinessItem) {
  const target = readinessTarget(item)
  if ('activityId' in target) {
    return (
      <Link
        to="/teach/courses/$courseId/activities/$activityId/edit"
        params={{ courseId, activityId: target.activityId }}
      >
        {item.title ?? target.activityId}
      </Link>
    )
  }
  return target.tab === 'settings' ? (
    <Link to="/teach/courses/$courseId/settings" params={{ courseId }}>
      {m.studio_go_settings()}
    </Link>
  ) : (
    <Link to="/teach/courses/$courseId/content" params={{ courseId }}>
      {m.studio_go_content()}
    </Link>
  )
}

/**
 * The server's readiness (blockers, then warnings), each with its fix link; "ready" when there are no blockers, unless
 * the course is `live` already (published or archived: "ready to publish" would be news from the past).
 */
export function ReadinessList({ courseId, live = false }: { courseId: string; live?: boolean }) {
  const { data: readiness } = useSuspenseQuery(readinessOptions(courseId))
  const groups = [
    { title: m.studio_readiness_blockers(), items: readiness.blockers },
    { title: m.studio_readiness_warnings(), items: readiness.warnings },
  ].filter(group => group.items.length > 0)
  return (
    <div className="flex flex-col gap-4">
      {readiness.ready && !live ? <p className="text-success">{m.studio_readiness_ready()}</p> : null}
      {groups.map(group => (
        <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
          <h3 className="text-base font-medium">{group.title}</h3>
          <ul className="flex flex-col gap-2">
            {/* Seven drafts are one line with seven links, not seven identical lines (B-CST-48). */}
            {groupReadiness(group.items).map(({ code, items }) => (
              <li key={code} className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
                <span>{label(code, items.length)}</span>
                {items.slice(0, SHOWN).map((item, index) => (
                  <span key={item.activity_id ?? index}>
                    {where(courseId, item)}
                    {index < Math.min(items.length, SHOWN) - 1 ? ',' : null}
                  </span>
                ))}
                {items.length > SHOWN ? (
                  <Link to="/teach/courses/$courseId/content" params={{ courseId }}>
                    {m.studio_readiness_more({ count: items.length - SHOWN })}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
