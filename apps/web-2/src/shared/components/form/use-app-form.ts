import { createFormHook, useStore, type DeepKeys } from '@tanstack/react-form'
import { useBlocker } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { setGlobalMessage, type GenericSchema } from 'valibot'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
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
  // What the server has: the defaults, then the values after each successful submit (which may have reset them).
  const [saved, setSaved] = useState(() => JSON.stringify(defaultValues))
  const form = useKitForm({
    defaultValues,
    validators: { onSubmit: schema },
    listeners: { onChange: ({ formApi }) => void onChange?.(formApi.state.values) },
    onSubmitInvalid: () => void focusFirstInvalid(document.activeElement?.closest('form')),
    onSubmit: async ({ value }) => {
      if (submitting.current) return
      submitting.current = true
      const origin = document.activeElement?.closest('form')
      try {
        await onSubmit(value)
        setSaved(JSON.stringify(form.state.values))
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
  const unsaved = useStore(
    form.store,
    state =>
      leaveGuard !== false &&
      !state.isSubmitting &&
      JSON.stringify(state.values) !== saved &&
      (leaveGuard === true || leaveGuard(state.values)),
  )
  useBlocker({
    disabled: !unsaved,
    enableBeforeUnload: unsaved,
    shouldBlockFn: () => !window.confirm(m.ui_unsaved_leave()),
  })
  return form
}
