'use client'

import { useState } from 'react'
import { SendIcon, SquareIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'

interface QAInputProps {
  pending?: boolean
  /** Shown instead of the box when asking is off (archived course); the history stays. */
  disabledReason?: string | null
  onStop?: () => void
  onSubmit: (question: string) => void
}

export function QAInput({ pending, disabledReason, onStop, onSubmit }: QAInputProps) {
  const t = useTranslations('AiExperience.qaInput')
  const [question, setQuestion] = useState('')
  if (disabledReason) {
    return <p className="text-muted-foreground rounded-lg border p-3 text-sm">{disabledReason}</p>
  }
  return (
    <Field>
      <FieldLabel htmlFor="course-qa-question">{t('label')}</FieldLabel>
      <InputGroup>
        <InputGroupTextarea
          autoComplete="off"
          id="course-qa-question"
          name="course-qa-question"
          placeholder={t('placeholder')}
          value={question}
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && question.trim() && !pending) {
              event.preventDefault()
              onSubmit(question)
              setQuestion('')
            }
          }}
        />
        <InputGroupAddon align="block-end">
          {pending ? (
            <InputGroupButton type="button" variant="outline" onClick={onStop}>
              <SquareIcon data-icon="inline-start" aria-hidden="true" />
              {t('stop')}
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="button"
              disabled={!question.trim()}
              onClick={() => {
                onSubmit(question)
                setQuestion('')
              }}
            >
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              {t('ask')}
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>{t('description')}</FieldDescription>
    </Field>
  )
}
