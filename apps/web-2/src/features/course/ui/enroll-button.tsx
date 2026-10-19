import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useHydrated, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useEffectEvent, useRef } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { enrollOptions } from '../queries'

/**
 * Enrol, then the header shows what the refreshed learner state offers ("Start"), without a reload (UX-119). Disabled
 * until hydration: a click React replays mid-hydration changed the header under it (React error 418). Back from the
 * sign-in a guest's «Записаться» started (`?enroll=1`), it runs once by itself and the flag leaves the URL (B-CRS-16).
 */
export function EnrollButton({ courseId }: { courseId: CourseId }) {
  const enroll = useMutation(enrollOptions(useQueryClient(), courseId))
  const hydrated = useHydrated()
  const submit = () =>
    enroll.mutate({ path: { course_id: courseId } }, { onSuccess: () => toast.add({ title: m.course_enrolled() }) })
  const { enroll: asked } = useSearch({ strict: false })
  const navigate = useNavigate()
  const ran = useRef(false)
  const runAsked = useEffectEvent(() => {
    ran.current = true
    submit()
    void navigate({ to: '.', search: previous => ({ ...previous, enroll: undefined }), replace: true })
  })
  useEffect(() => {
    if (hydrated && asked === 1 && !ran.current) runAsked()
  }, [hydrated, asked])
  return (
    <div className="flex flex-col gap-2">
      <SubmitButton
        onClick={submit}
        pending={enroll.isPending}
        disabled={!hydrated}
        data-hydrating={hydrated ? undefined : true}
      >
        {m.course_enroll()}
      </SubmitButton>
      {enroll.error ? <p className="text-sm text-destructive">{presentError(enroll.error)}</p> : null}
    </div>
  )
}
