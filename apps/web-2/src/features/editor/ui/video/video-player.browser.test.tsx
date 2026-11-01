import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'
import { storageItem } from '#/shared/lib/storage'

import clip from '../../../../../e2e/fixtures/clip-30s.webm?url'
import lecture from '../../../../../e2e/fixtures/lecture.mp4?url'
import { VideoEndedContext } from '../../model/video-ended'
import { rateLabel } from './rate-label'
import { savePosition } from './saved'
import { VideoPlayer } from './video-player'

const video = () => {
  const element = document.querySelector('video')
  if (!element) throw new Error('no video element')
  return element
}

/** The metadata is in (the duration is known). */
async function loaded() {
  await expect.poll(() => video().readyState).toBeGreaterThanOrEqual(HTMLMediaElement.HAVE_METADATA)
}

const saved = (key: 'ab.video-player' | 'ab.video-positions') => storageItem(key, v.record(v.string(), v.unknown()))

beforeEach(() => {
  saved('ab.video-player').remove()
  saved('ab.video-positions').remove()
})

describe('B-EDT-19 video player', () => {
  test('B-EDT-19 keys skip and mute once focus is in the player; the change shows over the picture', async () => {
    const screen = await renderInRouter(<VideoPlayer src={clip} />)
    await loaded()
    await expect.element(screen.getByText('0:00 / 0:30')).toBeInTheDocument()
    screen.getByRole('button', { name: m.editor_video_play() }).element().focus()
    await userEvent.keyboard('l')
    await expect.poll(() => video().currentTime).toBe(10)
    await expect.element(screen.getByText(m.editor_video_skipped({ seconds: '+10' }))).toBeVisible()
    await userEvent.keyboard('5')
    await expect.poll(() => video().currentTime).toBe(15)
    await userEvent.keyboard('m')
    await expect
      .element(screen.getByRole('button', { name: m.editor_video_mute() }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(video().muted).toBe(true)
  })

  test('B-EDT-19 the speed menu sets the speed, and the next video starts at it', async () => {
    const first = await renderInRouter(<VideoPlayer src={clip} />)
    await loaded()
    await first.getByRole('button', { name: m.editor_video_speed() }).click()
    await first.getByRole('menuitemradio', { name: rateLabel(1.5) }).click()
    expect(video().playbackRate).toBe(1.5)
    await expect.element(first.getByRole('button', { name: m.editor_video_speed() })).toHaveTextContent(rateLabel(1.5))
    document.body.replaceChildren()
    await renderInRouter(<VideoPlayer src={lecture} />)
    await loaded()
    await expect.poll(() => video().playbackRate).toBe(1.5)
  })

  test('B-EDT-19 a video continues where it was left, and can start over', async () => {
    savePosition(clip, 12, 30)
    const screen = await renderInRouter(<VideoPlayer src={clip} />)
    await expect.element(screen.getByText(m.editor_video_resumed({ time: '0:12' }))).toBeVisible()
    expect(video().currentTime).toBe(12)
    await screen.getByRole('button', { name: m.editor_video_restart() }).click()
    expect(video().currentTime).toBe(0)
    await expect.element(screen.getByText(m.editor_video_resumed({ time: '0:12' }))).not.toBeInTheDocument()
  })

  test('B-EDT-19 played to the end, it tells the lesson and offers to watch again', async () => {
    const ended = vi.fn<() => void>()
    const screen = await renderInRouter(
      <VideoEndedContext value={ended}>
        <VideoPlayer src={lecture} />
      </VideoEndedContext>,
    )
    await loaded()
    video().muted = true
    await screen.getByRole('button', { name: m.editor_video_play() }).click()
    await expect.poll(() => ended.mock.calls.length, { timeout: 5000 }).toBe(1)
    await expect.element(screen.getByRole('button', { name: m.editor_video_replay() })).toBeVisible()
    expect(saved('ab.video-positions').get()).toEqual({})
  })
})
