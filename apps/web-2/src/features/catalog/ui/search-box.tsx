import { useAppForm } from '#/shared/ui/form/use-app-form'

import { searchBoxSchema } from '../model/catalog'

type SearchBoxProps = {
  /** The URL value; key the box by it so "back" to another search refills it. */
  q: string | undefined
  label: string
  /** Puts the trimmed text (undefined when blank) into the URL. */
  onSearch: (q: string | undefined) => Promise<void>
}

/** A text search that lives in the URL: Enter submits, the page reads the URL, never this box. */
export function SearchBox({ q, label, onSearch }: SearchBoxProps) {
  const form = useAppForm(searchBoxSchema, {
    defaultValues: { q: q ?? '' },
    onSubmit: ({ q: text }) => onSearch(text.trim() || undefined),
  })
  return (
    <search className="w-full max-w-sm">
      <form
        onSubmit={event => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.AppField name="q">{field => <field.TextField label={label} type="search" />}</form.AppField>
      </form>
    </search>
  )
}
