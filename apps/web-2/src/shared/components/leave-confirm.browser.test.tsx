import { expect, test } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'

import { confirmLeave, LeaveConfirmHost } from './leave-confirm'
import { renderInRouter } from './testing'

const question = { title: m.ui_file_leave(), consequence: m.ui_file_leave_consequence() }

test('«Уйти» answers leave, «Отмена» and Escape answer stay', async () => {
  await renderInRouter(<LeaveConfirmHost />)
  const dialog = page.getByRole('alertdialog')

  const left = confirmLeave(question)
  await expect.element(dialog).toHaveAccessibleDescription(question.consequence)
  await dialog.getByRole('button', { name: m.ui_leave_confirm() }).click()
  expect(await left).toBe(true)
  await expect.element(dialog).not.toBeInTheDocument()

  const stayed = confirmLeave(question)
  await expect.element(dialog.getByRole('button', { name: m.ui_cancel() })).toHaveFocus()
  await dialog.getByRole('button', { name: m.ui_cancel() }).click()
  expect(await stayed).toBe(false)

  const escaped = confirmLeave(question)
  await expect.element(dialog).toBeVisible()
  await userEvent.keyboard('{Escape}')
  expect(await escaped).toBe(false)
})
