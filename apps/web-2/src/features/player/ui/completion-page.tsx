import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { CertificateShare } from '#/features/certificates'
import { m } from '#/paraglide/messages'
import { CourseCover } from '#/shared/components/course-cover'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { Link } from '#/shared/components/link'

import { courseCertificatesOptions, courseCoverOptions, learnerStateOptions } from '../queries'
import { BackToCourse } from './back-to-course'
import { CompletionActions } from './completion-actions'
import { CompletionFacts } from './completion-facts'
import { CompletionHeader } from './completion-header'

/**
 * The course summary (`/learn/$courseId/complete`): where the learner stands, the certificate when the server
 * issued one, and the ways on. One primary action: continue an unfinished course, else the certificate. A finished
 * course is the loudest screen of the app: the course's own solid colour to the edges with the greeting in display type
 * on it, the ways on below. An unfinished one is no arrival yet: it stays on the paper, the summary beside the course's picture.
 */
export function CompletionPage() {
  const { courseId } = useParams({ from: '/_authed/learn/$courseId/complete' })
  const { data: state } = useSuspenseQuery(learnerStateOptions(courseId))
  // Not the state's `certificate.verify_code`: that one only reports, this read issues a certificate configured after
  // the learner finished.
  const { data: certificates } = useSuspenseQuery(courseCertificatesOptions(courseId))
  const { data: course } = useQuery(courseCoverOptions(courseId))
  const { progress, certificate } = state
  const completed = state.enrollment_state === 'completed'
  const nextId = state.next_action?.enabled ? state.next_action.activity_id : null
  const issued = certificates[0]
  const code = issued?.certificate.verify_code ?? null
  const facts = <CompletionFacts progress={progress} certificateConfigured={certificate.configured} code={code} />
  const actions = <CompletionActions courseId={courseId} completed={completed} nextId={nextId} code={code} />
  // The moment a learner wants to show it (B-CRT-09): the link to copy and LinkedIn's form.
  const share = issued ? (
    <div className="flex flex-wrap gap-2">
      <CertificateShare
        code={issued.certificate.verify_code}
        name={issued.certificate.certificate_name}
        issuedAtUnix={issued.certificate.issued_at_unix}
        linkedIn
        variant="ghost"
      />
    </div>
  ) : null
  const ways = (
    <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      <Link to="/learning">{m.player_my_courses()}</Link>
      <Link to="/courses">{m.player_catalog()}</Link>
    </p>
  )
  return (
    <FocusPage back={<BackToCourse courseId={courseId} />} title={state.title} wide={completed}>
      {completed ? (
        // Out to the page's edges and down to its foot: the main column's padding is taken back. The colour takes what
        // the facts below leave, so the greeting always stands on a full field.
        <section className="-mx-4 -my-gutter flex min-h-[calc(100dvh-3.5rem)] flex-col @3xl:-mx-8 @3xl:-my-10">
          <div
            data-dye="ink"
            className="ab-dye flex flex-1 flex-col justify-end px-4 pt-24 pb-10 @3xl:px-8 @3xl:pt-32 @3xl:pb-14"
          >
            <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-6">
              <p className="text-lg text-balance wrap-anywhere">{state.title}</p>
              <CompletionHeader progress={progress} completed />
            </div>
          </div>
          <div className="px-4 py-gutter @3xl:px-8 @3xl:py-10">
            <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-gutter">
              {facts}
              {actions}
              {share}
              <div className="border-t pt-5">{ways}</div>
            </div>
          </div>
        </section>
      ) : (
        <section className="@container flex flex-col gap-gutter">
          <div className="grid gap-6 @lg:grid-cols-[13rem_minmax(0,1fr)] @lg:items-start @lg:gap-8">
            <CourseCover imageKey={course?.thumbnail_key ?? null} className="rounded-md" />
            <CompletionHeader progress={progress} completed={false} />
          </div>
          {facts}
          {actions}
          {share}
          <div className="border-t pt-5">{ways}</div>
        </section>
      )}
    </FocusPage>
  )
}
