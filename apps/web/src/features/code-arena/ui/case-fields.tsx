import { Plus, X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { Button } from '#/shared/ui/button'

import { newTest, testCounts } from '../model/body-form'
import type { CodeFormApi } from './use-code-item-form'

/**
 * The test builder (B-COD-16): each test case has a description, input, expected output, visible or hidden, and a
 * weight; added and removed here, saved with the item.
 */
export function CaseFields({ form }: { form: CodeFormApi }) {
  return (
    <form.AppField name="tests" mode="array">
      {list => {
        return (
          <fieldset className="flex min-w-0 flex-col gap-4">
            <legend className="mb-2 text-lg font-semibold">{m.code_cases()}</legend>
            {/* The array field renders on adds and removals only: the counts follow every visible switch. */}
            <form.Subscribe selector={state => m.code_cases_counts(testCounts(state.values.tests))}>
              {counts => <p className="text-sm text-muted-foreground">{counts}</p>}
            </form.Subscribe>
            {list.state.value.length === 0 ? (
              <p className="text-sm text-muted-foreground">{m.code_cases_empty()}</p>
            ) : null}
            <ol className="flex flex-col divide-y">
              {list.state.value.map((test, index) => (
                <li key={test.id} className="flex min-w-0 flex-col gap-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium">{m.code_case({ number: index + 1 })}</span>
                    <IconButton
                      label={m.code_case_remove({ number: index + 1 })}
                      icon={<X aria-hidden />}
                      onClick={() => list.removeValue(index)}
                    />
                  </div>
                  <form.AppField name={`tests[${index}].description`}>
                    {field => <field.TextField label={m.code_field_description()} />}
                  </form.AppField>
                  <div className="grid gap-4 @3xl:grid-cols-2">
                    <form.AppField name={`tests[${index}].input`}>
                      {field => <field.TextareaField label={m.code_field_input()} />}
                    </form.AppField>
                    <form.AppField name={`tests[${index}].expected`}>
                      {field => <field.TextareaField label={m.code_field_expected()} />}
                    </form.AppField>
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="w-32">
                      <form.AppField name={`tests[${index}].weight`}>
                        {field => <field.TextField label={m.code_field_weight()} inputMode="numeric" />}
                      </form.AppField>
                    </div>
                    <form.AppField name={`tests[${index}].visible`}>
                      {field => <field.CheckboxField label={m.code_field_visible()} />}
                    </form.AppField>
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <Button type="button" variant="outline" onClick={() => list.pushValue(newTest())}>
                <Plus data-icon="inline-start" aria-hidden />
                {m.code_case_add()}
              </Button>
            </div>
          </fieldset>
        )
      }}
    </form.AppField>
  )
}
