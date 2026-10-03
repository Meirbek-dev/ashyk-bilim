import { useMutation } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { enrollOptions } from '../queries'

/** Enrol, then the header shows what the refreshed learner state offers ("Start"), without a reload (UX-119). */
export function EnrollButton({ courseId }: { courseId: CourseId }) {
  const enroll = useMutation(enrollOptions(courseId))
  const submit = () =>
    enroll.mutate({ path: { course_id: courseId } }, { onSuccess: () => toast.add({ title: m.course_enrolled() }) })
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={submit} disabled={enroll.isPending}>
        {enroll.isPending ? <Spinner data-icon="inline-start" /> : null}
        {m.course_enroll()}
      </Button>
      {enroll.error ? <p className="text-sm text-destructive">{presentError(enroll.error)}</p> : null}
    </div>
  )
}
