import { useSuspenseQuery } from '@tanstack/react-query'
import * as v from 'valibot'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { AiRunId, RunArtifact } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { artifactsOptions } from '../queries'
import { Citations } from './citations'
import { PracticeItem } from './practice-item'

// `StudyCompanionAnswer.flashcards` is `JsonValue[]` in the contract: the two shapes the agent writes are read.
const vCard = v.union([
  v.object({ front: v.string(), back: v.string() }),
  v.pipe(
    v.object({ question: v.string(), answer: v.string() }),
    v.transform(card => ({ front: card.question, back: card.answer })),
  ),
])

const studyAnswer = (artifacts: RunArtifact[]) => {
  const found = artifacts.find(artifact => artifact.kind === 'study_companion' && artifact.final) ?? artifacts[0]
  return found?.kind === 'study_companion' ? found.content : null
}

/** The answer artifact of a finished study run: markdown, practice, flashcards, sources, follow-ups. */
export function StudyAnswer({ runId, onFollowUp }: { runId: AiRunId; onFollowUp: (question: string) => void }) {
  const { data: answer } = useSuspenseQuery({ ...artifactsOptions(runId), select: studyAnswer })
  if (!answer) return null
  const cards = (answer.flashcards ?? []).flatMap(card => {
    const parsed = v.safeParse(vCard, card)
    return parsed.success ? [parsed.output] : []
  })
  return (
    <article className="flex flex-col gap-4">
      <MarkdownView content={answer.answer_markdown} live />
      {answer.practice_items && answer.practice_items.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{m.ai_practice_items()}</h4>
          <ol className="flex flex-col gap-4">
            {answer.practice_items.map(item => (
              <PracticeItem key={item.prompt} item={item} />
            ))}
          </ol>
        </section>
      ) : null}
      {cards.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{m.ai_flashcards()}</h4>
          <dl className="flex flex-col gap-2 text-sm">
            {cards.map(card => (
              <div key={card.front} className="rounded-md border p-2">
                <dt className="font-medium">{card.front}</dt>
                <dd className="text-muted-foreground">{card.back}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <Citations citations={answer.citations ?? []} />
      {answer.follow_up_suggestions && answer.follow_up_suggestions.length > 0 ? (
        <section className="flex flex-col items-start gap-2">
          <h4 className="text-sm font-medium">{m.ai_follow_ups()}</h4>
          {answer.follow_up_suggestions.map(question => (
            <Button
              key={question}
              variant="outline"
              size="sm"
              className="h-auto text-left whitespace-normal"
              onClick={() => onFollowUp(question)}
            >
              {question}
            </Button>
          ))}
        </section>
      ) : null}
    </article>
  )
}
