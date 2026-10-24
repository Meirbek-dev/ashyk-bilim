import type { ViewProps } from './parts'
import { useId } from 'react'

import { m } from '#/paraglide/messages'
import { Checkbox } from '#/shared/ui/checkbox'
import { Input } from '#/shared/ui/input'
import { Label } from '#/shared/ui/label'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

import { stringAttr } from './align'

const ALIGNMENTS = [
  ['left', () => m.editor_align_left()],
  ['center', () => m.editor_align_center()],
  ['right', () => m.editor_align_right()],
] as const

/** A link card's display options (B-EDT-28), applied as they change: alignment, an "open" button and its label. */
export function PreviewOptions({ node, updateAttributes }: Pick<ViewProps, 'node' | 'updateAttributes'>) {
  const id = useId()
  const showButton = node.attrs['showButton'] === true
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-align`}>{m.editor_align()}</Label>
        <NativeSelect
          id={`${id}-align`}
          value={stringAttr(node.attrs['alignment']) || 'left'}
          onChange={event => updateAttributes({ alignment: event.target.value })}
        >
          {ALIGNMENTS.map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label()}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Label className="h-control">
        <Checkbox checked={showButton} onCheckedChange={checked => updateAttributes({ showButton: checked })} />
        {m.editor_preview_show_button()}
      </Label>
      {showButton ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-label`}>{m.editor_preview_button_label()}</Label>
          <Input
            id={`${id}-label`}
            value={stringAttr(node.attrs['buttonLabel'])}
            placeholder={m.editor_preview_open()}
            onChange={event => updateAttributes({ buttonLabel: event.target.value })}
          />
        </div>
      ) : null}
    </div>
  )
}
