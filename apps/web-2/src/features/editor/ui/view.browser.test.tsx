import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Editor } from '@tiptap/core'
import * as fc from 'fast-check'
import { Suspense, type ReactNode } from 'react'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { publicProfileByIdQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import { renderInRouter } from '#/shared/ui/testing'

import { BlockViewer } from '../index'
import type { EditorDocument } from '../model/document'
import { FIXTURES, LEGACY_EMBED } from '../model/fixtures'
import { findLosses } from '../model/round-trip'
import { presetExtensions } from './extensions'

const USER_ID = '0199a8d5-da4c-753b-a6c4-a08d294bbab5'

function render(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(publicProfileByIdQueryKey({ path: { user_id: USER_ID } }), {
    id: USER_ID,
    username: 'aigerim',
    display_name: 'Айгерим Сапарова',
    bio: '',
    profile: { sections: [] },
  })
  return renderInRouter(
    <QueryClientProvider client={client}>
      <Suspense>{ui}</Suspense>
    </QueryClientProvider>,
  )
}

const doc = (...names: string[]): EditorDocument => ({
  type: 'doc',
  content: names.flatMap(name => FIXTURES[name]?.content ?? []),
})

describe('B-EDT-01 the real editor keeps every node', () => {
  test('B-EDT-01 each old fixture loads into the view editor and comes back without losses', () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      const editor = new Editor({ extensions: presetExtensions('view'), content: fixture })
      expect({ name, losses: findLosses(fixture, editor.getJSON()) }).toEqual({ name, losses: [] })
      editor.destroy()
    }
  })

  test('B-EDT-01 embedBlock survives the HTML form (copy and paste) with every attribute (property)', () => {
    const editor = new Editor({ extensions: presetExtensions('view') })
    fc.assert(
      fc.property(
        fc.constantFrom('youtube', 'excalidraw', 'google-docs', 'url'),
        fc.webUrl(),
        fc.constantFrom('100%', '91%', '60%'),
        fc.integer({ min: 200, max: 1200 }),
        (type, url, width, height) => {
          const embed: EditorDocument = {
            type: 'doc',
            content: [{ type: 'embedBlock', attrs: { type, url, width, height } }],
          }
          editor.commands.setContent(embed)
          const html = editor.getHTML()
          editor.commands.setContent(html)
          expect(editor.getJSON().content?.[0]).toEqual(embed.content[0])
        },
      ),
      { numRuns: 50 },
    )
    editor.destroy()
  })
})

describe('B-EDT-09 view preset', () => {
  test('B-EDT-09 renders callouts, badge, button, table, code and image with their tokens', async () => {
    const screen = await render(
      <BlockViewer content={doc('calloutInfo', 'calloutWarning', 'badge', 'button', 'table', 'image')} />,
    )
    await expect
      .element(screen.getByRole('note', { name: m.editor_callout_info() }))
      .toHaveTextContent('Remember this.')
    await expect.element(screen.getByRole('note', { name: m.editor_callout_warning() })).toBeVisible()
    await expect.element(screen.getByText('Key idea')).toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: 'Visit site' }))
      .toHaveAttribute('href', 'https://example.com')
    await expect.element(screen.getByRole('table')).toBeVisible()
    await expect.element(screen.getByRole('img', { name: m.editor_image_alt() })).toHaveAttribute('width', '420')
    await expect.element(screen.getByRole('textbox')).not.toBeInTheDocument()
  })

  test('B-EDT-09 a flip card turns over and back', async () => {
    const screen = await render(<BlockViewer content={doc('flipcard')} />)
    await expect.element(screen.getByText('What is photosynthesis?')).toBeVisible()
    await screen.getByRole('button', { name: m.editor_flipcard_show_answer() }).click()
    await expect.element(screen.getByText('Energy from light.')).toBeVisible()
    await screen.getByRole('button', { name: m.editor_flipcard_show_question() }).click()
    await expect.element(screen.getByText('What is photosynthesis?')).toBeVisible()
  })

  test('B-EDT-09 a scenario follows the chosen option and can restart', async () => {
    const screen = await render(<BlockViewer content={doc('scenarios')} />)
    await expect.element(screen.getByText('Choose a path')).toBeVisible()
    await screen.getByRole('button', { name: 'Continue' }).click()
    await expect.element(screen.getByText('The end')).toBeVisible()
    await screen.getByRole('button', { name: m.editor_scenario_restart() }).click()
    await expect.element(screen.getByText('Choose a path')).toBeVisible()
  })

  test('B-EDT-02 B-EDT-03 a legacy blockEmbed and a youtube embed render as sandboxed iframes', async () => {
    const youtube = { type: 'embedBlock', attrs: { type: 'youtube', url: 'dQw4w9WgXcQ', width: '100%', height: 420 } }
    const screen = await render(<BlockViewer content={{ type: 'doc', content: [LEGACY_EMBED, youtube] }} />)
    const frames = screen.getByTitle(m.editor_embed_title())
    await expect.element(frames.first()).toHaveAttribute('src', 'https://docs.google.com/document/d/1C0g/preview')
    await expect.element(frames.first()).toHaveAttribute('height', '667')
    await expect
      .element(frames.nth(1))
      .toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0')
    await expect.element(frames.nth(1)).toHaveAttribute('sandbox')
  })

  test('B-EDT-08 an embed with a non-https address is not loaded', async () => {
    const unsafe = {
      type: 'embedBlock',
      attrs: { type: 'url', url: 'javascript:alert(1)', width: '100%', height: 300 },
    }
    const screen = await render(<BlockViewer content={{ type: 'doc', content: [unsafe] }} />)
    await expect.element(screen.getByText(m.editor_embed_unsafe())).toBeVisible()
    await expect.element(screen.getByTitle(m.editor_embed_title())).not.toBeInTheDocument()
  })

  test('B-EDT-04 B-EDT-13 code is highlighted by shiki and formulas by KaTeX', async () => {
    const screen = await render(<BlockViewer content={doc('codeBlock', 'math')} />)
    await expect.poll(() => document.querySelector('pre span[style*="--shiki-light"]')).not.toBeNull()
    await expect.poll(() => document.querySelector('.katex')).not.toBeNull()
    await expect.element(screen.getByText(m.editor_math_invalid())).not.toBeInTheDocument()
  })

  test('B-EDT-15 a user block shows the public profile card', async () => {
    const screen = await render(<BlockViewer content={doc('user', 'webPreview')} />)
    await expect.element(screen.getByText('Айгерим Сапарова')).toBeVisible()
    await expect.element(screen.getByText('@aigerim')).toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: 'Example', exact: true }))
      .toHaveAttribute('href', 'https://example.com')
  })
})
