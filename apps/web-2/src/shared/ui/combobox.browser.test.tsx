import { useState } from 'react'
import * as v from 'valibot'
import { describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'

import { Button } from './button'
import type { ComboboxOption } from './combobox'
import { MultiSelectField } from './form/multi-select-field'
import { useAppForm } from './form/use-app-form'
import { renderInRouter } from './testing'

const schema = v.object({ course_ids: v.array(v.string()) })
const text = { label: 'Courses', save: 'Save' }
const page1 = [
  { value: 'c1', label: 'Algebra' },
  { value: 'c2', label: 'Biology' },
  { value: 'c3', label: 'Chemistry' },
]
const page2 = [{ value: 'c4', label: 'Drawing' }]

/** A course picker as a feature would build it: server search + "Show more" over pages. */
function Picker({ submit, search }: { submit: (ids: readonly string[]) => void; search?: boolean }) {
  const [pages, setPages] = useState(1)
  const [query, setQuery] = useState('')
  const all = pages === 1 ? page1 : [...page1, ...page2]
  const options: ComboboxOption[] = search ? all.filter(option => option.label.startsWith(query)) : all
  const form = useAppForm(schema, { defaultValues: { course_ids: [] }, onSubmit: body => submit(body.course_ids) })
  return (
    <>
      <form.AppField name="course_ids">
        {() => (
          <MultiSelectField
            label={text.label}
            options={options}
            hasMore={pages === 1}
            onMore={() => setPages(2)}
            {...(search ? { onQueryChange: setQuery } : {})}
          />
        )}
      </form.AppField>
      <Button onClick={() => void form.handleSubmit()}>{text.save}</Button>
    </>
  )
}

describe('Combobox (multi-select) and MultiSelectField', () => {
  test('arrows and Enter pick several, typing filters, chips show and remove them, the field holds the ids', async () => {
    const submit = vi.fn<(ids: readonly string[]) => void>()
    const screen = await renderInRouter(<Picker submit={submit} />)
    const input = screen.getByLabelText(text.label)

    await input.click()
    await userEvent.keyboard('{ArrowDown}{Enter}{ArrowDown}{Enter}')
    await userEvent.keyboard('Che')
    await expect.element(screen.getByRole('option', { name: 'Chemistry' })).toBeVisible()
    await expect.element(screen.getByRole('option', { name: 'Algebra' })).not.toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    for (const name of ['Algebra', 'Biology', 'Chemistry'])
      await expect.element(screen.getByRole('button', { name: m.ui_option_remove({ label: name }) })).toBeVisible()

    await screen.getByRole('button', { name: m.ui_option_remove({ label: 'Algebra' }) }).click()
    await userEvent.keyboard('{Escape}')
    await screen.getByRole('button', { name: text.save }).click()
    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith(['c2', 'c3']))
  })

  test('"Show more" is the last option: arrows reach it and it loads the next page; a chosen option stays listed and chipped when a search drops it', async () => {
    const submit = vi.fn<(ids: readonly string[]) => void>()
    const screen = await renderInRouter(<Picker submit={submit} search />)

    await screen.getByLabelText(text.label).click()
    await userEvent.keyboard('{ArrowUp}{Enter}')
    await screen.getByRole('option', { name: 'Drawing' }).click()
    await expect.element(screen.getByRole('option', { name: m.ui_show_more() })).not.toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: m.ui_option_remove({ label: 'Drawing' }) })).toBeVisible()

    await userEvent.keyboard('Zz')
    await expect.element(screen.getByRole('option', { name: 'Drawing' })).toBeVisible()
    await expect.element(screen.getByRole('option', { name: 'Algebra' })).not.toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: m.ui_option_remove({ label: 'Drawing' }) })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await screen.getByRole('button', { name: text.save }).click()
    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith(['c4']))
  })
})
