/** @vitest-environment jsdom */
// UX-257: the course landing's video thumbnail whose object is gone from
// storage shows the UX-221 «Видео недоступно» state, not a dead black player.
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import CourseThumbnailVideo from '@components/Pages/Courses/CourseThumbnailVideo'
import ruMessages from '@/messages/ru-RU.json'

function renderVideo(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status })),
  )
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <CourseThumbnailVideo src="/content/thumb.mp4" />
    </NextIntlClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('course thumbnail video (UX-257)', () => {
  it('a missing object shows the unavailable state instead of the player', async () => {
    const { container } = renderVideo(404)
    expect(await screen.findByRole('alert')).toHaveTextContent(ruMessages.Components.MediaUnavailable.video)
    expect(container.querySelector('video')).toBeNull()
  })

  it('a present object keeps the player', async () => {
    const { container } = renderVideo(200)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container.querySelector('video')).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
