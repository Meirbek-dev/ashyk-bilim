'use client'

import { CornerDownLeftIcon, SquareIcon } from 'lucide-react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import type { StudentAiRunState } from '../types'

const FOLLOW_UP_LABEL = 'Ask a follow-up'
const FOLLOW_UP_HINT = 'Enter to send. Shift Enter for a new line.'

export function StudentAiFollowUpComposer({
  disabled,
  input,
  onInputChange,
  onStop,
  onSubmit,
  runState,
}: {
  disabled?: boolean
  input: string
  onInputChange: (value: string) => void
  onStop: () => void
  onSubmit: () => void
  runState: StudentAiRunState
}) {
  const isRunning = runState === 'preparing' || runState === 'streaming'

  const submit = () => {
    if (disabled || isRunning || !input.trim()) return
    onSubmit()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form className="border-border/70 bg-background/95 border-t p-3" onSubmit={handleSubmit}>
      <FieldGroup>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="student-ai-follow-up" className="sr-only">
            {FOLLOW_UP_LABEL}
          </FieldLabel>
          <InputGroup className="min-h-24">
            <InputGroupTextarea
              id="student-ai-follow-up"
              value={input}
              onChange={event => onInputChange(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up about this activity"
              disabled={disabled || isRunning}
              className="max-h-36 min-h-20 text-base md:text-sm"
            />
            <InputGroupAddon align="block-end" className="justify-between">
              <span className="text-muted-foreground text-xs">{FOLLOW_UP_HINT}</span>
              {isRunning ? (
                <InputGroupButton type="button" variant="outline" size="icon-sm" onClick={onStop} aria-label="Stop AI">
                  <SquareIcon data-icon="inline-start" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  type="submit"
                  variant="default"
                  size="icon-sm"
                  disabled={disabled || !input.trim()}
                  aria-label="Send follow-up"
                >
                  <CornerDownLeftIcon data-icon="inline-start" />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </FieldGroup>
    </form>
  )
}
