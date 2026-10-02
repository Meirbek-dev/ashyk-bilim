import { describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { Button } from '../button'
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
})
