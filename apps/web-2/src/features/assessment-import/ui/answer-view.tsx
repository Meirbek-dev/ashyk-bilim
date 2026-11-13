import { m } from '#/paraglide/messages'
import type { ItemBody } from '#/shared/api/gen/types.gen'
import { ItemMedia } from '#/shared/components/item-media'
import { cn } from '#/shared/lib/utils'

// DOT text is plain (`prompt_format: 'plain'`): shown as typed, line breaks and indents kept, never as markdown.
export const LITERAL = 'whitespace-pre-wrap wrap-anywhere'

type AnswerViewProps = { body: ItemBody; src: (uploadId: string) => string }

/** What the learner will answer with: options with ✓ at the correct ones, the accepted answer, the pairs. */
export function AnswerView({ body, src }: AnswerViewProps) {
  if (body.kind === 'choice')
    return (
      <ol className="flex flex-col gap-1.5 text-sm">
        {(body.options ?? []).map(option => (
          <li key={option.id} className="flex gap-2">
            <span aria-hidden className="w-4 shrink-0 text-success">
              {option.is_correct ? '✓' : ''}
            </span>
            <div className={cn('flex min-w-0 flex-col gap-1', option.is_correct && 'font-medium')}>
              {option.text ? <span className={LITERAL}>{option.text}</span> : null}
              <ItemMedia media={option.media ? [option.media] : undefined} src={src} />
              {option.is_correct ? <span className="sr-only">{m.assessment_import_correct()}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    )
  if (body.kind === 'open_text')
    return body.short_answer ? (
      <p className={cn('text-sm', LITERAL)}>
        {m.assessment_import_accepted({ answer: (body.accepted_answers ?? []).join(' / ') })}
      </p>
    ) : (
      <p className="text-sm text-muted-foreground">{m.assessment_import_essay_note()}</p>
    )
  if (body.kind === 'matching' && 'pairs' in body)
    return (
      <div className="flex flex-col gap-1.5 text-sm">
        <ul className="flex flex-col gap-1">
          {body.pairs.map(pair => (
            <li key={pair.left} className={LITERAL}>
              {pair.left} → {pair.right ?? m.assessment_import_matching_none()}
            </li>
          ))}
        </ul>
        {body.distractors?.length ? (
          <p className={cn('text-muted-foreground', LITERAL)}>
            {m.assessment_import_matching_extra({ items: body.distractors.join('; ') })}
          </p>
        ) : null}
      </div>
    )
  return null
}
