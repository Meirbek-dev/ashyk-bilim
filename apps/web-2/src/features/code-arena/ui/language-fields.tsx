import { Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { LanguageInfo } from '#/shared/api/gen/types.gen'
import { Checkbox } from '#/shared/ui/checkbox'
import { Label } from '#/shared/ui/label'
import { Skeleton } from '#/shared/ui/skeleton'

import { languageOf } from '../model/arena'
import { LanguageSelect } from './language-select'
import { CodeEditor } from './lazy-editor'
import type { CodeFormApi } from './use-code-item-form'

type LanguageFieldsProps = { form: CodeFormApi; languages: LanguageInfo[] | null; readOnly: boolean }

const toggle = (ids: number[], id: number, on: boolean) => (on ? [...ids, id] : ids.filter(other => other !== id))

/**
 * Languages (B-COD-15): checkboxes from the platform's list (plus any stored one it no longer offers); the starter code
 * and the reference solution of one chosen language at a time. Without the list the choice stays as stored.
 */
export function LanguageFields({ form, languages, readOnly }: LanguageFieldsProps) {
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <legend className="mb-2 text-lg font-semibold">{m.code_languages()}</legend>
      <form.Subscribe selector={state => state.values.languages}>
        {chosen => {
          const offered = [...(languages ?? []).map(language => language.id), ...chosen].filter(
            (id, index, all) => all.indexOf(id) === index,
          )
          const current = picked !== null && chosen.includes(picked) ? picked : chosen[0]
          return (
            <>
              {languages === null ? (
                <p className="text-sm text-muted-foreground">{m.code_languages_unavailable()}</p>
              ) : (
                <form.Field name="languages">
                  {field => (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">{m.code_languages_hint()}</p>
                      <ul className="grid gap-2 @xl:grid-cols-3">
                        {offered.map(id => (
                          <li key={id} className="flex items-center gap-2">
                            <Checkbox
                              id={`code-language-${id}`}
                              checked={chosen.includes(id)}
                              onCheckedChange={on => field.handleChange(toggle(chosen, id, on))}
                            />
                            <Label htmlFor={`code-language-${id}`}>
                              {languageOf(languages, id)?.name ?? m.code_language_unknown({ id })}
                            </Label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </form.Field>
              )}
              {current === undefined ? (
                <p className="text-sm text-muted-foreground">{m.code_no_languages()}</p>
              ) : (
                <>
                  <LanguageSelect
                    label={m.code_code_language()}
                    value={current}
                    ids={chosen}
                    languages={languages}
                    onChange={setPicked}
                  />
                  {(['starter', 'reference'] as const).map(name => (
                    <form.Field key={name} name={name}>
                      {field => (
                        <div className="flex min-w-0 flex-col gap-2">
                          <span className="text-sm font-medium">
                            {name === 'starter' ? m.code_field_starter() : m.code_field_reference()}
                          </span>
                          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                            <CodeEditor
                              readOnly={readOnly}
                              value={field.state.value[String(current)] ?? ''}
                              mode={languageOf(languages, current)?.monaco_language ?? 'plaintext'}
                              label={name === 'starter' ? m.code_field_starter() : m.code_field_reference()}
                              onChange={text => field.handleChange({ ...field.state.value, [String(current)]: text })}
                            />
                          </Suspense>
                        </div>
                      )}
                    </form.Field>
                  ))}
                </>
              )}
            </>
          )
        }}
      </form.Subscribe>
    </fieldset>
  )
}
