/** @vitest-environment jsdom */
// UX-221: a hosted PDF/video whose storage object is gone (HEAD 404 / S3 403)
// shows a localized error state instead of raw S3 XML or «Reconnect: N».
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { CheckedMedia } from '@components/Objects/Activities/Media/MediaUnavailable'
import ruMessages from '@/messages/ru-RU.json'

function renderPdf(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status })),
  )
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <CheckedMedia url="/content/x.pdf" kind="pdf">
        <iframe title="pdf" src="/content/x.pdf" />
      </CheckedMedia>
    </NextIntlClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('missing media (UX-221)', () => {
  it.each([403, 404])('a %i object shows the error state', async status => {
    renderPdf(status)
    expect(await screen.findByRole('alert')).toHaveTextContent('Документ недоступен')
    expect(screen.queryByTitle('pdf')).toBeNull()
    expect(fetch).toHaveBeenCalledWith('/content/x.pdf', expect.objectContaining({ method: 'HEAD' }))
  })

  it('a present object keeps the viewer', async () => {
    renderPdf(200)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.getByTitle('pdf')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
