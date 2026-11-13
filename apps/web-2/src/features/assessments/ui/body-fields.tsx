import { m } from '#/paraglide/messages'
import type { ItemBody } from '#/shared/api/gen/types.gen'

import type { EditMode } from '../model/route'
import { ChoiceFields } from './choice-fields'
import { CodeSummary } from './code-summary'
import { FormFields } from './form-fields'
import { MarkdownField } from './markdown-field'
import { MatchingFields } from './matching-fields'
import { OpenTextFields } from './open-text-fields'
import { PromptFields } from './prompt-fields'

type BodyFieldsProps = { body: ItemBody; onChange: (body: ItemBody) => void; mode: EditMode }

/**
 * The kind-specific part of a question: the prompt and the editor of its kind. Choice, open and matching questions
 * take a plain or markdown prompt with pictures; a form's prompt is markdown; a code task shows its summary.
 */
export function BodyFields({ body, onChange, mode }: BodyFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      {body.kind === 'form' ? (
        <MarkdownField
          label={m.assessments_field_prompt()}
          value={body.prompt ?? ''}
          onChange={text => onChange({ ...body, prompt: text })}
          editable={mode !== 'none'}
        />
      ) : null}
      {body.kind === 'choice' || body.kind === 'open_text' || body.kind === 'matching' ? (
        <PromptFields body={body} onChange={onChange} mode={mode} />
      ) : null}
      {body.kind === 'choice' ? <ChoiceFields body={body} onChange={onChange} mode={mode} /> : null}
      {body.kind === 'matching' && 'pairs' in body ? (
        <MatchingFields body={body} onChange={onChange} mode={mode} />
      ) : null}
      {body.kind === 'open_text' ? <OpenTextFields body={body} onChange={onChange} mode={mode} /> : null}
      {body.kind === 'form' ? <FormFields body={body} onChange={onChange} mode={mode} /> : null}
      {body.kind === 'code' ? <CodeSummary body={body} /> : null}
    </div>
  )
}
