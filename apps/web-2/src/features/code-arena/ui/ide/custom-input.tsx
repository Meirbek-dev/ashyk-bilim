import { useId } from 'react'

import { m } from '#/paraglide/messages'
import { Label } from '#/shared/ui/label'
import { Textarea } from '#/shared/ui/textarea'

/** The program's own input (B-COD-29): «Запустить» in this mode runs the code on it, unscored. */
export function CustomInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId()
  const hint = useId()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Label htmlFor={id}>{m.code_custom_input()}</Label>
      <Textarea
        id={id}
        aria-describedby={hint}
        value={value}
        spellCheck={false}
        onChange={event => onChange(event.target.value)}
        className="min-h-24 flex-1 resize-none font-mono text-sm whitespace-pre"
      />
      <p id={hint} className="text-sm text-muted-foreground">
        {m.code_custom_input_hint()}
      </p>
    </div>
  )
}
