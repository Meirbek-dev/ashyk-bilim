import { RotateCcw } from 'lucide-react'
import { use, useState } from 'react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { justify, stringAttr } from './align'
import { NodeParts, type ViewProps } from './parts'

/** flipcard: a question card that turns over to its answer (self-check). Authoring edits both sides. */
export function FlipcardView({ node, editor, updateAttributes }: ViewProps) {
  const { Wrapper, Authoring } = use(NodeParts)
  const [flipped, setFlipped] = useState(false)
  const question = stringAttr(node.attrs['question'])
  const answer = stringAttr(node.attrs['answer'])
  if (editor.isEditable && Authoring)
    return (
      <Wrapper className="my-4">
        <Authoring.AttrForm
          fields={[
            { name: 'question', label: m.editor_field_question(), multiline: true },
            { name: 'answer', label: m.editor_field_answer(), multiline: true },
          ]}
          values={{ question, answer }}
          onApply={values => updateAttributes(values)}
        />
      </Wrapper>
    )
  return (
    <Wrapper className={`my-4 flex ${justify(node.attrs['alignment'])}`}>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-gutter text-card-foreground">
        <p aria-live="polite" className="text-base whitespace-pre-line">
          {flipped ? answer : question}
        </p>
        <div>
          <Button variant="outline" aria-pressed={flipped} onClick={() => setFlipped(!flipped)}>
            <RotateCcw aria-hidden />
            {flipped ? m.editor_flipcard_show_question() : m.editor_flipcard_show_answer()}
          </Button>
        </div>
      </div>
    </Wrapper>
  )
}
