import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { ReadinessItem } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/ui/link'

import { readinessCode, readinessTarget, type ReadinessCode } from '../model/studio'
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

const label = (item: ReadinessItem) => {
  const code = readinessCode(item.code)
  return code ? readinessLabels[code]() : m.studio_readiness_unknown({ code: item.code })
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

/** The server's readiness (blockers, then warnings), each with its fix link; "ready" when there are no blockers. */
export function ReadinessList({ courseId }: { courseId: string }) {
  const { data: readiness } = useSuspenseQuery(readinessOptions(courseId))
  const groups = [
    { title: m.studio_readiness_blockers(), items: readiness.blockers },
    { title: m.studio_readiness_warnings(), items: readiness.warnings },
  ].filter(group => group.items.length > 0)
  return (
    <div className="flex flex-col gap-4">
      {readiness.ready ? <p className="text-success">{m.studio_readiness_ready()}</p> : null}
      {groups.map(group => (
        <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
          <h3 className="text-base font-medium">{group.title}</h3>
          <ul className="flex flex-col gap-2">
            {group.items.map(item => (
              <li key={`${item.code}-${item.activity_id ?? ''}`} className="flex flex-wrap gap-x-2 text-sm">
                <span>{label(item)}</span>
                {where(courseId, item)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
