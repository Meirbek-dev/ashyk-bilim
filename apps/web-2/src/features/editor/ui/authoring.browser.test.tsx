import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, type ReactNode } from 'react'
import { beforeAll, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import type { EditorDocument, EditorNode } from '../model/document'
import { LEGACY_EMBED } from '../model/fixtures'
import { BlockEditor, DiscussionEditor } from '../index'

const render = (ui: ReactNode) =>
  renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <Suspense>{ui}</Suspense>
    </QueryClientProvider>,
  )
const ACTIVITY = 'activity_0190a5d2'
const LEGACY_POST = '<p>21</p><img src="x" onerror="window.pwned=1"><script>window.pwned=1</script>'
const types = (node: EditorNode): string[] => [node.type ?? '', ...(node.content ?? []).flatMap(types)]
const last = (spy: { mock: { lastCall?: [EditorDocument] | undefined } }) => spy.mock.lastCall?.[0]
const find = (node: EditorNode | undefined, type: string): EditorNode | undefined =>
  node?.type === type ? node : (node?.content ?? []).map(child => find(child, type)).find(Boolean)

async function insert(screen: Awaited<ReturnType<typeof render>>, block: string) {
  await screen.getByRole('button', { name: m.editor_insert() }).click()
  await screen.getByRole('option', { name: block }).click()
}

// The lazy editor chunk (Tiptap, shiki, KaTeX) compiles on first import: warm it outside the 15 s test timeout.
beforeAll(() => import('./block-editor'), 120_000)

describe('authoring', () => {
  test('B-EDT-11 typing and Bold change the document; the button shows the applied format', async () => {
    const onChange = vi.fn<(doc: EditorDocument) => void>()
    const screen = await render(<BlockEditor activityId={ACTIVITY} content={null} onChange={onChange} />)
    await screen.getByRole('textbox', { name: m.editor_label() }).click()
    await userEvent.keyboard('Hello')
    await userEvent.keyboard('{Control>}a{/Control}')
    await screen.getByRole('button', { name: m.editor_bold() }).click()
    await expect.element(screen.getByRole('button', { name: m.editor_bold() })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.stringify(last(onChange))).toContain('{"type":"text","marks":[{"type":"bold"}],"text":"Hello"}')
  })

  test('B-EDT-16 a legacy document is saved canonical: embedBlock, never blockEmbed', async () => {
    const onChange = vi.fn<(doc: EditorDocument) => void>()
    const content = { type: 'doc', content: [LEGACY_EMBED, { type: 'paragraph' }] }
    const screen = await render(<BlockEditor activityId={ACTIVITY} content={content} onChange={onChange} />)
    await expect.element(screen.getByTitle(m.editor_embed_title())).toBeVisible()
    const paragraph = document.querySelector('.ProseMirror > p')
    if (paragraph) await userEvent.click(paragraph)
    await userEvent.keyboard('Hi')
    const saved = last(onChange)
    expect(saved?.content.flatMap(types)).toContain('embedBlock')
    expect(saved?.content.flatMap(types)).not.toContain('blockEmbed')
  })

  test('B-EDT-10 B-EDT-13 the Insert menu adds a formula; LaTeX renders, an error is shown, not thrown', async () => {
    const onChange = vi.fn<(doc: EditorDocument) => void>()
    const screen = await render(<BlockEditor activityId={ACTIVITY} content={null} onChange={onChange} />)
    await insert(screen, m.editor_block_math())
    await screen.getByLabelText(m.editor_field_latex()).fill('\\frac{')
    await screen.getByRole('button', { name: m.editor_apply() }).click()
    await expect.element(screen.getByText(m.editor_math_invalid())).toBeVisible()
    await screen.getByLabelText(m.editor_field_latex()).fill('\\frac{a}{b}')
    await screen.getByRole('button', { name: m.editor_apply() }).click()
    await expect.element(screen.getByText(m.editor_math_invalid())).not.toBeInTheDocument()
    await expect.poll(() => document.querySelector('.katex') !== null).toBe(true)
    expect(find(last(onChange), 'blockMathEquation')?.attrs?.['math_equation']).toBe('\\frac{a}{b}')
  })

  test('B-EDT-12 an embed takes an https URL and detects its provider', async () => {
    const onChange = vi.fn<(doc: EditorDocument) => void>()
    const screen = await render(<BlockEditor activityId={ACTIVITY} content={null} onChange={onChange} />)
    await insert(screen, m.editor_block_embed())
    await screen.getByLabelText(m.editor_field_url()).fill('javascript:alert(1)')
    await screen.getByRole('button', { name: m.editor_apply() }).click()
    await expect.element(screen.getByText(m.validation_invalid())).toBeVisible()
    await screen.getByLabelText(m.editor_field_url()).fill('https://youtu.be/dQw4w9WgXcQ')
    await screen.getByRole('button', { name: m.editor_apply() }).click()
    await expect
      .element(screen.getByTitle(m.editor_embed_title()))
      .toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0')
    expect(find(last(onChange), 'embedBlock')?.attrs).toMatchObject({
      type: 'youtube',
      url: 'https://youtu.be/dQw4w9WgXcQ',
    })
  })

  test('B-EDT-14 a legacy HTML post is sanitized and edited as rich text, without the block menu', async () => {
    const onChange = vi.fn<(doc: EditorDocument) => void>()
    const screen = await render(
      <DiscussionEditor content={LEGACY_POST} onChange={onChange} onImage={() => undefined} />,
    )
    await expect.element(screen.getByText('21')).toBeVisible()
    expect(document.querySelector('.ProseMirror [onerror], .ProseMirror script')).toBeNull()
    await expect.element(screen.getByRole('button', { name: m.editor_insert() })).not.toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: m.editor_bold() })).toBeVisible()
  })
})

describe('the "/" menu', () => {
  test('B-EDT-10 "/" in an empty line opens the block menu at the caret; search and Enter insert', async () => {
    const onChange = vi.fn<(doc: EditorDocument) => void>()
    const screen = await render(<BlockEditor activityId={ACTIVITY} content={null} onChange={onChange} />)
    await screen.getByRole('textbox', { name: m.editor_label() }).click()
    await userEvent.keyboard('/')
    const search = screen.getByRole('combobox', { name: m.editor_insert() })
    await expect.element(search).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(search).not.toBeInTheDocument()
    await expect.element(screen.getByRole('textbox', { name: m.editor_label() })).toHaveFocus()
    expect(document.querySelector('.ProseMirror')?.textContent).toBe('')

    await userEvent.keyboard('/')
    await userEvent.keyboard(m.editor_block_math().slice(0, 4))
    await expect.element(screen.getByRole('option', { name: m.editor_block_divider() })).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    await expect.element(screen.getByLabelText(m.editor_field_latex())).toBeVisible()
    expect(JSON.stringify(last(onChange))).not.toContain('"text":"/"')
  })

  test('B-EDT-10 "/" inside text is typed as a character', async () => {
    const onChange = vi.fn<(doc: EditorDocument) => void>()
    const screen = await render(<BlockEditor activityId={ACTIVITY} content={null} onChange={onChange} />)
    await screen.getByRole('textbox', { name: m.editor_label() }).click()
    await userEvent.keyboard('a/b')
    await expect.element(screen.getByRole('combobox', { name: m.editor_insert() })).not.toBeInTheDocument()
    expect(JSON.stringify(last(onChange))).toContain('"text":"a/b"')
  })
})
