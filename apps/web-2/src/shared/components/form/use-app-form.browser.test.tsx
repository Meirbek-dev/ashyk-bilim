import { useNavigate } from '@tanstack/react-router'
import * as v from 'valibot'
import { afterEach, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { renderInRouter } from '../testing'
import { useAppForm } from './use-app-form'

const schema = v.object({ name: v.string() })
const named = v.object({ name: v.pipe(v.string(), v.nonEmpty()) })
const text = { name: 'Name', save: 'Save', leave: 'Leave' }
// Each click leaves for a new address: a link to the current one is no navigation at all.
let hops = 0

type GuardedFormProps = {
  save: () => Promise<void>
  onChange?: (name: string) => void
  rules?: v.GenericSchema<{ name: string }>
}

function GuardedForm({ save, onChange, rules = schema }: GuardedFormProps) {
  const navigate = useNavigate()
  const form = useAppForm(rules, {
    defaultValues: { name: 'Algebra' },
    onSubmit: save,
    leaveGuard: true,
    onChange: value => onChange?.(value.name),
  })
  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="name">{field => <field.TextField label={text.name} />}</form.AppField>
      <Button type="submit">{text.save}</Button>
      <Button onClick={() => void navigate({ href: `/away/${(hops += 1)}` })}>{text.leave}</Button>
    </form>
  )
}

afterEach(() => vi.restoreAllMocks())

test('a guarded form asks before a link drops an unsaved edit, and not once it is saved', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const save = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const screen = await renderInRouter(<GuardedForm save={save} />)
  await screen.getByRole('button', { name: text.leave }).click()
  expect(confirm).not.toHaveBeenCalled()

  await screen.getByLabelText(text.name).fill('Geometry')
  await expect.element(screen.getByLabelText(text.name)).toHaveValue('Geometry')
  await screen.getByRole('button', { name: text.leave }).click()
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(m.ui_unsaved_leave()))

  confirm.mockClear()
  await screen.getByRole('button', { name: text.save }).click()
  await vi.waitFor(() => expect(save).toHaveBeenCalled())
  await screen.getByRole('button', { name: text.leave }).click()
  expect(confirm).not.toHaveBeenCalled()
})

test('onChange sees the values after each edit of a field, and not a submit', async () => {
  const onChange = vi.fn<(name: string) => void>()
  const save = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const screen = await renderInRouter(<GuardedForm save={save} onChange={onChange} />)
  await screen.getByLabelText(text.name).fill('Geometry')
  await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('Geometry'))

  onChange.mockClear()
  await screen.getByRole('button', { name: text.save }).click()
  await vi.waitFor(() => expect(save).toHaveBeenCalled())
  expect(onChange).not.toHaveBeenCalled()
})

test('a refused submit moves focus from the button to the field to fix', async () => {
  const save = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const screen = await renderInRouter(<GuardedForm save={save} rules={named} />)
  await screen.getByLabelText(text.name).fill('')
  await screen.getByRole('button', { name: text.save }).click()
  await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(text.name).element()))
  expect(save).not.toHaveBeenCalled()
})
