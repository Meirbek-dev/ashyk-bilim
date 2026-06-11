'use client'

import { CornerDownLeftIcon, SquareIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import type { AiIntent } from '../api/ai-event-contract'
import type { AiPromptIntent } from '../intents/activity-intents'

const EMPTY_INTENTS: AiPromptIntent[] = []

export interface AiComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (message: string, intent: AiIntent) => void
  onStop?: () => void
  disabled?: boolean
  placeholder?: string
  intents?: AiPromptIntent[]
  className?: string
}

export function AiComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled = false,
  placeholder = 'Ask about this activity...',
  intents = EMPTY_INTENTS,
  className,
}: AiComposerProps) {
  const t = useTranslations('Activities.AiAssistantPanel')
  const [selectedIntent, setSelectedIntent] = useState<AiIntent>('freeform')

  const submit = useCallback(() => {
    const message = value.trim()
    if (!message || disabled) return
    onSubmit(message, selectedIntent)
  }, [disabled, onSubmit, selectedIntent, value])

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
    <form className={cn('flex flex-col gap-3 border-t p-3', className)} onSubmit={handleSubmit}>
      {intents.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="AI actions">
          {intents.map(intent => (
            <Button
              key={intent.id}
              type="button"
              variant={selectedIntent === intent.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setSelectedIntent(intent.id)
                if (!value.trim()) {
                  onChange(intent.prompt)
                }
              }}
            >
              {intent.label}
            </Button>
          ))}
        </div>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="ai-composer-input" className="sr-only">
            {t('aiComposerLabel')}
          </FieldLabel>
          <InputGroup className="min-h-20">
            <InputGroupTextarea
              id="ai-composer-input"
              name="message"
              value={value}
              onChange={event => onChange(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              aria-label="AI message"
              className="max-h-40 min-h-16"
            />
            <InputGroupAddon align="block-end" className="justify-between">
              <span />
              {disabled && onStop ? (
                <InputGroupButton type="button" variant="outline" size="icon-sm" onClick={onStop} aria-label="Stop AI">
                  <SquareIcon data-icon="inline-start" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  type="submit"
                  variant="default"
                  size="icon-sm"
                  disabled={!value.trim()}
                  aria-label="Send AI message"
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
