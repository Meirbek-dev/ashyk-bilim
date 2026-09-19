/** @vitest-environment jsdom */
// UX-124: collections could never be deleted from the UI — the card gated on
// `can_delete`, which the v2 schema did not carry. Now the server derives it and
// the card confirms, deletes through the client fetcher, toasts and drops the list.
import { describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import CollectionThumbnail from '@components/Objects/Thumbnails/CollectionThumbnail'
import { deleteCollection } from '@/lib/api/generated/collections/collections'
import { toAppCollection } from '@/hooks/courses/courseKeys'
import type { Collection } from '@/lib/api/generated/zod'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/i18n/navigation', () => ({ Link: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/lib/api/generated/collections/collections', () => ({ deleteCollection: vi.fn(async () => undefined) }))
vi.mock('@/lib/cache/revalidate', () => ({ revalidateTags: vi.fn(async () => undefined) }))
vi.mock('@services/media/media', () => ({ getCourseThumbnailMediaDirectory: () => '' }))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (p: string) => p, getSiteUrl: () => '' }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const id = '01a0910d-2963-7483-a97d-40dc56e9aa20'
const wire = (can_delete: boolean): Collection =>
  ({ id, name: 'Подборка', description: '', public: true, creator_id: null, courses: [], can_delete, created_at_unix: 0, updated_at_unix: 0 }) as Collection

function renderCard(can_delete: boolean) {
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <CollectionThumbnail collection={toAppCollection(wire(can_delete))} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
  return queryClient
}

describe('CollectionThumbnail delete (UX-124)', () => {
  it('maps can_delete from the wire and hides the control without it', () => {
    expect(toAppCollection(wire(true)).can_delete).toBe(true)
    renderCard(false)
    expect(screen.queryByRole('button', { name: 'Удалить Подборка?' })).not.toBeInTheDocument()
  })

  it('confirms, deletes through the client fetcher, toasts and invalidates the list', async () => {
    const queryClient = renderCard(true)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: 'Удалить Подборка?' }))
    await screen.findByRole('alertdialog')
    expect(deleteCollection).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Удалить коллекцию' }))
    await waitFor(() => expect(deleteCollection).toHaveBeenCalledWith(id))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Коллекция «Подборка» удалена.'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['collections', 'list'] })
  })
})
