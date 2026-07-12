'use client'

import { useState } from 'react'
import { SendIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AIErrorRecovery, AIRunProgress, AIStreamingText, useAIRunController } from '@/features/ai-experience'
import { WidgetErrorBoundary } from '@/components/ui/widget-error-boundary'

import { useQueueStudyCompanion } from '../api/use-study-companion'
import type { StudyCompanionAnswer, StudyCompanionMode } from '../api/use-study-companion'

export function StudyCompanionPanel({
  courseUuid,
  initialMode = 'explain',
}: {
  courseUuid: string
  initialMode?: StudyCompanionMode
}) {
  const t = useTranslations('AiExperience.studyCompanion')
  return (
    <WidgetErrorBoundary scope="student-study-companion" variant="section" title={t('title')}>
      <StudyCompanionPanelInner courseUuid={courseUuid} initialMode={initialMode} />
    </WidgetErrorBoundary>
  )
}

function StudyCompanionPanelInner({
  courseUuid,
  initialMode,
}: {
  courseUuid: string
  initialMode: StudyCompanionMode
}) {
  const t = useTranslations('AiExperience.studyCompanion')
  const [question, setQuestion] = useState('')
  const [mode, setMode] = useState<StudyCompanionMode>(initialMode)
  const queue = useQueueStudyCompanion(courseUuid)
  const run = useAIRunController<
    { question: string; mode: StudyCompanionMode; language: string },
    StudyCompanionAnswer
  >({
    queue,
  })
  const answer = run.latestArtifact?.content_json

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
              disabled={run.pending}
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                onClick={() => {
                  void run.start({ question, mode, language: 'auto' }).then(() => setQuestion(''))
                }}
                disabled={!question.trim() || run.pending}
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
      <AIRunProgress state={run.state} onCancel={run.pending ? run.cancel : undefined} />
      {answer ? <AIStreamingText text={answer.answer_markdown} /> : null}
      {run.error ? <AIErrorRecovery message={run.error.message} /> : null}
    </section>
  )
}
