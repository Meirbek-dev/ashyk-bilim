'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import * as zod from 'zod'

import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/useSession'
import { useApiError } from '@/hooks/useApiError'
import { apiJson } from '@/lib/api-client'
import { MarkdownContent } from '@/features/content-markdown'

import { RemediationSessionView } from '../api/use-remediation'
import { RemediationResultShell } from './remediation-result-shell'

/** `test.questions` of a session: the generator's practice questions (answers included — self-check). */
const PracticeQuestion = zod.looseObject({
  prompt: zod.string(),
  choices: zod.array(zod.string()).default([]),
  answer: zod.string().default(''),
  explanation: zod.string().default(''),
})
type PracticeQuestion = zod.output<typeof PracticeQuestion>

export const REMEDIATION_REQUIRED = 'REMEDIATION_REQUIRED'

const mySessionsQueryKey = (userId: string) => ['remediation-sessions', 'mine', userId] as const

/** The unpassed gate-mode session that blocks this learner on `activityId`, if any — the server's `active_remediation_gate`. */
function activeGateFor(sessions: RemediationSessionView[], activityId: string) {
  return sessions.find(s => s.activity_id === activityId && s.gate_mode && s.status !== 'passed') ?? null
}

/**
 * The signed-in learner's unpassed gate-mode session on `activityId`, `null` when none (or not loaded yet).
 * `poll` — the learner sits on a released result: a gate assigned meanwhile must show without a reload (BUG-158).
 */
export function useRemediationGate(activityId: string, { poll = false } = {}) {
  const { user } = useSession()
  const userId = user?.id ?? ''
  const sessions = useQuery({
    queryKey: mySessionsQueryKey(userId),
    queryFn: () => apiJson(`ai/remediation/student/${userId}`, undefined, value => RemediationSessionView.array().parse(value)),
    enabled: Boolean(userId),
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchInterval: poll ? 15_000 : false,
  })
  const session = useMemo(() => (sessions.data ? activeGateFor(sessions.data, activityId) : null), [sessions.data, activityId])
  return { session, userId }
}

/**
 * The learner's side of a gate-mode remediation (BUG-152): the blocked
 * reason, «Пройти исправление», the micro-lecture with its practice
 * questions, and completion — which lifts the gate server-side.
 *
 * The contract is a self-reported `score` (`POST …/complete {score}`): the
 * learner ticks the questions they got right after revealing the answer.
 * Mount it where the server said `REMEDIATION_REQUIRED`; without a matching
 * session only the reason is shown.
 */
export function RemediationGate({ activityId, onCompleted }: { activityId: string; onCompleted?: () => void }) {
  const t = useTranslations('AiExperience.remediation')
  const tReasons = useTranslations('AttemptActions.blockedReasons')
  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [correct, setCorrect] = useState<Set<number>>(new Set())
  const { session, userId } = useRemediationGate(activityId)
  const questions = useMemo<PracticeQuestion[]>(() => {
    const parsed = PracticeQuestion.array().safeParse((session?.test as { questions?: unknown } | undefined)?.questions)
    return parsed.success ? parsed.data : []
  }, [session?.test])

  const complete = useMutation({
    mutationFn: (score: number) =>
      apiJson(
        `ai/remediation/sessions/${session!.id}/complete`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ score }) },
        value => RemediationSessionView.parse(value),
      ),
    onSuccess: async result => {
      toast[result.status === 'passed' ? 'success' : 'error'](
        t(result.status === 'passed' ? 'completedPassed' : 'completedFailed', { score: result.score ?? 0 }),
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mySessionsQueryKey(userId) }),
        // The gate lifts server-side: every attempt-state / file-attempt read must follow without a reload.
        queryClient.invalidateQueries({ queryKey: ['assessments'] }),
        queryClient.invalidateQueries({ queryKey: ['file-submission'] }),
      ])
      setOpen(false)
      setRevealed(new Set())
      setCorrect(new Set())
      onCompleted?.()
    },
    onError: error => toastApiError(error, { fallback: t('completeFailed') }),
  })

  const reason = <p className="text-muted-foreground text-sm">{tReasons(REMEDIATION_REQUIRED)}</p>
  if (!session) return reason

  const allRevealed = questions.every((_, i) => revealed.has(i))
  const toggle = (set: Set<number>, i: number) => {
    const next = new Set(set)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    return next
  }

  return (
    <section className="space-y-4" data-testid="remediation-gate">
      {reason}
      {open ? (
        <>
          <RemediationResultShell session={session} />
          {questions.length > 0 ? (
            <ol className="space-y-4" data-testid="remediation-questions">
              {questions.map((question, i) => (
                <li key={i} className="border-border space-y-2 rounded-lg border p-4">
                  <MarkdownContent content={`${i + 1}. ${question.prompt}`} mode="prompt" />
                  {question.choices.length > 0 ? (
                    <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                      {question.choices.map(choice => (
                        <li key={choice}>{choice}</li>
                      ))}
                    </ul>
                  ) : null}
                  {revealed.has(i) ? (
                    <div className="bg-muted/40 space-y-2 rounded-md p-3 text-sm">
                      <p>
                        <span className="font-medium">{t('answer')}:</span> {question.answer}
                      </p>
                      {question.explanation ? <p className="text-muted-foreground">{question.explanation}</p> : null}
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={correct.has(i)}
                          onChange={() => setCorrect(prev => toggle(prev, i))}
                        />
                        {t('gotItRight')}
                      </label>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setRevealed(prev => toggle(prev, i))}>
                      {t('revealAnswer')}
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!allRevealed || complete.isPending}
              onClick={() => complete.mutate(questions.length ? Math.round((100 * correct.size) / questions.length) : 100)}
            >
              {complete.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
              {t('complete')}
            </Button>
            <span className="text-muted-foreground text-xs">{t('selfCheckNote', { threshold: 70 })}</span>
          </div>
        </>
      ) : (
        <Button variant="default" onClick={() => setOpen(true)}>
          <BookOpenCheck className="size-4" />
          {t('open')}
        </Button>
      )}
    </section>
  )
}
