import { describe, expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'

import { renderInRouter } from '../testing'
import { PasswordInput } from './password-input'

describe('PasswordInput', () => {
  test('B-AUTH-01 «Показать пароль» shows what was typed and hides it again', async () => {
    const screen = await renderInRouter(
      <PasswordInput aria-label={m.auth_login_field_password()} defaultValue="Secret-1!" />,
    )
    const input = screen.getByLabelText(m.auth_login_field_password(), { exact: true })
    const toggle = screen.getByRole('button', { name: m.ui_password_show() })
    await expect.element(input).toHaveAttribute('type', 'password')
    await userEvent.click(toggle)
    await expect.element(input).toHaveAttribute('type', 'text')
    await expect.element(toggle).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(toggle)
    await expect.element(input).toHaveAttribute('type', 'password')
  })
})
