import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { RemediationSession, UserId } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'

import { passThreshold } from '../model/ai'
import { completeSessionOptions } from '../queries'
import { Citations } from './citations'
import { AnswerKey } from './answer-key'
import { RemediationAnswer } from './remediation-answer'

/**
 * One remediation session (B-AI-19): the micro-lecture, its objectives, the questions. "Finish" opens once every
 * question has an answer and hands the answers in: the server scores them and only then sends the answer key.
 */
type SessionViewProps = { session: RemediationSession; userId: UserId; invalidates?: QueryKey[] }

export function RemediationSessionView({ session, userId, invalidates = [] }: SessionViewProps) {
  const queryClient = useQueryClient()
  const complete = useMutation({ ...completeSessionOptions(queryClient, userId), meta: { invalidates } })
  const { lecture } = session
  const questions = session.test.questions
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''))
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
      {session.status === 'passed' ? (
        <ol className="flex flex-col gap-4">
          {questions.map(question => (
            <li key={question.prompt} className="flex flex-col gap-2">
              <MarkdownView content={question.prompt} />
              <AnswerKey question={question} />
            </li>
          ))}
        </ol>
      ) : (
        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-medium">{m.ai_remediation_questions()}</h4>
          <ol className="flex flex-col gap-4">
            {questions.map((question, index) => (
              <RemediationAnswer
                key={question.prompt}
                question={question}
                number={index + 1}
                value={answers[index] ?? ''}
                onChange={value => setAnswers(all => all.with(index, value))}
                showKey={done}
              />
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            {m.ai_remediation_threshold({ threshold: passThreshold(session) })}
          </p>
          {complete.error ? <ErrorAlert>{presentError(complete.error)}</ErrorAlert> : null}
          <div>
            <SubmitButton
              pending={complete.isPending}
              disabled={answers.some(answer => !answer.trim())}
              onClick={() => complete.mutate({ path: { session_id: session.id }, body: { answers } })}
            >
              {m.ai_remediation_complete()}
            </SubmitButton>
          </div>
        </section>
      )}
    </article>
  )
}
