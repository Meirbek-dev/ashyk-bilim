import { useId } from 'react'

import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import type { CommitFormApi } from './use-commit-form'

type CommitActionsProps = {
  form: CommitFormApi
  isNew: boolean
  pending: boolean
  error: unknown
  /** The file has errors: fix it and upload again. */
  hasErrors: boolean
  /** A new test without a chapter to go to, or a test that takes no questions now. */
  noPlace: boolean
  onOtherFile: () => void
  onCancel: () => void
}

/** «Создать тест» / «Заменить вопросы» / «Добавить вопросы» (blocked while the file has errors), another file, cancel. */
export function CommitActions(props: CommitActionsProps) {
  const { form, isNew, pending, error, hasErrors, noPlace, onOtherFile, onCancel } = props
  const hintId = useId()
  const blocked = hasErrors || noPlace
  // A new test without a chapter is explained by the settings above (no chapters to pick).
  const hinted = hasErrors || (noPlace && !isNew)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form.Subscribe selector={state => [state.values.kind, state.values.mode] as const}>
          {([kind, mode]) => (
            <SubmitButton
              type="submit"
              pending={pending}
              disabled={blocked}
              aria-describedby={hinted ? hintId : undefined}
            >
              {isNew
                ? kind === 'quiz'
                  ? m.assessment_import_create_quiz()
                  : m.assessment_import_create_exam()
                : mode === 'replace'
                  ? m.assessment_import_replace()
                  : m.assessment_import_append()}
            </SubmitButton>
          )}
        </form.Subscribe>
        <Button type="button" variant="outline" onClick={onOtherFile}>
          {m.assessment_import_other_file()}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {m.assessment_import_cancel()}
        </Button>
      </div>
      {hasErrors ? (
        <p id={hintId} className="text-sm text-destructive">
          {m.assessment_import_fix_hint()}
        </p>
      ) : noPlace && !isNew ? (
        <p id={hintId} className="text-sm text-warning">
          {m.assessment_import_not_editable()}
        </p>
      ) : null}
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
    </div>
  )
}
