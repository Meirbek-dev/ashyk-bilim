import { ArrowUp, Square } from 'lucide-react'
import { useId } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { vStudyRequest } from '#/shared/api/gen/valibot.gen'
import { errorText } from '#/shared/components/form/field-errors'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SubmitButton } from '#/shared/components/submit-button'
import { Button } from '#/shared/ui/button'
import { FieldError } from '#/shared/ui/field'
import { InputGroup, InputGroupAddon, InputGroupTextarea } from '#/shared/ui/input-group'

// The question's limits come from the contract (`StudyRequest.question`); Q&A takes the same text.
const vAsk = v.pick(vStudyRequest, ['question'])

type AskFormProps = {
  label: string
  pending: boolean
  onAsk: (question: string) => void
  /** Shown in place of the send button while a run streams: "Stop". */
  stop?: { label: string; onStop: () => void } | null
}

/**
 * The question box of the panel, one field as in any chat: the text, with send (or «Стоп» while a run streams) in its
 * corner. Enter sends, Shift + Enter breaks the line. Send is off while the box is empty or a run is pending (B-AI-05).
 */
export function AskForm({ label, pending, onAsk, stop }: AskFormProps) {
  const id = useId()
  const form = useAppForm(vAsk, {
    defaultValues: { question: '' },
    onSubmit: ({ question }) => {
      onAsk(question.trim())
      form.reset()
    },
  })
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="question">
        {field => {
          const error = errorText(field.state.meta.errors)
          return (
            <>
              <label htmlFor={id} className="sr-only">
                {label}
              </label>
              <InputGroup className="h-auto flex-col items-stretch rounded-xl">
                <InputGroupTextarea
                  id={id}
                  name={field.name}
                  rows={2}
                  placeholder={m.ai_question_placeholder()}
                  className="max-h-48 min-h-14 px-3.5 pt-3 text-sm"
                  value={field.state.value}
                  onChange={event => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  onKeyDown={event => {
                    // Enter sends as in any chat; with Shift, or while an input method composes a word, it is a key.
                    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                    event.preventDefault()
                    if (!pending) void form.handleSubmit()
                  }}
                  aria-invalid={error !== undefined || undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                />
                <InputGroupAddon align="block-end" className="justify-between gap-2 px-2 pb-2">
                  <span className="ps-1.5 text-xs text-muted-foreground pointer-coarse:hidden">
                    {m.ai_composer_hint()}
                  </span>
                  {stop ? (
                    <Button type="button" variant="outline" size="sm" className="ms-auto" onClick={stop.onStop}>
                      <Square data-icon="inline-start" aria-hidden className="fill-current" />
                      {stop.label}
                    </Button>
                  ) : (
                    <form.Subscribe selector={state => state.values.question.trim() === ''}>
                      {empty => (
                        <SubmitButton
                          type="submit"
                          size="icon-sm"
                          className="ms-auto rounded-lg"
                          aria-label={m.ai_ask()}
                          pending={pending}
                          disabled={empty}
                        >
                          {pending ? null : <ArrowUp aria-hidden />}
                        </SubmitButton>
                      )}
                    </form.Subscribe>
                  )}
                </InputGroupAddon>
              </InputGroup>
              {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
            </>
          )
        }}
      </form.AppField>
    </form>
  )
}
