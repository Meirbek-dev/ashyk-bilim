import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { vStudyRequest } from '#/shared/api/gen/valibot.gen'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

// The question's limits come from the contract (`StudyRequest.question`); Q&A takes the same text.
const vAsk = v.pick(vStudyRequest, ['question'])

type AskFormProps = {
  label: string
  pending: boolean
  onAsk: (question: string) => void
  /** Shown in place of the send button while a run streams: "Stop". */
  stop?: { label: string; onStop: () => void } | null
}

/** The question box of the panel: send is off while the box is empty or a run is pending (B-AI-05). */
export function AskForm({ label, pending, onAsk, stop }: AskFormProps) {
  const form = useAppForm(vAsk, {
    defaultValues: { question: '' },
    onSubmit: ({ question }) => {
      onAsk(question.trim())
      form.reset()
    },
  })
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="question">{field => <field.TextareaField label={label} />}</form.AppField>
      <div className="flex justify-end gap-2">
        {stop ? (
          <Button type="button" variant="outline" onClick={stop.onStop}>
            {stop.label}
          </Button>
        ) : null}
        <form.Subscribe selector={state => state.values.question.trim() === ''}>
          {empty => (
            <Button type="submit" disabled={empty || pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {m.ai_ask()}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
