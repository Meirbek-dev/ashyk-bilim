import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { formatDate, formatNumber } from '#/shared/i18n/format'
import { Link } from '#/shared/ui/link'
import { ProgressBar } from '#/shared/ui/progress-bar'
import { FocusPage } from '#/shared/ui/templates/focus-page'

import { learnerStateOptions } from '../queries'
import { BackToCourse } from './back-to-course'

/**
 * The course summary (`/learn/$courseId/complete`): where the learner stands, the certificate when the server
 * issued one, and the ways on. One primary action: continue an unfinished course, else the certificate.
 */
export function CompletionPage() {
  const { courseId } = useParams({ from: '/_authed/learn/$courseId/complete' })
  const { data: state } = useSuspenseQuery(learnerStateOptions(courseId))
  const { progress, certificate } = state
  const completed = state.enrollment_state === 'completed'
  const nextId = state.next_action?.enabled ? state.next_action.activity_id : null
  const code = certificate.issued ? certificate.verify_code : null
  return (
    <FocusPage back={<BackToCourse courseId={courseId} />} title={state.title}>
      <section className="flex flex-col items-start gap-gutter">
        <h1 className="text-2xl font-semibold">{m.player_finish()}</h1>
        {completed ? (
          <p className="text-lg">
            {progress.completed_at_unix
              ? m.player_completed_on({ date: formatDate(progress.completed_at_unix) })
              : m.player_completed()}
          </p>
        ) : (
          <div className="flex w-full flex-col gap-2">
            <ProgressBar value={progress.progress_pct} label={m.player_progress_label()} />
            <p className="text-sm text-muted-foreground tabular-nums">
              {m.player_progress({ done: progress.completed_required_count, total: progress.total_required_count })}
            </p>
          </div>
        )}
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground empty:hidden">
          {typeof progress.grade_average === 'number' ? (
            <li className="tabular-nums">{m.player_grade_average({ value: formatNumber(progress.grade_average) })}</li>
          ) : null}
          {progress.needs_grading_count > 0 ? (
            <li>{m.player_needs_grading({ count: progress.needs_grading_count })}</li>
          ) : null}
          {certificate.configured && !code ? <li>{m.player_certificate_pending()}</li> : null}
        </ul>
        <div className="flex flex-wrap gap-2">
          {!completed && nextId ? (
            <Link to="/learn/$courseId/$activityId" params={{ courseId, activityId: nextId }} variant="primary">
              {m.player_continue()}
            </Link>
          ) : null}
          {code ? (
            <Link
              to="/certificates/$certificateId/verify"
              params={{ certificateId: code }}
              variant={completed ? 'primary' : 'outline'}
            >
              {m.player_certificate_view()}
            </Link>
          ) : null}
          <Link to="/learning" variant="outline">
            {m.player_my_courses()}
          </Link>
          <Link to="/courses" variant="outline">
            {m.player_catalog()}
          </Link>
        </div>
      </section>
    </FocusPage>
  )
}
