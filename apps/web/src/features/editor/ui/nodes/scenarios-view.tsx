import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { useState } from 'react'

import { safeImageUrl } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { isRecord } from '../../model/document'
import { stringAttr } from './align'

type Option = { id: string; text: string; next: string | null }
type Step = { id: string; text: string; imageUrl: string | undefined; options: Option[] }

const readSteps = (value: unknown): Step[] =>
  (Array.isArray(value) ? value : []).filter(isRecord).map(step => ({
    id: stringAttr(step['id']),
    text: stringAttr(step['text']),
    imageUrl: safeImageUrl(stringAttr(step['imageUrl'])),
    options: (Array.isArray(step['options']) ? step['options'] : []).filter(isRecord).map(option => ({
      id: stringAttr(option['id']),
      text: stringAttr(option['text']),
      next: typeof option['nextScenarioId'] === 'string' ? option['nextScenarioId'] : null,
    })),
  }))

/** scenarios: a branching story; each choice leads to the next step until a step without choices. */
export function ScenariosView({ node }: ReactNodeViewProps) {
  const steps = readSteps(node.attrs['scenarios'])
  const first = stringAttr(node.attrs['currentScenarioId']) || steps[0]?.id || ''
  const [current, setCurrent] = useState(first)
  const step = steps.find(candidate => candidate.id === current)
  return (
    <NodeViewWrapper className="my-4 flex flex-col gap-4 rounded-lg border border-border bg-card p-gutter text-card-foreground">
      {node.attrs['title'] ? <p className="text-lg font-semibold">{stringAttr(node.attrs['title'])}</p> : null}
      <div aria-live="polite" className="flex flex-col gap-4">
        {step?.imageUrl ? <img src={step.imageUrl} alt="" className="h-auto max-w-full rounded-lg" /> : null}
        <p className="whitespace-pre-line">{step ? step.text : m.editor_scenario_end()}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {step?.options.map(option => (
          <Button key={option.id} variant="outline" onClick={() => setCurrent(option.next ?? '')}>
            {option.text}
          </Button>
        ))}
        {!step || step.options.length === 0 ? (
          <Button variant="secondary" onClick={() => setCurrent(first)}>
            {m.editor_scenario_restart()}
          </Button>
        ) : null}
      </div>
    </NodeViewWrapper>
  )
}
