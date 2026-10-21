import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { RootErrorView } from './root-error-view'

describe('RootErrorView', () => {
  test('a failed session read (API down: fetch failed) shows the brand, the error and Retry, not bare skeletons', async () => {
    const screen = await renderInRouter(
      <RootErrorView error={new TypeError('fetch failed')} reset={() => undefined} info={{ componentStack: '' }} />,
    )
    await expect.element(screen.getByRole('heading', { level: 1, name: m.platform_error_title() })).toBeVisible()
    // No answer from the API reads as no connection, not as an unknown error.
    await expect.element(screen.getByText(m.errors_network())).toBeVisible()
    await expect.element(screen.getByRole('button', { name: m.platform_error_retry() })).toBeVisible()
    await expect.element(screen.getByRole('link', { name: m.platform_brand() })).toHaveAttribute('href', '/')
    expect(document.querySelector('[data-slot=skeleton]')).toBeNull()
  })

  test('a chunk of an older release (a tab opened before a deploy) asks for a reload, not Retry', async () => {
    const error = new TypeError('Failed to fetch dynamically imported module: http://x/assets/route-abc.js')
    const screen = await renderInRouter(
      <RootErrorView error={error} reset={() => undefined} info={{ componentStack: '' }} />,
    )
    await expect.element(screen.getByRole('heading', { level: 1, name: m.platform_error_stale_title() })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: m.platform_error_reload() })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: m.platform_error_retry() })).not.toBeInTheDocument()
  })

  test('an error that is not about the network stays generic', async () => {
    const screen = await renderInRouter(
      <RootErrorView error={new Error('boom')} reset={() => undefined} info={{ componentStack: '' }} />,
    )
    await expect.element(screen.getByText(m.platform_error_text())).toBeVisible()
  })
})
