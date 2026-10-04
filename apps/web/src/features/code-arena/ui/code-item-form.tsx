import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { isRunnerDown, languagesIn, type CodeItem } from '../model/arena'
import { runnerStateOptions } from '../queries'
import { CaseFields } from './case-fields'
import { LanguageFields } from './language-fields'
import { ReferenceResults } from './reference-results'
import { RunnerDown } from './runner-down'
import { StatementFields } from './statement-fields'
import { useCodeItemForm } from './use-code-item-form'

type CodeItemFormProps = { activityId: string; challenge: AssessmentDetail; code: CodeItem }

/**
 * The code item editor (B-COD-13..19): statement, languages with starter code and reference solution, test cases,
 * limits; one "Save" (only with changes) and "Check reference". Without `update` everything is read only. A runner
 * that is down keeps the form and "Save" working; "Check reference" waits for "Retry" (B-COD-23).
 */
export function CodeItemForm({ activityId, challenge, code }: CodeItemFormProps) {
  const { data: runner, refetch, isFetching } = useSuspenseQuery(runnerStateOptions())
  const languages = languagesIn(runner)
  const { form, update, check, checkReference, unsaved, editable } = useCodeItemForm({ activityId, challenge, code })
  return (
    <form
      noValidate
      aria-labelledby="code-studio"
      className="flex max-w-3xl min-w-0 flex-col gap-8"
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 id="code-studio" className="text-xl font-semibold">
          {m.code_studio_title()}
        </h2>
        <p className="text-sm text-muted-foreground">{editable ? m.code_studio_hint() : m.code_read_only()}</p>
      </div>
      <fieldset disabled={!editable} className="flex min-w-0 flex-col gap-8">
        <StatementFields form={form} />
        <LanguageFields form={form} runner={runner} readOnly={!editable} />
        <CaseFields form={form} />
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">{m.code_limits()}</h3>
          <div className="flex flex-wrap gap-4">
            <div className="w-40">
              <form.AppField name="time">
                {field => (
                  <field.TextField label={m.code_field_time()} description={m.code_limits_hint()} inputMode="numeric" />
                )}
              </form.AppField>
            </div>
            <div className="w-40">
              <form.AppField name="memory">
                {field => <field.TextField label={m.code_field_memory()} inputMode="numeric" />}
              </form.AppField>
            </div>
          </div>
        </div>
      </fieldset>
      {update.error ? <ErrorAlert>{presentError(update.error)}</ErrorAlert> : null}
      {runner.state === 'down' || isRunnerDown(check.error) ? (
        <RunnerDown
          pending={isFetching}
          onRetry={() => {
            check.reset()
            void refetch()
          }}
        />
      ) : check.error ? (
        <ErrorAlert>{presentError(check.error)}</ErrorAlert>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <form.Subscribe selector={state => unsaved(state.values)}>
            {changed => (
              <Button type="submit" disabled={!changed || update.isPending}>
                {update.isPending ? <Spinner data-icon="inline-start" /> : null}
                {m.ui_save()}
              </Button>
            )}
          </form.Subscribe>
          <Button
            type="button"
            variant="outline"
            disabled={runner.state === 'down' || check.isPending || update.isPending}
            onClick={() => void checkReference()}
          >
            {check.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.code_check()}
          </Button>
        </div>
      ) : null}
      {check.data ? <ReferenceResults results={check.data.results} languages={languages} /> : null}
    </form>
  )
}
