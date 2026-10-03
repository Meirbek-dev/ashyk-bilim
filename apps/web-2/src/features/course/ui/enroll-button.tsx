import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import { enrollOptions } from '../queries'

/** Enrol, then the header shows what the refreshed learner state offers ("Start"), without a reload (UX-119). */
export function EnrollButton({ courseId }: { courseId: CourseId }) {
  const enroll = useMutation(enrollOptions(courseId))
  const submit = () => enroll.mutate({ path: { id: courseId } }, { onSuccess: () => toast(m.course_enrolled()) })
  return (
    <div className="flex flex-col gap-2">
      <Button pending={enroll.isPending} onClick={submit}>
        {m.course_enroll()}
      </Button>
      {enroll.error ? <p className="text-sm text-destructive">{presentError(enroll.error)}</p> : null}
    </div>
  )
}
