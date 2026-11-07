import { Button } from '#/shared/ui/button'

type SelectToggleProps = { selecting: boolean; onChange: (selecting: boolean) => void; start: string; done: string }

/**
 * «Выбрать несколько» / «Готово» over a list whose rows can be picked for a bulk action: the checkboxes show only once
 * asked for. A box before every row read as a form to fill, and most visits open one row.
 */
export function SelectToggle({ selecting, onChange, start, done }: SelectToggleProps) {
  return (
    <Button variant={selecting ? 'secondary' : 'ghost'} aria-pressed={selecting} onClick={() => onChange(!selecting)}>
      {selecting ? done : start}
    </Button>
  )
}
