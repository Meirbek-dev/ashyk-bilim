import { Plus } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { useFocusNew } from '#/shared/lib/focus-new'
import { Button } from '#/shared/ui/button'

import { newTest, testCounts, type TestForm } from '../model/body-form'
import { CaseRow } from './case-row'
import { StudioSection } from './studio-section'
import { TestFilesBar } from './test-files-bar'
import type { CodeFormApi } from './use-code-item-form'

/**
 * The test builder (B-COD-16): each test case has a description, input, expected output, visible or hidden, and a
 * weight; added and removed here, read from or written to a JSON/CSV file (B-COD-25), saved with the item. Read only,
 * the fields are disabled and the file bar stays outside them: a locked challenge's cases still download.
 */
export function CaseFields({ form, editable }: { form: CodeFormApi; editable: boolean }) {
  const focusNew = useFocusNew<TestForm>(test => test.id)
  return (
    <form.AppField name="tests" mode="array">
      {list => (
        <StudioSection
          title={m.code_cases()}
          hint={
            // The array field renders on adds and removals only: the counts follow every visible switch.
            <form.Subscribe selector={state => m.code_cases_counts(testCounts(state.values.tests))}>
              {counts => <p>{counts}</p>}
            </form.Subscribe>
          }
        >
          {list.state.value.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.code_cases_empty()}</p>
          ) : (
            <fieldset disabled={!editable} className="min-w-0">
              <ol className="flex flex-col divide-y">
                {list.state.value.map((test, index) => (
                  <CaseRow
                    key={test.id}
                    ref={focusNew.ref(test)}
                    form={form}
                    index={index}
                    editable={editable}
                    onRemove={() => list.removeValue(index)}
                  />
                ))}
              </ol>
            </fieldset>
          )}
          {editable ? (
            <TestFilesBar
              tests={list.state.value}
              onImport={imported => {
                for (const test of imported) list.pushValue(test)
              }}
              lead={
                <Button type="button" variant="outline" onClick={() => list.pushValue(focusNew.added(newTest()))}>
                  <Plus data-icon="inline-start" aria-hidden />
                  {m.code_case_add()}
                </Button>
              }
            />
          ) : (
            <TestFilesBar tests={list.state.value} />
          )}
        </StudioSection>
      )}
    </form.AppField>
  )
}
