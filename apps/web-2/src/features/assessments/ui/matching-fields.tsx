import { Plus } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { MatchingBody, MatchingPair } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'
import { FieldDescription, FieldLegend, FieldSet } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'

import type { EditMode } from '../model/route'
import { MarkdownField } from './markdown-field'
import { PairTools } from './pair-tools'
import { TextList } from './text-list'

type Matching = MatchingBody & { kind: 'matching' }
type MatchingFieldsProps = { body: Matching; onChange: (body: Matching) => void; mode: EditMode }

/**
 * A matching question: left - right pairs (the learner sees the right column shuffled; a left one may have no pair,
 * which the learner must leave unplaced), the distractors (right values nothing matches) and the explanation. The
 * pairs and the distractors are the answer key: `wording` mode keeps them read-only.
 */
export function MatchingFields({ body, onChange, mode }: MatchingFieldsProps) {
  const editable = mode === 'all'
  const setPairs = (pairs: MatchingPair[]) => onChange({ ...body, pairs })
  const patch = (at: number, change: Partial<MatchingPair>) =>
    setPairs(body.pairs.map((pair, index) => (index === at ? { ...pair, ...change } : pair)))
  return (
    <div className="flex flex-col gap-4">
      <FieldSet>
        <FieldLegend variant="label">{m.assessments_pairs_legend()}</FieldLegend>
        {editable ? <FieldDescription>{m.assessments_pairs_hint()}</FieldDescription> : null}
        <ol className="flex flex-col gap-4 @xl:gap-2">
          {body.pairs.map((pair, at) => (
            // The pairs carry no ids: the position is their identity while editing. Narrow: the two sides stack with
            // «remove» beside the first, so the button never drops to a line of its own.
            <li
              key={at}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
            >
              <Input
                aria-label={m.assessments_pair_left({ number: at + 1 })}
                placeholder={m.assessments_pair_left({ number: at + 1 })}
                value={pair.left}
                disabled={!editable}
                onChange={event => patch(at, { left: event.target.value })}
              />
              <Input
                aria-label={m.assessments_pair_right({ number: at + 1 })}
                placeholder={m.assessments_pair_right({ number: at + 1 })}
                className="col-start-1 row-start-2 @xl:col-start-2 @xl:row-start-1"
                value={pair.right ?? ''}
                disabled={!editable || pair.right === null}
                onChange={event => patch(at, { right: event.target.value })}
              />
              <PairTools
                number={at + 1}
                unpaired={pair.right === null}
                editable={editable}
                removable={body.pairs.length > 1}
                onUnpaired={unpaired => patch(at, { right: unpaired ? null : '' })}
                onRemove={() => setPairs(body.pairs.filter((_, index) => index !== at))}
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
      </FieldSet>
      <TextList
        legend={m.assessments_distractors_legend()}
        hint={m.assessments_distractors_hint()}
        values={body.distractors ?? []}
        onChange={distractors => onChange({ ...body, distractors })}
        rowLabel={number => m.assessments_distractor_row({ number })}
        removeLabel={number => m.assessments_distractor_remove({ number })}
        addLabel={m.assessments_distractor_add()}
        editable={editable}
      />
      <MarkdownField
        label={m.assessments_field_explanation()}
        value={body.explanation ?? ''}
        onChange={explanation => onChange({ ...body, explanation: explanation || null })}
        editable={mode !== 'none'}
      />
    </div>
  )
}
