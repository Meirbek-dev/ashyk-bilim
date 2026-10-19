import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail, EditLock } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { isRunnerDown, languagesIn, type CodeItem } from '../model/arena'
import { runnerStateOptions } from '../queries'
import { CaseFields } from './case-fields'
import { TestFilesBar } from './test-files-bar'
import { LanguageFields } from './language-fields'
import { LimitFields } from './limit-fields'
import { ReferenceResults } from './reference-results'
import { RunnerDown } from './runner-down'
import { StatementFields } from './statement-fields'
import { useCodeItemForm } from './use-code-item-form'

const lockLabels: Record<EditLock, () => string> = {
  has_submissions: m.code_lock_has_submissions,
  archived: m.code_lock_archived,
  scheduled: m.code_lock_scheduled,
}

/** Why the studio is read only: the lock the author can lift (attempts, archive, schedule), else no right to edit. */
const readOnlyReason = (challenge: AssessmentDetail) =>
  challenge.edit_lock && challenge.allowed_actions.includes('update')
    ? lockLabels[challenge.edit_lock]()
    : m.code_read_only()

type CodeItemFormProps = { activityId: string; challenge: AssessmentDetail; code: CodeItem }

/**
 * The code item editor (B-COD-13..19): statement, languages with starter code and reference solution, test cases,
 * limits; one "Save" (only with changes) and "Check reference". Without `update` everything is read only; a solved
 * live challenge keeps only the statement editable (B-COD-27). A runner that is down keeps the form and "Save" working;
 * "Check reference" waits for "Retry" (B-COD-23).
 */
export function CodeItemForm({ activityId, challenge, code }: CodeItemFormProps) {
  const { data: runner, refetch, isFetching } = useSuspenseQuery(runnerStateOptions())
  const languages = languagesIn(runner)
  const { form, update, check, checkReference, unsaved, mode } = useCodeItemForm({ activityId, challenge, code })
  const editable = mode === 'all'
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
        <p className="text-sm text-muted-foreground">{editable ? m.code_studio_hint() : readOnlyReason(challenge)}</p>
      </div>
      <fieldset disabled={mode === 'none'} className="flex min-w-0 flex-col gap-8">
        <StatementFields form={form} />
        <fieldset disabled={!editable} className="flex min-w-0 flex-col gap-8">
          <LanguageFields form={form} runner={runner} readOnly={!editable} />
          <CaseFields form={form} editable={editable} />
          <LimitFields form={form} />
        </fieldset>
      </fieldset>
      {editable ? null : (
        // A locked challenge's cases still download (the fieldset would disable the buttons).
        <form.Subscribe selector={state => state.values.tests}>
          {tests => <TestFilesBar tests={tests} />}
        </form.Subscribe>
      )}
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
      {mode === 'none' ? null : (
        <div className="flex flex-wrap gap-2">
          <form.Subscribe selector={state => unsaved(state.values)}>
            {changed => (
              <SubmitButton type="submit" pending={update.isPending} disabled={!changed}>
                {m.ui_save()}
              </SubmitButton>
            )}
          </form.Subscribe>
          {editable ? (
            <Button
              type="button"
              variant="outline"
              disabled={runner.state === 'down' || check.isPending || update.isPending}
              onClick={() => void checkReference()}
            >
              {check.isPending ? <Spinner data-icon="inline-start" /> : null}
              {m.code_check()}
            </Button>
          ) : null}
        </div>
      )}
      {check.data ? <ReferenceResults results={check.data.results} languages={languages} /> : null}
    </form>
  )
}
