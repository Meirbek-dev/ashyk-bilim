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
beforeAll(() => Promise.all([import('./block-editor'), import('katex')]), 120_000)

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
    // The old editor's six heading levels.
    await screen.getByRole('button', { name: m.editor_text_style() }).click()
    await screen.getByRole('menuitemradio', { name: m.editor_heading({ level: 6 }) }).click()
    await expect.poll(() => find(last(onChange), 'heading')?.attrs?.['level']).toBe(6)
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
    // The new block's field takes the focus: the author types the formula right away.
    await expect.element(screen.getByLabelText(m.editor_field_latex())).toHaveFocus()
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
    await expect.element(screen.getByLabelText(m.editor_field_url())).toHaveFocus()
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

test('B-EDT-23 an embed of this site is refused in the dialog; a button link is stored with https', async () => {
  const onChange = vi.fn<(doc: EditorDocument) => void>()
  const screen = await render(<BlockEditor activityId={ACTIVITY} content={null} onChange={onChange} />)
  await insert(screen, m.editor_block_embed())
  await screen.getByLabelText(m.editor_field_url()).fill(new URL('/content/page.html', document.baseURI).href)
  await screen.getByRole('button', { name: m.editor_apply() }).click()
  await expect.element(screen.getByText(m.editor_embed_own_origin())).toBeVisible()
  await insert(screen, m.editor_block_button())
  await screen.getByRole('textbox', { name: m.editor_field_link() }).fill('example.com/page')
  await screen.getByRole('button', { name: m.editor_apply() }).last().click()
  await expect.poll(() => find(last(onChange), 'button')?.attrs?.['link']).toBe('https://example.com/page')
})

const cell = (text: string) => ({
  type: 'tableCell',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

test('B-EDT-25 the code block under the cursor takes a language; the table under it takes rows and columns', async () => {
  const onChange = vi.fn<(doc: EditorDocument) => void>()
  const content = {
    type: 'doc',
    content: [
      { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'print(1)' }] },
      { type: 'table', content: [{ type: 'tableRow', content: [cell('a'), cell('b')] }] },
    ],
  }
  const screen = await render(<BlockEditor activityId={ACTIVITY} content={content} onChange={onChange} />)
  await expect.element(screen.getByRole('button', { name: m.editor_code_language() })).not.toBeInTheDocument()
  await screen.getByText('print(1)').click()
  await screen.getByRole('button', { name: m.editor_code_language() }).click()
  await screen.getByRole('menuitemradio', { name: 'Python' }).click()
  await expect.poll(() => find(last(onChange), 'codeBlock')?.attrs?.['language']).toBe('python')
  await screen.getByText('a', { exact: true }).click()
  await screen.getByRole('button', { name: m.editor_table() }).click()
  await screen.getByRole('menuitem', { name: m.editor_table_row_after() }).click()
  await expect.poll(() => find(last(onChange), 'table')?.content?.length).toBe(2)
})

test('B-EDT-27 a user block takes a person picked by name, not a typed id', async () => {
  const id = '0199a8d5-da4c-753b-a6c4-a08d294bbab6'
  const hit = { id, username: 'aigerim', display_name: 'Айгерим Сапарова', avatar_key: null }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname
      if (path.endsWith('/search'))
        return Response.json({ users: [hit], courses: [], collections: [], next_cursor: null })
      if (path.endsWith(`/users/by-id/${id}`)) return Response.json({ ...hit, bio: '', profile: { sections: [] } })
      return new Response(null, { status: 404 })
    }),
  )
  const onChange = vi.fn<(doc: EditorDocument) => void>()
  const content = { type: 'doc', content: [{ type: 'blockUser', attrs: { user_id: '' } }] }
  const screen = await render(<BlockEditor activityId={ACTIVITY} content={content} onChange={onChange} />)
  await screen.getByRole('combobox', { name: m.editor_field_user() }).click()
  await screen.getByRole('option', { name: /Айгерим Сапарова/ }).click()
  await expect.poll(() => find(last(onChange), 'blockUser')?.attrs?.['user_id']).toBe(id)
  vi.unstubAllGlobals()
})

test('B-EDT-28 an embed takes a height; a link card takes alignment and a button with its text', async () => {
  const onChange = vi.fn<(doc: EditorDocument) => void>()
  const preview = { type: 'blockWebPreview', attrs: { url: 'https://example.com/', title: 'Example' } }
  const embed = { type: 'embedBlock', attrs: { url: '' } }
  const content = { type: 'doc', content: [embed, preview, { type: 'paragraph' }] }
  const screen = await render(<BlockEditor activityId={ACTIVITY} content={content} onChange={onChange} />)
  await screen.getByLabelText(m.editor_field_url()).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await screen.getByLabelText(m.editor_field_height()).fill('50')
  await screen.getByRole('button', { name: m.editor_apply() }).click()
  await expect.element(screen.getByText(m.editor_height_range())).toBeVisible()
  await screen.getByLabelText(m.editor_field_height()).fill('720')
  await screen.getByRole('button', { name: m.editor_apply() }).click()
  await expect.poll(() => find(last(onChange), 'embedBlock')?.attrs?.['height']).toBe(720)
  await screen.getByText('example.com').click()
  await screen.getByLabelText(m.editor_align()).selectOptions(m.editor_align_center())
  await screen.getByRole('checkbox', { name: m.editor_preview_show_button() }).click()
  await screen.getByLabelText(m.editor_preview_button_label()).fill('Читать')
  const card = () => find(last(onChange), 'blockWebPreview')?.attrs
  await expect.poll(() => card()).toMatchObject({ alignment: 'center', showButton: true, buttonLabel: 'Читать' })
})

test('B-EDT-29 a formula template replaces the formula and fills the field', async () => {
  const onChange = vi.fn<(doc: EditorDocument) => void>()
  const screen = await render(<BlockEditor activityId={ACTIVITY} content={null} onChange={onChange} />)
  await insert(screen, m.editor_block_math())
  // The insert menu focuses the formula field once its close animation ends; focus moving later closes the templates.
  await expect.element(screen.getByLabelText(m.editor_field_latex())).toHaveFocus()
  await screen.getByRole('button', { name: m.editor_math_templates() }).click()
  await screen.getByRole('menuitem', { name: m.editor_math_binomial() }).click()
  const binomial = String.raw`\binom{n}{k}`
  await expect.poll(() => find(last(onChange), 'blockMathEquation')?.attrs?.['math_equation']).toBe(binomial)
  await expect.element(screen.getByLabelText(m.editor_field_latex())).toHaveValue(binomial)
})
