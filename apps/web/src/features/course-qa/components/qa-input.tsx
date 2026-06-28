'use client'

import { useState } from 'react'
import { SendIcon } from 'lucide-react'

import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'

type QAInputProps = {
  pending?: boolean
  onSubmit: (question: string) => void
}

export function QAInput({ pending, onSubmit }: QAInputProps) {
  const [question, setQuestion] = useState('')
  return (
    <Field>
      <FieldLabel htmlFor="course-qa-question">Question</FieldLabel>
      <InputGroup>
        <InputGroupTextarea
          id="course-qa-question"
          value={question}
          onChange={event => setQuestion(event.target.value)}
        />
        <InputGroupAddon align="block-end">
          <InputGroupButton
            disabled={!question.trim() || pending}
            onClick={() => {
              onSubmit(question)
              setQuestion('')
            }}
          >
            <SendIcon data-icon="inline-start" />
            Ask
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>Answers are grounded in course material.</FieldDescription>
    </Field>
  )
}
