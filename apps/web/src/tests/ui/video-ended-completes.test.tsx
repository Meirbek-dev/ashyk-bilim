/** @vitest-environment jsdom */
// A lesson video played to the end reports it, so the activity page marks the
// lesson complete without an extra «Отметить как завершённое» click.
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import ruMessages from '@/messages/ru-RU.json'

const players: { video: HTMLVideoElement; handlers: Record<string, () => void> }[] = []
vi.mock('artplayer', () => ({
  default: class {
    video = document.createElement('video')
    handlers: Record<string, () => void> = {}
    isDestroy = false
    currentTime = 0
    constructor() {
      players.push(this)
    }
    on(name: string, handler: () => void) {
      this.handlers[name] = handler
    }
    off() {}
    pause() {}
    destroy() {
      this.isDestroy = true
    }
  },
}))

const { default: ArtPlayer } = await import('@components/Objects/Activities/Video/Artplayer')

afterEach(() => {
  players.length = 0
  vi.unstubAllGlobals()
})

function renderPlayer(props: { onEnded: () => void; endTime?: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 })),
  )
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <ArtPlayer option={{ url: '/content/v.mp4', lang: 'ru' }} {...props} />
    </NextIntlClientProvider>,
  )
}

describe('lesson video end', () => {
  it('calls onEnded when the video ends', () => {
    const onEnded = vi.fn()
    renderPlayer({ onEnded })
    players[0]!.video.dispatchEvent(new Event('ended'))
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('calls onEnded when playback reaches the teacher-set end time', () => {
    const onEnded = vi.fn()
    renderPlayer({ onEnded, endTime: 30 })
    const player = players[0]! as unknown as { currentTime: number; handlers: Record<string, () => void> }
    player.currentTime = 10
    player.handlers.timeupdate!()
    expect(onEnded).not.toHaveBeenCalled()
    player.currentTime = 30
    player.handlers.timeupdate!()
    expect(onEnded).toHaveBeenCalledTimes(1)
  })
})
