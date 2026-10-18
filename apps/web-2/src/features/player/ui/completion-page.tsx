import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, Link as RouterLink } from '@tanstack/react-router'

import { CertificatePdfLink } from '#/features/certificates'
import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { formatNumber } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/components/button-variants'
import { Link } from '#/shared/components/link'

import { courseCertificatesOptions, learnerStateOptions } from '../queries'
import { BackToCourse } from './back-to-course'
import { CompletionHeader } from './completion-header'

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
        <CompletionHeader progress={progress} completed={completed} />
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
        <p className="flex flex-wrap gap-x-4 gap-y-2 self-stretch border-t pt-4 text-sm">
          <Link to="/learning">{m.player_my_courses()}</Link>
          <Link to="/courses">{m.player_catalog()}</Link>
        </p>
      </section>
    </FocusPage>
  )
}
