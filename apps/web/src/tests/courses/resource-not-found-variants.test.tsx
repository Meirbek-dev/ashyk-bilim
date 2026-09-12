/** @vitest-environment jsdom */
// Critic 9: `/ru/collection/<unknown>` rendered the crash page and
// `/ru/user/<unknown>` a generic "could not load" — both are localized
// not-found cards now, and an unknown username resolves to `null`, not a throw.
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import ResourceNotFound from '@/components/Errors/ResourceNotFound'
import { APIError } from '@/lib/api/assertSuccess'
import { getUserByUsername } from '@/services/users/users'
import kkMessages from '@/messages/kk-KZ.json'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/lib/api-client', () => ({
  apiJson: vi.fn(async () => {
    throw new APIError({ code: 'not-found', status: 404, message: 'user not found' })
  }),
}))

describe('not-found variants', () => {
  it.each([
    ['collection', 'Коллекция не найдена', 'Жинақ табылмады'],
    ['user', 'Пользователь не найден', 'Пайдаланушы табылмады'],
  ] as const)('renders the %s card in ru and kk', (type, ru, kk) => {
    const { unmount } = render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <ResourceNotFound type={type} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('heading', { name: ru })).toBeInTheDocument()
    unmount()
    render(
      <NextIntlClientProvider locale="kk" messages={kkMessages}>
        <ResourceNotFound type={type} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('heading', { name: kk })).toBeInTheDocument()
  })

  it('resolves an unknown username to null instead of throwing', async () => {
    await expect(getUserByUsername('nobody-xyz')).resolves.toBeNull()
  })
})
