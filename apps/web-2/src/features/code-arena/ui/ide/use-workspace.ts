import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import type { StudentSubmission } from '#/shared/api/gen/types.gen'

import { answerOf, initialAnswer, isRunnerDown, languagesIn, type CodeAnswer, type CodeItem } from '../../model/arena'
import { consoleMode, type ConsoleMode } from '../../model/ide'
import { runnerStateOptions } from '../../queries'
import { ARENA_PATH, ARENA_ROUTE } from '../arena-route'
import { useAttemptActions } from '../use-attempt-actions'
import { useCodeDraft } from '../use-code-draft'

type WorkspaceIds = { courseId: string; assessmentId: string }

/**
 * The open attempt's state: the code (saved after a pause, B-COD-06), what «Запустить» runs on (the samples or the
 * own input, B-COD-29), the console's mode in `?console=`, run and hand-in, and when each may happen.
 */
export function useWorkspace({ courseId, assessmentId }: WorkspaceIds, code: CodeItem, draft: StudentSubmission) {
  const runner = useSuspenseQuery(runnerStateOptions())
  const { run, console: chosen } = useSearch({ from: ARENA_ROUTE })
  const navigate = useNavigate({ from: ARENA_PATH })
  const samples = (code.body.tests ?? []).filter(test => test.is_visible !== false)
  const [answer, setAnswer] = useState(() => initialAnswer(code.body, answerOf(draft, code.item.id)))
  const [input, setInput] = useState(() => samples[0]?.input ?? '')
  const [target, setTarget] = useState<'samples' | 'input'>(chosen === 'input' ? 'input' : 'samples')
  const ids = { courseId, assessmentId, itemId: code.item.id, draftId: draft.id }
  const saver = useCodeDraft(ids)
  const actions = useAttemptActions(ids)
  const state = runner.data.state
  // Nothing to run or hand in until there is code (an empty hand-in only spends an attempt).
  const empty = answer.source.trim() === ''
  const canRun = !empty && state === 'ready' && !actions.running
  return {
    runner,
    languages: languagesIn(runner.data),
    samples,
    answer,
    change: (next: CodeAnswer) => {
      setAnswer(next)
      saver.change(next)
    },
    input,
    setInput,
    target,
    run,
    mode: consoleMode(chosen, run),
    setMode: (next: ConsoleMode) => {
      if (next !== 'result') setTarget(next === 'input' ? 'input' : 'samples')
      void navigate({ search: previous => ({ ...previous, console: next }), replace: true })
    },
    saver,
    actions,
    /** The runner is down: its read, or a run or hand-in answered so (B-COD-23). */
    down: state === 'down' || isRunnerDown(actions.error),
    /** «Повторить»: forget the refusal and ask the runner again. */
    retry: () => {
      actions.reset()
      void runner.refetch()
    },
    canRun,
    canSubmit: !empty && state !== 'down' && !actions.submitting,
    runCode: () => {
      if (canRun) actions.runCode(answer, target === 'input' ? input : undefined)
    },
    handIn: () => {
      saver.drop()
      actions.handIn(answer)
    },
  }
}
