import { useSuspenseQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail, StudentSubmission } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Skeleton } from '#/shared/ui/skeleton'
import { Spinner } from '#/shared/ui/spinner'

import { answerOf, initialAnswer, languageOf, switchLanguage, type CodeAnswer, type CodeItem } from '../model/arena'
import { languagesOptions } from '../queries'
import { LanguageSelect } from './language-select'
import { CodeEditor } from './lazy-editor'
import { SubmitDialog } from './submit-dialog'
import { useAttemptActions } from './use-attempt-actions'
import { useCodeDraft, type DraftStatus } from './use-code-draft'

const statusText: Record<DraftStatus, () => string> = {
  saved: m.code_saved,
  dirty: m.code_unsaved,
  saving: m.code_saving,
  failed: m.code_save_failed,
  conflict: m.code_save_conflict,
}

type WorkspaceProps = { courseId: string; challenge: AssessmentDetail; code: CodeItem; draft: StudentSubmission }

/**
 * The open attempt (B-COD-05..10): language, the editor, "Run" on the visible tests and "Submit". The code lives here
 * while typing and goes to the server draft after a pause (B-COD-06).
 */
export function Workspace({ courseId, challenge, code, draft }: WorkspaceProps) {
  const { data: languages } = useSuspenseQuery(languagesOptions())
  const [answer, setAnswer] = useState(() => initialAnswer(code.body, answerOf(draft, code.item.id)))
  const ids = { courseId, assessmentId: challenge.id, itemId: code.item.id, draftId: draft.id }
  const saver = useCodeDraft(ids)
  const actions = useAttemptActions(ids)
  const change = (next: CodeAnswer) => {
    setAnswer(next)
    saver.change(next)
  }
  const handIn = () => {
    saver.drop()
    actions.handIn(answer)
  }
  return (
    <section aria-labelledby="code-workspace" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="code-workspace" className="text-xl font-semibold">
          {m.code_solution()}
        </h2>
        <output className="text-sm text-muted-foreground">{statusText[saver.status]()}</output>
      </div>
      <LanguageSelect
        label={m.code_language()}
        value={answer.language}
        ids={code.body.languages ?? []}
        languages={languages}
        onChange={language => change(switchLanguage(code.body, answer, language))}
      />
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <CodeEditor
          value={answer.source}
          mode={languageOf(languages, answer.language)?.monaco_language ?? 'plaintext'}
          label={m.code_editor_label()}
          onChange={source => change({ language: answer.language, source })}
        />
      </Suspense>
      {languages === null ? <p className="text-sm text-muted-foreground">{m.code_runner_unavailable()}</p> : null}
      {actions.error ? <ErrorAlert>{presentError(actions.error)}</ErrorAlert> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={languages === null || actions.running}
          onClick={() => actions.runCode(answer)}
        >
          {actions.running ? <Spinner data-icon="inline-start" /> : <Play aria-hidden data-icon="inline-start" />}
          {m.code_run()}
        </Button>
        <SubmitDialog
          number={draft.attempt_number}
          max={challenge.policy.max_attempts}
          disabled={actions.submitting}
          onConfirm={handIn}
          trigger={
            <>
              {actions.submitting ? <Spinner data-icon="inline-start" /> : null}
              {m.code_submit()}
            </>
          }
        />
      </div>
    </section>
  )
}
