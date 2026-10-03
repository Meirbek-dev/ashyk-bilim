import { Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import type { CourseId, StudyMode, StudyRequest } from '#/shared/api/gen/types.gen'
import { vStudyMode } from '#/shared/api/gen/valibot.gen'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { Button } from '#/shared/ui/button'

import { modeLabels } from '../model/labels'
import { studyQueue } from '../queries'
import { AskForm } from './ask-form'
import { RunStatus } from './run-status'
import { StudyAnswer } from './study-answer'
import { useAiRun } from './use-ai-run'

/** The study companion (B-AI-04): a mode, a question, the run, then the answer artifact. */
export function StudyTab({ courseId }: { courseId: CourseId }) {
  const [mode, setMode] = useState<StudyMode>('explain')
  const [asked, setAsked] = useState<StudyRequest | null>(null)
  const run = useAiRun(studyQueue(courseId), [])
  const ask = (question: string) => {
    const body = { question, mode, language: getLocale() }
    setAsked(body)
    run.start(body)
  }
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{m.ai_mode()}</legend>
        <div className="flex flex-wrap gap-2">
          {vStudyMode.options.map(option => (
            <Button
              key={option}
              size="sm"
              variant={option === mode ? 'secondary' : 'ghost'}
              aria-pressed={option === mode}
              onClick={() => setMode(option)}
            >
              {modeLabels[option]()}
            </Button>
          ))}
        </div>
      </fieldset>
      <AskForm label={m.ai_question()} pending={run.pending} onAsk={ask} />
      <RunStatus
        state={run.state}
        onCancel={run.cancel}
        cancelling={run.cancelling}
        onRetry={() => asked && run.start(asked)}
      />
      {run.state.phase === 'succeeded' && run.state.runId ? (
        <Suspense fallback={<ListSkeleton />}>
          <StudyAnswer runId={run.state.runId} onFollowUp={ask} />
        </Suspense>
      ) : null}
    </div>
  )
}
