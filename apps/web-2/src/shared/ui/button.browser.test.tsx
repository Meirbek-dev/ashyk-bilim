import { describe, expect, test } from 'vite-plus/test'

import { Button } from './button'
import { renderInRouter } from './testing'

const TRANSPARENT = 'rgba(0, 0, 0, 0)'
const variants = ['primary', 'secondary', 'outline', 'ghost', 'destructive'] as const

describe('Button', () => {
  test('outline and destructive draw their border; filled and ghost variants keep it transparent', async () => {
    const screen = await renderInRouter(
      <>
        {variants.map(variant => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </>,
    )
    const border = async (variant: string) => {
      const button = screen.getByRole('button', { name: variant })
      await expect.element(button).toBeVisible()
      return getComputedStyle(button.element()).borderTopColor
    }
    expect(await border('outline')).not.toBe(TRANSPARENT)
    expect(await border('destructive')).not.toBe(TRANSPARENT)
    for (const variant of ['primary', 'secondary', 'ghost']) expect(await border(variant)).toBe(TRANSPARENT)
  })
})
