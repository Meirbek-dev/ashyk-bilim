/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { render } from '@testing-library/react'
import { THEME_SYNC_DELAY_MS, UserThemeSync } from '@/components/providers/user-theme-sync'
import { getTheme } from '@/lib/themes'

let user: { id: string; theme: string | null } | null = null
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user }) }))
let themeName = 'modern-minimal'
// Like the provider: a slug outside the registry resolves to the default.
const setTheme = vi.fn((name: string) => {
  themeName = getTheme(name).name
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
    themeName = 'shadcn-default'
    rerender(<UserThemeSync />)
    themeName = 'vintage-paper'
    rerender(<UserThemeSync />)
    expect(updateProfile).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(THEME_SYNC_DELAY_MS)
    // One write for the burst, carrying the last choice.
    expect(updateProfile).toHaveBeenCalledTimes(1)
    expect(updateProfile).toHaveBeenCalledWith({ theme: 'vintage-paper' })
  })

  it('adopts a slug outside the registry as the default without writing the fallback back (BUG-365)', async () => {
    user = { id: 'u1', theme: 'vintagePaper' }
    const { rerender } = render(<UserThemeSync />)
    expect(setTheme).toHaveBeenCalledWith('vintagePaper')
    expect(themeName).toBe('modern-minimal')
    rerender(<UserThemeSync />)
    await vi.advanceTimersByTimeAsync(THEME_SYNC_DELAY_MS * 2)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('never writes the app default for a user without a server theme, and nothing for anonymous visitors', async () => {
    user = { id: 'u1', theme: null }
    const { unmount } = render(<UserThemeSync />)
    await vi.advanceTimersByTimeAsync(THEME_SYNC_DELAY_MS * 2)
    expect(setTheme).toHaveBeenCalledWith('modern-minimal')
    expect(updateProfile).not.toHaveBeenCalled()
    unmount()

    user = null
    themeName = 'shadcn-default'
    render(<UserThemeSync />)
    await vi.advanceTimersByTimeAsync(THEME_SYNC_DELAY_MS * 2)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it("never saves the previous account's local theme onto the next one (BUG-380)", async () => {
    // A (vintage-paper) signs in, then signs out: the sign-in shell unmounts
    // and the theme stays behind in this browser.
    user = { id: 'a', theme: 'vintage-paper' }
    const first = render(<UserThemeSync />)
    first.rerender(<UserThemeSync />)
    first.unmount()
    expect(themeName).toBe('vintage-paper')

    // C has no server theme and signs in on the same browser.
    user = { id: 'c', theme: null }
    const { rerender } = render(<UserThemeSync />)
    expect(setTheme).toHaveBeenLastCalledWith('modern-minimal')
    rerender(<UserThemeSync />)
    await vi.advanceTimersByTimeAsync(THEME_SYNC_DELAY_MS * 2)
    expect(updateProfile).not.toHaveBeenCalled()

    // C's own choice is still saved.
    themeName = 'cyberpunk'
    rerender(<UserThemeSync />)
    await vi.advanceTimersByTimeAsync(THEME_SYNC_DELAY_MS)
    expect(updateProfile).toHaveBeenCalledExactlyOnceWith({ theme: 'cyberpunk' })
  })
})
