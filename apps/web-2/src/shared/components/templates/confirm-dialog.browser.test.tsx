import { useState } from 'react'
import { describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { renderInRouter } from '../testing'
import { ConfirmDialog } from './confirm-dialog'

const text = { ask: 'Delete', title: 'Delete course «Algebra»?', consequence: 'Learners lose access.', verb: 'Delete' }

describe('ConfirmDialog', () => {
  test('names the object, starts on Cancel, and confirms only on the destructive verb', async () => {
    const onConfirm = vi.fn<() => void>()
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const screen = await renderInRouter(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        trigger={<Button variant="destructive">{text.ask}</Button>}
        title={text.title}
        consequence={text.consequence}
        confirmLabel={text.verb}
        onConfirm={onConfirm}
        pending={false}
        error={null}
      />,
    )
    const dialog = screen.getByRole('alertdialog', { name: text.title })
    await expect.element(dialog).toHaveAccessibleDescription(text.consequence)
    const cancel = dialog.getByRole('button', { name: m.ui_cancel() })
    await expect.element(cancel).toHaveFocus()
    await cancel.click()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
    await dialog.getByRole('button', { name: text.verb }).click()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  test('when the confirmed action removes its trigger, focus goes to the list it was in, not off the page', async () => {
    function Roles() {
      const [roles, setRoles] = useState(['Moderator', 'User'])
      const [open, setOpen] = useState<string | null>(null)
      return (
        <ul aria-label="Roles">
          {roles.map(role => (
            <li key={role}>
              <ConfirmDialog
                open={open === role}
                onOpenChange={next => setOpen(next ? role : null)}
                trigger={<Button variant="destructive">{`Remove ${role}`}</Button>}
                title={`Remove ${role}?`}
                consequence="Its rights go at once."
                confirmLabel="Remove"
                onConfirm={() => {
                  setOpen(null)
                  setRoles(rest => rest.filter(other => other !== role))
                }}
                pending={false}
                error={null}
              />
            </li>
          ))}
        </ul>
      )
    }
    const screen = await renderInRouter(<Roles />)
    await screen.getByRole('button', { name: 'Remove Moderator' }).click()
    await screen.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click()
    await expect.element(screen.getByRole('button', { name: 'Remove User' })).toHaveFocus()
  })
})
