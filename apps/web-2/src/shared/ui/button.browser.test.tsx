import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { renderInRouter } from '#/shared/components/testing'
import { Button } from '#/shared/ui/button'

const label = 'Save'

async function reportedMessages(beacon: { mock: { calls: unknown[][] } }): Promise<string[]> {
  const bodies = beacon.mock.calls.map(([, body]) => (body instanceof Blob ? body.text() : Promise.resolve('')))
  return (await Promise.all(bodies)).map(text => String(JSON.parse(text || '{}').message))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Button', () => {
  test('reports a rejected click handler, which ui-sdk would only log', async () => {
    const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    const screen = await renderInRouter(
      <Button onClick={() => Promise.reject(new Error('save failed'))}>{label}</Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: label }))
    await vi.waitFor(async () => expect(await reportedMessages(beacon)).toContain('save failed'))
  })

  test('reports a click handler that throws', async () => {
    const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    const screen = await renderInRouter(
      <Button
        onClick={() => {
          throw new Error('boom')
        }}
      >
        {label}
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: label }))
    await vi.waitFor(async () => expect(await reportedMessages(beacon)).toContain('boom'))
  })
})
