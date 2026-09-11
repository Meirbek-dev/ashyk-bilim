/** @vitest-environment jsdom */
// Gauntlet: "7 минут назад" differed between the SSR pass and the client
// (different `now`) → hydration error. The relative form is client-only.
import { describe, expect, it } from 'vite-plus/test'
import { renderToString } from 'react-dom/server'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import RelativeTime from '@/components/discussions/relative-time'
import ruMessages from '@/messages/ru-RU.json'

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
    {node}
  </NextIntlClientProvider>
)

describe('RelativeTime', () => {
  const date = new Date(Date.now() - 7 * 60_000).toISOString()

  it('renders a now-independent absolute date on the server', () => {
    const html = renderToString(wrap(<RelativeTime date={date} />))
    expect(html).not.toMatch(/назад/)
    expect(html).toMatch(/\d{4} г\./)
  })

  it('renders the relative form once mounted', () => {
    render(wrap(<RelativeTime date={date} />))
    expect(screen.getByText(/7 минут назад/)).toBeInTheDocument()
  })
})
