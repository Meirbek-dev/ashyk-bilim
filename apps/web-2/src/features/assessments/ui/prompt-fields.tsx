import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { MediaRef, TextFormat } from '#/shared/api/gen/types.gen'
import { Field, FieldLabel } from '#/shared/ui/field'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'
import { Textarea } from '#/shared/ui/textarea'

import type { EditMode } from '../model/route'
import { formatLabels } from './labels'
import { MarkdownField } from './markdown-field'
import { MediaList } from './media-list'

const FORMATS = ['markdown', 'plain'] as const satisfies TextFormat[]
const textFormat = (value: string): TextFormat => FORMATS.find(format => format === value) ?? 'markdown'

type Prompted = { prompt?: string; prompt_format?: TextFormat; media?: MediaRef[] }
type PromptFieldsProps<T extends Prompted> = { body: T; onChange: (body: T) => void; mode: EditMode }

/**
 * The prompt of a question: its format (markdown, or plain text as a spreadsheet import writes it: shown as typed),
 * the text and the pictures under it. The format is part of what learners answered (the server's answer key); the
 * text and the pictures are wording.
 */
export function PromptFields<T extends Prompted>({ body, onChange, mode }: PromptFieldsProps<T>) {
  const id = useId()
  const format = body.prompt_format ?? 'markdown'
  const editable = mode !== 'none'
  return (
    <div className="flex flex-col gap-2">
      {format === 'plain' ? (
        <>
          <label htmlFor={`${id}-text`} className="text-sm font-medium">
            {m.assessments_field_prompt()}
          </label>
          <Textarea
            id={`${id}-text`}
            className="whitespace-pre-wrap"
            value={body.prompt ?? ''}
            disabled={!editable}
            onChange={event => onChange({ ...body, prompt: event.target.value })}
          />
        </>
      ) : (
        <MarkdownField
          label={m.assessments_field_prompt()}
          value={body.prompt ?? ''}
          onChange={text => onChange({ ...body, prompt: text })}
          editable={editable}
        />
      )}
      <Field orientation="horizontal" className="w-auto self-start">
        <FieldLabel htmlFor={`${id}-format`} className="font-normal text-muted-foreground">
          {m.assessments_field_prompt_format()}
        </FieldLabel>
        <NativeSelect
          id={`${id}-format`}
          size="sm"
          value={format}
          disabled={mode !== 'all'}
          onChange={event => onChange({ ...body, prompt_format: textFormat(event.target.value) })}
        >
          {FORMATS.map(value => (
            <NativeSelectOption key={value} value={value}>
              {formatLabels[value]()}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <MediaList media={body.media} onChange={media => onChange({ ...body, media })} editable={editable} />
    </div>
  )
}
