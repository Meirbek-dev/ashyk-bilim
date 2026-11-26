import { afterEach, describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { Toaster, toast } from './toast'

afterEach(() => toast.dismiss())

const toastNamed = (title: string) =>
  [...document.querySelectorAll('[data-slot="toast"]')].find(el => el.textContent.includes(title))

const contentOf = (title: string) => toastNamed(title)?.querySelector('[data-slot="toast-content"]')

const announced = (politeness: 'polite' | 'assertive', text: string) =>
  [...document.querySelectorAll(`[aria-live="${politeness}"]`)].some(el => el.textContent.includes(text))

describe('Toaster', () => {
  test('a toast shows in the named region and is announced politely', async () => {
    const screen = await renderInRouter(<Toaster />)
    toast({ title: 'Сохранено', description: 'Курс виден учащимся' })
    const region = screen.getByRole('region', { name: m.ui_toast_region() })
    await expect.element(region.getByText('Сохранено')).toBeVisible()
    await expect.element(region.getByText('Курс виден учащимся')).toBeVisible()
    await expect.poll(() => announced('polite', 'Сохранено')).toBe(true)
  })

  test('an error is announced assertively, with its icon', async () => {
    await renderInRouter(<Toaster />)
    toast.error({ title: 'Не удалось' })
    await expect.poll(() => announced('assertive', 'Не удалось')).toBe(true)
    expect(toastNamed('Не удалось')?.querySelector('[data-slot="toast-icon"] svg')).not.toBeNull()
  })

  test('a collapsed stack hides the text of the toasts behind the front one', async () => {
    await renderInRouter(<Toaster />)
    toast({ title: 'Первое' })
    toast({ title: 'Второе' })
    await expect.poll(() => contentOf('Второе') && getComputedStyle(contentOf('Второе')!).opacity).toBe('1')
    await expect.poll(() => contentOf('Первое') && getComputedStyle(contentOf('Первое')!).opacity).toBe('0')
    // Hidden, not only transparent: no faint text for a contrast check or a screen reader to find.
    expect(getComputedStyle(contentOf('Первое')!).visibility).toBe('hidden')
  })

  test('the close button, named in the page language, closes the toast', async () => {
    const screen = await renderInRouter(<Toaster />)
    toast({ title: 'Отмечено' })
    await expect.element(screen.getByText('Отмечено')).toBeVisible()
    await screen.getByRole('button', { name: m.ui_close() }).click()
    await expect.poll(() => toastNamed('Отмечено')).toBeUndefined()
  })
})
