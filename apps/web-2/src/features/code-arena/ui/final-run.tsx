import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { finalRunOptions } from '../queries'
import { RunView } from './run-view'

/** The run the attempt was graded on, with its per-test verdicts (B-COD-22); nothing before grading. */
export function FinalRun({ itemId, submissionId }: { itemId: string; submissionId: string }) {
  const { data: run } = useSuspenseQuery(finalRunOptions(itemId, submissionId))
  return run ? <RunView run={run} title={m.code_final_run_title()} level={3} /> : null
}
