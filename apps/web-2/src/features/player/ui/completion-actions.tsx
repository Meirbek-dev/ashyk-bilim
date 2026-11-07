import { Link as RouterLink } from '@tanstack/react-router'

import { CertificatePdfLink } from '#/features/certificates'
import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'

type CompletionActionsProps = {
  courseId: string
  completed: boolean
  /** The activity to go on with, when the server offers one. */
  nextId: string | null
  /** The verify code of the issued certificate, when there is one. */
  code: string | null
}

/** The ways on: continue the course, view the certificate, download its PDF. */
export function CompletionActions({ courseId, completed, nextId, code }: CompletionActionsProps) {
  return (
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
  )
}
