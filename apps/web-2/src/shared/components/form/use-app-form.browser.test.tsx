import { useNavigate } from '@tanstack/react-router'
import * as v from 'valibot'
import { afterEach, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { renderInRouter } from '../testing'
import { useAppForm } from './use-app-form'

const schema = v.object({ name: v.string() })
const text = { name: 'Name', save: 'Save', leave: 'Leave' }
// Each click leaves for a new address: a link to the current one is no navigation at all.
let hops = 0

function GuardedForm({ save }: { save: () => Promise<void> }) {
  const navigate = useNavigate()
  const form = useAppForm(schema, { defaultValues: { name: 'Algebra' }, onSubmit: save, leaveGuard: true })
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
