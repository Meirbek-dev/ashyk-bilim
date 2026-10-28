import { createFormHook, useStore, type DeepKeys } from '@tanstack/react-form'
import { QueryClientContext } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useContext, useEffect, useRef, useState } from 'react'
import { setGlobalMessage, type GenericSchema } from 'valibot'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { holdSession } from '#/shared/api/held-session'
import { releaseSessionHold } from '#/shared/api/query-client'
import { confirmLeave } from '#/shared/components/leave-confirm'
import { validationMessage } from '#/shared/i18n/validation'

import { CheckboxField } from './checkbox-field'
import { splitFieldErrors } from './field-errors'
import { fieldContext, formContext } from './form-context'
import { RadioGroupField } from './radio-group-field'
import { SelectField } from './select-field'
import { SwitchField } from './switch-field'
import { TextField } from './text-field'
import { TextareaField } from './textarea-field'

const { useAppForm: useKitForm } = /* @__PURE__ */ createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField, SelectField, CheckboxField, SwitchField, RadioGroupField },
  formComponents: {},
})

/**
 * After a refused submit (client check or a 422), the first field marked invalid in the submitted form takes focus,
 * so the keyboard and the screen reader land on what to fix, not on the button. The form is the one holding focus at
 * submit (its button, or a field Enter was pressed in); after the next paint its fields carry `aria-invalid`.
 */
const focusFirstInvalid = (form: Element | null | undefined) =>
  form && requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())

/** The form of the focused control: its own `form` (a dialog's footer button points at it by id), else the enclosing. */
const submittedForm = (): Element | null | undefined => {
  const focused = document.activeElement
  return focused && 'form' in focused && focused.form instanceof HTMLFormElement
    ? focused.form
    : focused?.closest('form')
}

/**
 * Unsaved edits keep the page across a lost session (`shared/api/held-session.ts`), as a running upload does: a 401
 * (the session ended in another tab or expired) then shows the «sign in again in a new tab» notice instead of leaving
 * for /login with the text; after signing in there, Save works here.
 */
function useHoldWhileEdited(edited: boolean) {
  const queryClient = useContext(QueryClientContext)
  useEffect(() => {
    const release = edited ? holdSession() : null
    return () => {
      if (release && queryClient) releaseSessionHold(queryClient, release)
      else release?.()
    }
  }, [edited, queryClient])
}

type AppFormOptions<T> = {
  defaultValues: T
  /** Usually `body => mutation.mutateAsync({ body })`: a 422's field errors land under their fields. */
  onSubmit: (value: T) => unknown
  /**
   * Ask before a link, a reload or a closed tab drops what was typed and not saved (settings-like forms; not search
   * boxes). A navigation the submit itself starts is never asked about. A function asks only about values it calls
   * worth keeping (an editor typed into and emptied again holds nothing to lose).
   */
  leaveGuard?: boolean | ((value: T) => boolean)
  /** After each edit of a field, with the values then (the form's `listeners.onChange`): an autosave submits here. */
  onChange?: (value: T) => unknown
}

/**
 * A form validated on submit by the generated body schema (`vXxxRequest`), with the kit fields bound
 * (`form.AppField` -> `field.TextField`...). Server `field_errors` are shown under the matching fields.
 */
export function useAppForm<T>(
  schema: GenericSchema<T>,
  { defaultValues, onSubmit, leaveGuard = false, onChange }: AppFormOptions<T>,
) {
  // Every Valibot issue text comes from the Paraglide map (spec 7.8). Set here, not at import time, so the
  // module has no side effect and stays out of bundles that only import a feature's index. A named import: the
  // build treats `v.<fn>()` calls as pure (vite.config.ts), which would drop this one.
  setGlobalMessage(validationMessage)
  // The mutation starts only after the async validation, so `pending` cannot disable the button before a double
  // click (or Enter pressed twice) submits again: a submit while one is in flight is dropped.
  const submitting = useRef(false)
  const recheck = ({
    formApi,
  }: {
    formApi: { state: { submissionAttempts: number }; parseValuesWithSchema: (schema: GenericSchema<T>) => unknown }
  }) => (formApi.state.submissionAttempts > 0 ? formApi.parseValuesWithSchema(schema) : undefined)
  // What the server has: the defaults, then the values after each successful submit (which may have reset them).
  const [saved, setSaved] = useState(() => JSON.stringify(defaultValues))
  const form = useKitForm({
    defaultValues,
    // From the first submit on, the form re-checks on every edit: a field the user fixes drops its message while they
    // type, so «Save» does not jump up under the pointer as the text vanishes on blur (that click landed on nothing and
    // was lost), and a field left unfixed keeps its message when focus moves on (a blur used to clear it).
    validators: { onSubmit: schema, onChange: recheck },
    listeners: { onChange: ({ formApi }) => void onChange?.(formApi.state.values) },
    onSubmitInvalid: () => void focusFirstInvalid(submittedForm()),
    onSubmit: async ({ value }) => {
      if (submitting.current) return
      submitting.current = true
      const origin = submittedForm()
      try {
        await onSubmit(value)
        setSaved(JSON.stringify(form.state.values))
        // A refusal the caller placed under a field itself (a wrong code, a taken name: `form.setFieldMeta`) takes
        // focus like a 422's field errors. The submit's own check has cleared the earlier ones.
        if (Object.keys(form.fieldInfo).some(name => isField(name) && form.getFieldMeta(name)?.errorMap.onSubmit))
          focusFirstInvalid(origin)
      } catch (error) {
        // The mutation keeps the error for the region alert; only the field errors are placed here.
        if (!(error instanceof ApiError)) return
        const { byField } = splitFieldErrors(error.fieldErrors, Object.keys(form.fieldInfo))
        for (const [name, message] of byField) {
          if (isField(name))
            form.setFieldMeta(name, meta => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: message } }))
        }
        if (byField.size > 0) focusFirstInvalid(origin)
      } finally {
        submitting.current = false
      }
    },
  })
  const isField = (name: string): name is DeepKeys<T> => name in form.fieldInfo
  const edited = (values: T) =>
    leaveGuard !== false && JSON.stringify(values) !== saved && (leaveGuard === true || leaveGuard(values))
  // Held through the submit too: a Save that answers 401 must find the edits still holding the page.
  useHoldWhileEdited(useStore(form.store, state => edited(state.values)))
  const unsaved = useStore(form.store, state => !state.isSubmitting && edited(state.values))
  useBlocker({
    disabled: !unsaved,
    enableBeforeUnload: unsaved,
    shouldBlockFn: async () =>
      !(await confirmLeave({ title: m.ui_unsaved_leave(), consequence: m.ui_unsaved_leave_consequence() })),
  })
  return form
}
