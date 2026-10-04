import { useId } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { RemediationQuestion } from '#/shared/api/gen/types.gen'
import { Field, FieldLabel } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

type RemediationAnswerProps = {
  question: RemediationQuestion
  number: number
  value: string
  onChange: (value: string) => void
}

/** One remediation question and the learner's answer: a choice when the question has choices, else a line of text. */
export function RemediationAnswer({ question, number, value, onChange }: RemediationAnswerProps) {
  const id = useId()
  const label = m.ai_remediation_answer({ number })
  return (
    <li className="flex flex-col gap-2 border-b pb-4 last:border-b-0">
      <MarkdownView content={question.prompt} />
      {question.choices && question.choices.length > 0 ? (
        <RadioGroup aria-label={label} value={value} onValueChange={next => onChange(String(next))}>
          {question.choices.map((choice, index) => (
            <Field key={choice} orientation="horizontal">
              <RadioGroupItem id={`${id}-${index}`} value={choice} />
              <FieldLabel htmlFor={`${id}-${index}`} className="font-normal">
                {choice}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      ) : (
        <Input aria-label={label} value={value} onChange={event => onChange(event.target.value)} />
      )}
    </li>
  )
}
