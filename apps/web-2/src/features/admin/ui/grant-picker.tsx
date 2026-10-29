import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

type Choice = { value: string; label: string }

/** One part of a grant (resource, action or scope): a labelled native select. */
export function GrantPicker({
  label,
  value,
  choices,
  disabled,
  onChange,
}: {
  label: string
  value: string
  choices: Choice[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      disabled={disabled}
      className="w-full"
      onChange={event => onChange(event.target.value)}
    >
      {choices.map(choice => (
        <NativeSelectOption key={choice.value} value={choice.value}>
          {choice.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
