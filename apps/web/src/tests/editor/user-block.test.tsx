/** @vitest-environment jsdom */
/**
 * Restore C1: a user block stores `attrs.user_id`. It resolves the public card
 * by id (any reader of the page may call it), and a failed lookup never clears
 * the stored link — the studio save would otherwise drop it.
 */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'

const apiJson = vi.fn()
const byId = vi.fn()
vi.mock('@/lib/api-client', () => ({ apiJson: (...args: unknown[]) => apiJson(...args) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@components/Contexts/Editor/EditorContext', () => ({ useEditorProvider: () => ({ isEditable: true }) }))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/users/hooks/useUsers', () => ({
  useUserByIdQuery: () => byId(),
  useUserByUsernameQuery: () => ({ data: undefined, error: null, isFetching: false }),
}))

import { getUserById } from '@/lib/users/client'
import UserBlockComponent from '@components/Objects/Editor/Extensions/Users/UserBlockComponent'

const userId = '0199a8d5-da4c-753e-9a55-3c1b2c4d5e6f'

function renderBlock() {
  const updateAttributes = vi.fn()
  const props = { node: { attrs: { user_id: userId } }, updateAttributes } as unknown as Parameters<
    typeof UserBlockComponent
  >[0]
  render(<UserBlockComponent {...props} />)
  return updateAttributes
}

beforeEach(() => vi.clearAllMocks())

describe('user block', () => {
  it('resolves the card through GET /users/by-id/{id}', async () => {
    apiJson.mockResolvedValue({ id: userId, username: 'meirbek', display_name: 'Meirbek', avatar_key: null })
    const user = await getUserById(userId)
    expect(apiJson).toHaveBeenCalledWith(`users/by-id/${userId}`)
    expect(user).toMatchObject({ id: userId, username: 'meirbek', display_name: 'Meirbek' })
  })

  it('keeps user_id when the lookup fails', async () => {
    byId.mockReturnValue({ data: undefined, error: new Error('404'), isFetching: false })
    const updateAttributes = renderBlock()
    await waitFor(() => expect(screen.getByText('errorNotFound')).toBeInTheDocument())
    expect(updateAttributes).not.toHaveBeenCalled()
  })

  it('keeps user_id while the lookup is loading and renders the card once it resolves', async () => {
    byId.mockReturnValue({ data: undefined, error: null, isFetching: true })
    const updateAttributes = renderBlock()
    expect(updateAttributes).not.toHaveBeenCalled()

    byId.mockReturnValue({
      data: {
        id: userId,
        username: 'meirbek',
        display_name: 'Meirbek',
        first_name: 'Meirbek',
        last_name: '',
        bio: '',
        details: {},
        profile: {},
      },
      error: null,
      isFetching: false,
    })
    renderBlock()
    await waitFor(() => expect(screen.getAllByText(/Meirbek/).length).toBeGreaterThan(0))
    expect(updateAttributes).not.toHaveBeenCalled()
  })
})
