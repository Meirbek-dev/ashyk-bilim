import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, Link as RouterLink } from '@tanstack/react-router'

import { CertificatePdfLink } from '#/features/certificates'
import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { formatDate, formatNumber, formatPercent } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/components/button-variants'
import { Progress } from '#/shared/components/progress'
import { ProgressRing } from '#/shared/components/progress-ring'

import { courseCertificatesOptions, learnerStateOptions } from '../queries'
import { BackToCourse } from './back-to-course'
import { WaysOn } from './ways-on'

/**
 * The course summary (`/learn/$courseId/complete`): where the learner stands, the certificate when the server
 * issued one, and the ways on. One primary action: continue an unfinished course, else the certificate.
 */
export function CompletionPage() {
  const { courseId } = useParams({ from: '/_authed/learn/$courseId/complete' })
  const { data: state } = useSuspenseQuery(learnerStateOptions(courseId))
  // Not the state's `certificate.verify_code`: that one only reports, this read issues a certificate configured after
  // the learner finished.
  const { data: certificates } = useSuspenseQuery(courseCertificatesOptions(courseId))
  const { progress, certificate } = state
  const completed = state.enrollment_state === 'completed'
  const nextId = state.next_action?.enabled ? state.next_action.activity_id : null
  const code = certificates[0]?.certificate.verify_code ?? null
  return (
    <FocusPage back={<BackToCourse courseId={courseId} />} title={state.title}>
      <section className="flex flex-col items-start gap-gutter">
        <header className="flex items-center gap-5">
          <ProgressRing
            value={completed ? 100 : progress.progress_pct}
            tone={completed ? 'stroke-reward' : 'stroke-primary'}
            className="size-24"
          >
            <span aria-hidden className="font-heading text-xl font-semibold tabular-nums">
              {formatPercent(completed ? 100 : Math.round(progress.progress_pct))}
            </span>
          </ProgressRing>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-display font-semibold">{m.player_finish()}</h1>
            {completed ? (
              <p className="text-lg">
                {progress.completed_at_unix
                  ? m.player_completed_on({ date: formatDate(progress.completed_at_unix) })
                  : m.player_completed()}
              </p>
            ) : (
              <>
                <Progress value={progress.progress_pct} aria-label={m.player_progress_label()} className="sr-only" />
                <p className="text-muted-foreground tabular-nums">
                  {m.player_progress({
                    done: progress.completed_required_count,
                    total: progress.total_required_count,
                  })}
                </p>
              </>
            )}
          </div>
        </header>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground empty:hidden">
          {typeof progress.grade_average === 'number' ? (
            <li className="tabular-nums">{m.player_grade_average({ value: formatNumber(progress.grade_average) })}</li>
          ) : null}
          {progress.needs_grading_count > 0 ? (
            <li>{m.player_needs_grading({ count: progress.needs_grading_count })}</li>
          ) : null}
          {certificate.configured && !code ? <li>{m.player_certificate_pending()}</li> : null}
        </ul>
        <div className="flex flex-wrap gap-2 empty:hidden">
          {!completed && nextId ? (
            <RouterLink
              to="/learn/$courseId/$activityId"
              params={{ courseId, activityId: nextId }}
              className={buttonVariants()}
            >
              {m.player_continue()}
            </RouterLink>
          ) : null}
          {code ? (
            <RouterLink
              to="/certificates/$certificateId/verify"
              params={{ certificateId: code }}
              className={buttonVariants({ variant: completed ? 'default' : 'outline' })}
            >
              {m.player_certificate_view()}
            </RouterLink>
          ) : null}
          {code ? <CertificatePdfLink code={code} /> : null}
        </div>
        <WaysOn />
      </section>
    </FocusPage>
  )
}
