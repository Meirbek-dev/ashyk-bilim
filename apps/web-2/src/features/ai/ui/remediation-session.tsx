import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { RemediationSession, UserId } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Checkbox } from '#/shared/ui/checkbox'
import { Spinner } from '#/shared/ui/spinner'

import { passThreshold, remediationScore } from '../model/ai'
import { completeSessionOptions } from '../queries'
import { Citations } from './citations'
import { PracticeItem } from './practice-item'

const toggle = (set: Set<number>, index: number, on: boolean) => {
  const next = new Set(set)
  if (on) next.add(index)
  else next.delete(index)
  return next
}

/**
 * One remediation session (B-AI-19): the micro-lecture, its objectives, the questions. "Finish" opens once every
 * answer is revealed and posts the self-reported score the contract takes (SPEC "Ждёт сервера").
 */
export function RemediationSessionView({ session, userId }: { session: RemediationSession; userId: UserId }) {
  const queryClient = useQueryClient()
  const complete = useMutation(completeSessionOptions(queryClient, userId))
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [right, setRight] = useState<Set<number>>(new Set())
  const { lecture } = session
  const questions = session.test.questions
  const score = session.score
  const done = session.status === 'passed' || (session.status === 'failed' && score !== null)
  return (
    <article className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold wrap-anywhere">{lecture.title}</h3>
      <MarkdownView content={lecture.micro_lecture_markdown} />
      {lecture.learning_objectives && lecture.learning_objectives.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">{m.ai_remediation_objectives()}</h4>
          <ul className="list-disc ps-5 text-sm">
            {lecture.learning_objectives.map(objective => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <Citations citations={lecture.citations ?? []} />
      {done && score !== null ? (
        <output className="font-medium">
          {session.status === 'passed'
            ? m.ai_remediation_result_passed({ score })
            : m.ai_remediation_result_failed({ score })}
        </output>
      ) : null}
      {session.status === 'passed' ? null : (
        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-medium">{m.ai_remediation_questions()}</h4>
          <ol className="flex flex-col gap-4">
            {questions.map((question, index) => (
              <PracticeItem
                key={question.prompt}
                item={question}
                onReveal={() => setRevealed(set => toggle(set, index, true))}
              >
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={right.has(index)}
                    onCheckedChange={on => setRight(set => toggle(set, index, on))}
                  />
                  {m.ai_got_it()}
                </label>
              </PracticeItem>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            {m.ai_remediation_threshold({ threshold: passThreshold(session) })}
          </p>
          {complete.error ? <ErrorAlert>{presentError(complete.error)}</ErrorAlert> : null}
          <div>
            <Button
              disabled={revealed.size < questions.length || complete.isPending}
              onClick={() =>
                complete.mutate({
                  path: { session_id: session.id },
                  body: { score: remediationScore(right.size, questions.length) },
                })
              }
            >
              {complete.isPending ? <Spinner data-icon="inline-start" /> : null}
              {m.ai_remediation_complete()}
            </Button>
          </div>
        </section>
      )}
    </article>
  )
}
