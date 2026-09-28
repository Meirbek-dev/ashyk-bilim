/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { render } from '@testing-library/react'
import { THEME_SYNC_DELAY_MS, UserThemeSync } from '@/components/providers/user-theme-sync'

let user: { id: string; theme: string | null } | null = null
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user }) }))
let themeName = 'modern-minimal'
const setTheme = vi.fn((name: string) => {
  themeName = name
})
vi.mock('@/components/providers/theme-provider', () => ({ useTheme: () => ({ themeName, setTheme }) }))
const updateProfile = vi.fn()
vi.mock('@/lib/users/client', () => ({ updateProfile: (...args: unknown[]) => updateProfile(...args) }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  themeName = 'modern-minimal'
  updateProfile.mockResolvedValue({})
})
afterEach(() => {
  vi.useRealTimers()
})

describe('UserThemeSync (BUG-362)', () => {
  // The mocked `useTheme` reads `themeName` at render time: after `setTheme`
  // the provider re-renders the tree, which a `rerender` stands in for here.
  it('adopts the server theme for the signed-in user without writing it back', async () => {
    user = { id: 'u1', theme: 'cyberpunk' }
    const { rerender } = render(<UserThemeSync />)
    expect(setTheme).toHaveBeenCalledWith('cyberpunk')
    rerender(<UserThemeSync />)
    await vi.advanceTimersByTimeAsync(THEME_SYNC_DELAY_MS * 2)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('persists a local change through PATCH /users/me after the debounce', async () => {
    user = { id: 'u1', theme: 'cyberpunk' }
    const { rerender } = render(<UserThemeSync />)
    rerender(<UserThemeSync />)
    themeName = 'black'
    rerender(<UserThemeSync />)
    themeName = 'vintagePaper'
    rerender(<UserThemeSync />)
    expect(updateProfile).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(THEME_SYNC_DELAY_MS)
    // One write for the burst, carrying the last choice.
    expect(updateProfile).toHaveBeenCalledTimes(1)
    expect(updateProfile).toHaveBeenCalledWith({ theme: 'vintagePaper' })
  })

  it('never writes the app default for a user without a server theme, and nothing for anonymous visitors', async () => {
    user = { id: 'u1', theme: null }
    const { unmount } = render(<UserThemeSync />)
    await vi.advanceTimersByTimeAsync(THEME_SYNC_DELAY_MS * 2)
    expect(setTheme).not.toHaveBeenCalled()
    expect(updateProfile).not.toHaveBeenCalled()
    unmount()

    user = null
    themeName = 'black'
    render(<UserThemeSync />)
    await vi.advanceTimersByTimeAsync(THEME_SYNC_DELAY_MS * 2)
    expect(updateProfile).not.toHaveBeenCalled()
  })
})
