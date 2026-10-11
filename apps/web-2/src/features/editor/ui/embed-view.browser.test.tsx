import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, type ReactNode } from 'react'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { BlockViewer } from '../index'

const render = (ui: ReactNode) =>
  renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <Suspense>{ui}</Suspense>
    </QueryClientProvider>,
  )

// The viewer and its node views load lazily (compiled on first request under a dev server): allow a cold start.
const cold = { timeout: 30_000 }

test(
  'B-EDT-24 a page embed opens in a new tab too; YouTube does not; an off-catalog page is a link only',
  { timeout: 60_000 },
  async () => {
    const form = {
      type: 'embedBlock',
      attrs: { type: 'url', url: 'https://forms.gle/abc', width: '100%', height: 500 },
    }
    const offCatalog = { type: 'embedBlock', attrs: { type: 'url', url: 'https://example.org/quiz', height: 300 } }
    const youtube = { type: 'embedBlock', attrs: { type: 'youtube', url: 'dQw4w9WgXcQ', width: '100%', height: 420 } }
    const screen = await render(<BlockViewer content={{ type: 'doc', content: [form, offCatalog, youtube] }} />)
    const links = screen.getByRole('link', { name: m.editor_embed_open() })
    await expect.element(links.first(), cold).toHaveAttribute('href', 'https://forms.gle/abc')
    await expect.element(links.nth(1)).toHaveAttribute('href', 'https://example.org/quiz')
    expect(links.all()).toHaveLength(2)
    expect(screen.getByTitle(m.editor_embed_title()).all()).toHaveLength(2)
    await expect.element(screen.getByText(m.editor_embed_unsafe())).not.toBeInTheDocument()
  },
)
