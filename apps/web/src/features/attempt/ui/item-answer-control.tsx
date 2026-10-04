import { Link as RouterLink, useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AssessmentItem, ItemAnswer } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/ui/button'

import { ATTEMPT_ROUTE } from './attempt-frame'
import { ChoiceItem } from './choice-item'
import { FormItem } from './form-item'
import { MatchingItem } from './matching-item'
import { OpenTextItem } from './open-text-item'

type AnswerProps = {
  item: AssessmentItem
  answer: ItemAnswer | undefined
  onChange: (answer: ItemAnswer) => void
  disabled: boolean
}

/** The answer control of a question's kind (B-ATT-07). */
export function ItemAnswerControl({ item, answer, onChange, disabled }: AnswerProps) {
  const { courseId, activityId } = useParams({ from: ATTEMPT_ROUTE })
  const props = { answer, onChange, disabled }
  const body = item.body
  if (body.kind === 'choice') return <ChoiceItem body={body} {...props} />
  if (body.kind === 'open_text') return <OpenTextItem body={body} {...props} />
  if (body.kind === 'form') return <FormItem body={body} {...props} />
  if (body.kind === 'matching') return 'left' in body ? <MatchingItem body={body} {...props} /> : null
  // Code is answered in the code arena (slice 5.3); a quiz or exam never holds one (server rule).
  return (
    <RouterLink
      to="/learn/$courseId/$activityId/code"
      params={{ courseId, activityId }}
      className={buttonVariants({ variant: 'outline' })}
    >
      {m.attempt_code_open()}
    </RouterLink>
  )
}
