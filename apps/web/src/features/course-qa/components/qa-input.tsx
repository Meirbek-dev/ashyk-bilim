'use client'

import { useState } from 'react'
import { SendIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'

interface QAInputProps {
  pending?: boolean
  onSubmit: (question: string) => void
}

export function QAInput({ pending, onSubmit }: QAInputProps) {
  const t = useTranslations('AiExperience.qaInput')
  const [question, setQuestion] = useState('')
  return (
    <Field>
      <FieldLabel htmlFor="course-qa-question">{t('label')}</FieldLabel>
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
            {t('ask')}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>{t('description')}</FieldDescription>
    </Field>
  )
}
