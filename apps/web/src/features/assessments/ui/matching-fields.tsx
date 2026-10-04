import { Plus, X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { MatchingBody, MatchingPair } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { Button } from '#/shared/ui/button'
import { Input } from '#/shared/ui/input'

import { MarkdownField } from './markdown-field'

type Matching = MatchingBody & { kind: 'matching' }
type MatchingFieldsProps = { body: Matching; onChange: (body: Matching) => void; editable: boolean }

/** A matching question: left - right pairs (the learner sees the right column shuffled) and the explanation. */
export function MatchingFields({ body, onChange, editable }: MatchingFieldsProps) {
  const setPairs = (pairs: MatchingPair[]) => onChange({ ...body, pairs })
  const patch = (at: number, change: Partial<MatchingPair>) =>
    setPairs(body.pairs.map((pair, index) => (index === at ? { ...pair, ...change } : pair)))
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {body.pairs.map((pair, at) => (
          // The pairs carry no ids: the position is their identity while editing.
          <li key={at} className="flex flex-wrap items-center gap-2 @xl:flex-nowrap">
            <Input
              aria-label={m.assessments_pair_left({ number: at + 1 })}
              value={pair.left}
              disabled={!editable}
              onChange={event => patch(at, { left: event.target.value })}
            />
            <Input
              aria-label={m.assessments_pair_right({ number: at + 1 })}
              value={pair.right}
              disabled={!editable}
              onChange={event => patch(at, { right: event.target.value })}
            />
            <IconButton
              label={m.assessments_pair_remove({ number: at + 1 })}
              icon={<X aria-hidden />}
              disabled={!editable || body.pairs.length <= 1}
              onClick={() => setPairs(body.pairs.filter((_, index) => index !== at))}
            />
          </li>
        ))}
      </ol>
      {editable ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPairs([...body.pairs, { left: '', right: '' }])}
          >
            <Plus data-icon="inline-start" aria-hidden />
            {m.assessments_pair_add()}
          </Button>
        </div>
      ) : null}
      <MarkdownField
        label={m.assessments_field_explanation()}
        value={body.explanation ?? ''}
        onChange={explanation => onChange({ ...body, explanation: explanation || null })}
        editable={editable}
      />
    </div>
  )
}
