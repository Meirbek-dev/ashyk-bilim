import { useSuspenseQuery } from '@tanstack/react-query'
import { CircleAlert, TriangleAlert } from 'lucide-react'

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
    {
      title: m.studio_readiness_blockers(),
      items: readiness.blockers,
      icon: <CircleAlert aria-hidden className="size-4 shrink-0 translate-y-0.5 text-destructive" />,
    },
    {
      title: m.studio_readiness_warnings(),
      items: readiness.warnings,
      icon: <TriangleAlert aria-hidden className="size-4 shrink-0 translate-y-0.5 text-warning" />,
    },
  ].filter(group => group.items.length > 0)
  return (
    // A live course's lists have no headings of their own: one list, split by the same hairline.
    <div className={live ? 'flex w-full flex-col [&>section+section_ul]:border-t-0' : 'flex w-full flex-col gap-6'}>
      {readiness.ready && !live ? <p className="text-sm text-success">{m.studio_readiness_ready()}</p> : null}
      {groups.map(group => (
        <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
          {/* A live course's section is already titled «Что ещё улучшить»: no second heading right under it. */}
          <h3 className={live ? 'sr-only' : 'text-base font-semibold'}>{group.title}</h3>
          <ul className="flex flex-col divide-y border-y">
            {/* Seven drafts are one line with seven links, not seven identical lines (B-CST-48). */}
            {groupReadiness(group.items).map(({ code, items }) => (
              <li key={code} className="flex items-start gap-2 py-2.5 text-sm">
                {group.icon}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="wrap-anywhere">{label(code, items.length)}</span>
                  {/* Real activity names run to two lines: one under another, never a wrapped run of commas. */}
                  {items.slice(0, SHOWN).map((item, index) => (
                    <span key={item.activity_id ?? index} className="wrap-anywhere">
                      {where(courseId, item)}
                    </span>
                  ))}
                  {items.length > SHOWN ? (
                    <span>
                      <Link to="/teach/courses/$courseId/content" params={{ courseId }}>
                        {m.studio_readiness_more({ count: items.length - SHOWN })}
                      </Link>
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
