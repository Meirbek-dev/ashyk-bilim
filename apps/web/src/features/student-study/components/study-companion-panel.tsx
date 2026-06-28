'use client'

import { useState } from 'react'
import { SendIcon } from 'lucide-react'

import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AIStreamingText } from '@/features/ai-experience'

import { useStudyCompanion } from '../api/use-study-companion'
import type { StudyCompanionMode } from '../api/use-study-companion'

export function StudyCompanionPanel({ courseUuid }: { courseUuid: string }) {
  const [question, setQuestion] = useState('')
  const [mode, setMode] = useState<StudyCompanionMode>('explain')
  const mutation = useStudyCompanion(courseUuid)

  return (
    <section className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="study-question">Ask about this course</FieldLabel>
          <InputGroup>
            <InputGroupTextarea
              id="study-question"
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder="Ask for an explanation, summary, practice, or flashcards"
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                onClick={() => mutation.mutate({ question, mode, language: 'auto' })}
                disabled={!question.trim() || mutation.isPending}
              >
                <SendIcon data-icon="inline-start" />
                Send
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>Answers cite course material and avoid assessment answers.</FieldDescription>
        </Field>
      </FieldGroup>
      <ToggleGroup value={[mode]} onValueChange={value => value[0] && setMode(value[0] as StudyCompanionMode)}>
        <ToggleGroupItem value="explain">Explain</ToggleGroupItem>
        <ToggleGroupItem value="practice">Practice</ToggleGroupItem>
        <ToggleGroupItem value="flashcards">Flashcards</ToggleGroupItem>
        <ToggleGroupItem value="summarize">Summarize</ToggleGroupItem>
        <ToggleGroupItem value="deepen">Deepen</ToggleGroupItem>
      </ToggleGroup>
      {mutation.data ? <AIStreamingText text={mutation.data.answer_markdown} /> : null}
      {mutation.error ? <p className="text-destructive text-sm">{mutation.error.message}</p> : null}
    </section>
  )
}
