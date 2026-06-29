'use client'

import { useState } from 'react'
import { SendIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AIStreamingText } from '@/features/ai-experience'

import { useStudyCompanion } from '../api/use-study-companion'
import type { StudyCompanionMode } from '../api/use-study-companion'

export function StudyCompanionPanel({ courseUuid }: { courseUuid: string }) {
  const t = useTranslations('AiExperience.studyCompanion')
  const [question, setQuestion] = useState('')
  const [mode, setMode] = useState<StudyCompanionMode>('explain')
  const mutation = useStudyCompanion(courseUuid)

  return (
    <section className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="study-question">{t('label')}</FieldLabel>
          <InputGroup>
            <InputGroupTextarea
              id="study-question"
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder={t('placeholder')}
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                onClick={() => mutation.mutate({ question, mode, language: 'auto' })}
                disabled={!question.trim() || mutation.isPending}
              >
                <SendIcon data-icon="inline-start" />
                {t('send')}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>{t('description')}</FieldDescription>
        </Field>
      </FieldGroup>
      <ToggleGroup value={[mode]} onValueChange={value => value[0] && setMode(value[0] as StudyCompanionMode)}>
        <ToggleGroupItem value="explain">{t('explain')}</ToggleGroupItem>
        <ToggleGroupItem value="practice">{t('practice')}</ToggleGroupItem>
        <ToggleGroupItem value="flashcards">{t('flashcards')}</ToggleGroupItem>
        <ToggleGroupItem value="summarize">{t('summarize')}</ToggleGroupItem>
        <ToggleGroupItem value="deepen">{t('deepen')}</ToggleGroupItem>
      </ToggleGroup>
      {mutation.data ? <AIStreamingText text={mutation.data.answer_markdown} /> : null}
      {mutation.error ? <p className="text-destructive text-sm">{mutation.error.message}</p> : null}
    </section>
  )
}
