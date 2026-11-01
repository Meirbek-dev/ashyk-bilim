import { useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { codeLanguagesOptions } from '../queries'

/** A code answer's language by name from the loader's list; the language id when the list is missing. */
export function CodeLanguage({ id }: { id: number }) {
  const languages = useQueryClient().getQueryData(codeLanguagesOptions().queryKey)
  const name = languages?.find(language => language.id === id)?.name
  return <p className="text-sm text-muted-foreground">{name ?? m.grading_code_language({ id })}</p>
}
