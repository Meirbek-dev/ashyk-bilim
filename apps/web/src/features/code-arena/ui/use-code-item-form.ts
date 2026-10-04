import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { toast } from '#/shared/ui/toast'

import { findCodeItem, type CodeItem } from '../model/arena'
import { bodyChanged, codeBodyOf, codeForm, codeFormSchema, type CodeForm } from '../model/body-form'
import { challengeOptions, referenceCheckOptions, updateCodeOptions } from '../queries'

const useCodeForm = (defaultValues: CodeForm, onSubmit: (values: CodeForm) => unknown) =>
  useAppForm(codeFormSchema, { defaultValues, onSubmit })

export type CodeFormApi = ReturnType<typeof useCodeForm>

type Ids = { activityId: string; challenge: AssessmentDetail; code: CodeItem }

/**
 * The code item's form: saved as a whole with "Save" (B-COD-18, `If-Match` = the challenge version), the answer replaces
 * the item in the cached assessment. "Check reference" saves unsaved changes first, because the server runs the
 * stored solutions (B-COD-19, UX-281).
 */
export function useCodeItemForm({ activityId, challenge, code }: Ids) {
  const queryClient = useQueryClient()
  const update = useMutation(updateCodeOptions(queryClient, activityId))
  const check = useMutation(referenceCheckOptions())
  // Captured once: a save puts the answer into the cache, which must not reset what the author is typing.
  const [defaultValues] = useState(() => codeForm(code.body))
  const form = useCodeForm(defaultValues, values =>
    update.mutateAsync(
      {
        path: { item_id: code.item.id },
        // The item is named after the challenge (the server's readiness needs a title; UX-283).
        body: { body: { ...codeBodyOf(values, code.body), kind: 'code' }, title: challenge.title },
        // A 412 (someone else saved the challenge) shows as the save's error text.
        headers: { 'If-Match': queryClient.getQueryData(challengeOptions(activityId).queryKey)?.version },
      },
      { onSuccess: () => toast.add({ title: m.code_saved() }) },
    ),
  )
  const unsaved = (values: CodeForm, stored: CodeItem | null) =>
    !stored || stored.item.title !== challenge.title || bodyChanged(values, stored.body)
  const stored = () => findCodeItem(queryClient.getQueryData(challengeOptions(activityId).queryKey) ?? null)

  async function checkReference() {
    check.reset()
    if (unsaved(form.state.values, stored())) {
      await form.handleSubmit()
      if (unsaved(form.state.values, stored())) return
    }
    check.mutate({ path: { item_id: code.item.id }, headers: { 'Idempotency-Key': crypto.randomUUID() } })
  }

  return {
    form,
    update,
    check,
    checkReference,
    /** Whether "Save" has something to send (B-COD-18). */
    unsaved: (values: CodeForm) => unsaved(values, code),
    editable: challenge.allowed_actions.includes('edit'),
  }
}
