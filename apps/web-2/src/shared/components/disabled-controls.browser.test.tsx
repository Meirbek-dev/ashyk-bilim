import { describe, expect, test } from 'vite-plus/test'

import { Checkbox } from '#/shared/ui/checkbox'
import { Label } from '#/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

import { renderInRouter } from './testing'

const [locked, live, radio] = ['Locked', 'Live', 'Radio']
const opacity = (element: Element) => getComputedStyle(element).opacity

describe('disabled controls', () => {
  test('a disabled checkbox and radio are dimmed with their labels, enabled ones are not', async () => {
    const screen = await renderInRouter(
      <div>
        <div className="flex gap-2">
          <Checkbox id="off" disabled />
          <Label htmlFor="off">{locked}</Label>
        </div>
        <div className="flex gap-2">
          <Checkbox id="on" />
          <Label htmlFor="on">{live}</Label>
        </div>
        <RadioGroup disabled defaultValue="a">
          <div className="flex gap-2">
            <RadioGroupItem id="radio" value="a" />
            <Label htmlFor="radio">{radio}</Label>
          </div>
        </RadioGroup>
      </div>,
    )
    await expect.element(screen.getByText('Locked')).toBeVisible()
    expect(opacity(screen.getByRole('checkbox', { name: 'Locked' }).element())).toBe('0.5')
    expect(opacity(screen.getByText('Locked').element())).toBe('0.5')
    expect(opacity(screen.getByRole('checkbox', { name: 'Live' }).element())).toBe('1')
    expect(opacity(screen.getByText('Live').element())).toBe('1')
    expect(opacity(screen.getByRole('radio', { name: 'Radio' }).element())).toBe('0.5')
  })
})
