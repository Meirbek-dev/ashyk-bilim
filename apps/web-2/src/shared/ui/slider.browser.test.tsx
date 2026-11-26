import { useState } from 'react'
import { expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { renderInRouter } from '#/shared/components/testing'
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from '#/shared/ui/slider'

const volume = 'Volume'

function Harness({ onCommit }: { onCommit: (value: number) => void }) {
  const [value, setValue] = useState(0.5)
  return (
    <Slider
      value={value}
      max={1}
      step={0.05}
      format={next => `${Math.round(next * 100)} %`}
      onValueChange={setValue}
      onValueCommit={onCommit}
    >
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb aria-label={volume} />
        </SliderTrack>
      </SliderControl>
    </Slider>
  )
}

test('a slider steps with the keys, reads its formatted value and commits once per key', async () => {
  const commits: number[] = []
  const screen = await renderInRouter(<Harness onCommit={value => commits.push(value)} />)
  const thumb = screen.getByRole('slider', { name: volume })
  await expect.element(thumb).toHaveAttribute('aria-valuetext', '50 %')
  thumb.element().focus()
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(thumb).toHaveAttribute('aria-valuetext', '55 %')
  await userEvent.keyboard('{End}')
  await expect.element(thumb).toHaveAttribute('aria-valuetext', '100 %')
  await userEvent.keyboard('{Home}')
  await expect.element(thumb).toHaveAttribute('aria-valuetext', '0 %')
  expect(commits).toEqual([0.55, 1, 0])
})

test('a vertical slider counts up with ArrowUp', async () => {
  const screen = await renderInRouter(
    <Slider orientation="vertical" defaultValue={40} step={10} className="h-40">
      <SliderControl>
        <SliderTrack>
          <SliderThumb aria-label={volume} />
        </SliderTrack>
      </SliderControl>
    </Slider>,
  )
  const thumb = screen.getByRole('slider', { name: volume })
  await expect.element(thumb).toHaveAttribute('aria-valuetext', '40')
  thumb.element().focus()
  await userEvent.keyboard('{ArrowUp}')
  await expect.element(thumb).toHaveAttribute('aria-valuetext', '50')
  await expect.element(thumb).toHaveAttribute('aria-orientation', 'vertical')
})
