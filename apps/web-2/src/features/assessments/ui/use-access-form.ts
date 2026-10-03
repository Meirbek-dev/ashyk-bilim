import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AccessView, AssessmentDetail, SetAccessRequest } from '#/shared/api/gen/types.gen'
import { vSetAccessRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { toast } from '#/shared/ui/toast'

import { assessmentOptions, setAccessOptions } from '../queries'
import { isStale } from './use-version'

/** Restricted with nobody chosen locks every learner out (UX-057): saving that asks first. */
const locksOut = (body: SetAccessRequest) =>
  body.mode === 'restricted' && !body.user_ids?.length && !body.usergroup_ids?.length

/**
 * The access form: `PUT .../access` with `If-Match` = the assessment's `policy_version` (the access ETag, UX-154).
 * A 412 opens the conflict dialog; "reload and retry" reads the new version and saves the same choice over it.
 */
export function useAccessForm(activityId: string, assessment: AssessmentDetail, view: AccessView) {
  const queryClient = useQueryClient()
  const save = useMutation(setAccessOptions(queryClient, activityId, assessment.id))
  const [conflict, setConflict] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [defaultValues] = useState<SetAccessRequest>(() => ({
    mode: view.mode,
    user_ids: view.users.map(user => user.id),
    usergroup_ids: view.usergroups.map(group => group.id),
  }))
  const version = () => queryClient.getQueryData(assessmentOptions(activityId).queryKey)?.policy_version
  const send = (body: SetAccessRequest) =>
    save.mutateAsync(
      { path: { assessment_id: assessment.id }, body, headers: { 'If-Match': version() ?? assessment.policy_version } },
      {
        onSuccess: () => {
          setConflict(false)
          setConfirming(false)
          toast.add({ title: m.assessments_access_saved() })
        },
        onError: error => setConflict(isStale(error)),
      },
    )
  const form = useAppForm(vSetAccessRequest, {
    defaultValues,
    onSubmit: body => (locksOut(body) && !confirming ? setConfirming(true) : send(body)),
  })
  const reloadAndRetry = async () => {
    await queryClient.fetchQuery({ ...assessmentOptions(activityId), staleTime: 0 })
    await send(form.state.values).catch(() => undefined)
  }
  return { form, save, conflict, setConflict, confirming, setConfirming, send, reloadAndRetry }
}
