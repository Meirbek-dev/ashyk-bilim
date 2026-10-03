import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { Course, UserId } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { application } from '../model/course'
import { applyOptions, contributorsOptions, withdrawOptions } from '../queries'

const isDecided = (error: unknown) => error instanceof ApiError && (error.status === 403 || error.status === 404)

/** Apply to co-author an open course, or withdraw one's own pending application (UX-023). */
export function ContributorApplication({ course, userId }: { course: Course; userId: UserId }) {
  const queryClient = useQueryClient()
  const roster = useSuspenseQuery(contributorsOptions(course.id))
  const apply = useMutation(applyOptions(queryClient, course.id))
  const withdraw = useMutation(withdrawOptions(queryClient, course.id, userId))
  const state = application(course, roster.data, userId)
  if (!state) return null
  const path = { course_id: course.id }
  const onApply = () => apply.mutate({ path }, { onSuccess: () => toast.add({ title: m.course_applied() }) })
  const onWithdraw = () =>
    withdraw.mutate(
      { path: { ...path, user_id: userId } },
      {
        onSuccess: () => toast.add({ title: m.course_withdrawn() }),
        // The creator already decided (UX-050): rejected is 404, approved is 403. The fresh roster shows which.
        onError: error => {
          if (isDecided(error)) void roster.refetch()
        },
      },
    )
  const decided = isDecided(withdraw.error)
  const error = decided ? m.course_application_decided() : (apply.error ?? withdraw.error)
  return (
    <section className="flex flex-col items-start gap-2">
      {state === 'pending' ? (
        <>
          <p className="text-sm text-muted-foreground">{m.course_application_pending()}</p>
          <Button variant="outline" onClick={onWithdraw} disabled={withdraw.isPending}>
            {withdraw.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.course_withdraw()}
          </Button>
        </>
      ) : (
        <Button variant="outline" onClick={onApply} disabled={apply.isPending}>
          {apply.isPending ? <Spinner data-icon="inline-start" /> : null}
          {m.course_apply()}
        </Button>
      )}
      {error ? (
        <p className="text-sm text-muted-foreground">{typeof error === 'string' ? error : presentError(error)}</p>
      ) : null}
    </section>
  )
}
