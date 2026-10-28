import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail, AssessmentItem } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { presentError } from '#/shared/i18n/errors'
import { FieldError } from '#/shared/ui/field'

import { itemForm, itemFormSchema, itemPatch } from '../model/item-form'
import { editMode } from '../model/route'
import { BodyFields } from './body-fields'
import { ItemActions } from './item-actions'
import { useItemAutosave } from './use-item-autosave'

type ItemEditorProps = { activityId: string; assessment: AssessmentDetail; item: AssessmentItem }

/**
 * The open question: title, points and its body. Every change is validated by the generated schema and, when valid,
 * autosaved after a pause; an invalid one shows under its field and is not sent. On an answered live assessment only
 * the wording takes edits (B-ASM-31): points, answers and the structure stay read-only. Keyed by the question.
 */
export function ItemEditor({ activityId, assessment, item }: ItemEditorProps) {
  const mode = editMode(assessment)
  // Captured once: saving puts the answer into the cache, which must not reset what the author is typing.
  const [defaultValues] = useState(() => itemForm(item))
  const autosave = useItemAutosave(activityId, assessment.id, item.id, itemPatch(defaultValues))
  const form = useAppForm(itemFormSchema, {
    defaultValues,
    onSubmit: values => autosave.change(itemPatch(values)),
    leaveGuard: true,
    // Each edit is a submit: the schema runs, a valid form reaches onSubmit.
    onChange: async () => {
      await form.handleSubmit()
      if (!form.state.isValid) autosave.invalid()
    },
  })

  return (
    <section aria-labelledby={`item-${item.id}`} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`item-${item.id}`} className="min-w-0 flex-1 text-lg font-semibold wrap-anywhere">
          {item.position}. {item.title || m.assessments_item_untitled()}
        </h2>
        {mode === 'all' ? (
          <ItemActions
            activityId={activityId}
            assessmentId={assessment.id}
            item={item}
            items={assessment.items}
            lastOfLive={assessment.items.length === 1 && ['published', 'scheduled'].includes(assessment.lifecycle)}
          />
        ) : null}
      </div>
      {autosave.error ? <ErrorAlert>{presentError(autosave.error)}</ErrorAlert> : null}
      <form
        noValidate
        aria-label={item.title || m.assessments_item_untitled()}
        className="flex flex-col gap-4"
        onSubmit={event => event.preventDefault()}
      >
        <fieldset disabled={mode === 'none'} className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <div className="min-w-60 flex-1">
              <form.AppField name="title">
                {field => <field.TextField label={m.assessments_field_title()} />}
              </form.AppField>
            </div>
            <fieldset disabled={mode !== 'all'} className="w-32">
              <form.AppField name="points">
                {field => <field.TextField label={m.assessments_field_points()} inputMode="decimal" />}
              </form.AppField>
            </fieldset>
          </div>
          <form.Field name="body">
            {field => (
              <>
                <BodyFields body={field.state.value} onChange={field.handleChange} mode={mode} />
                {field.state.meta.errors.length > 0 ? <FieldError>{m.validation_invalid()}</FieldError> : null}
              </>
            )}
          </form.Field>
        </fieldset>
      </form>
      <ConflictDialog {...autosave.conflict} />
    </section>
  )
}
