/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vite-plus/test'
import { act, render } from '@testing-library/react'
import { ThemeProvider, useTheme } from '@/components/providers/theme-provider'
import { broadcastLogout } from '@/components/providers/session-provider'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({}) }))

let api: ReturnType<typeof useTheme>
function Probe() {
  api = useTheme()
  return null
}

describe('ThemeProvider sign-out (UX-318)', () => {
  it("drops the signed-out account's theme, so a later light/dark toggle keeps the default", async () => {
    globalThis.matchMedia ??= (() => ({ matches: false })) as unknown as typeof globalThis.matchMedia
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
      api.setTheme('vintage-paper')
    })
    expect(document.documentElement.dataset.theme).toBe('vintage-paper')

    broadcastLogout()
    await vi.waitFor(() => expect(api.themeName).toBe('modern-minimal'))
    act(() => api.setMode('dark'))
    expect(document.documentElement.dataset.theme).toBe('modern-minimal')
  })
})
