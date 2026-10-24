import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, type CSSProperties } from 'react'
import { expect, test } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import { publicProfileByIdQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import { renderInRouter } from '#/shared/components/testing'

import type { EditorDocument, EditorNode } from '../../model/document'
import { FIXTURES } from '../../model/fixtures'
import { BlockViewer } from '../block-viewer'
import { DocumentContent } from '../tiptap-parts'
import { useDocumentEditor } from '../use-document-editor'

const USER_ID = '0199a8d5-da4c-753b-a6c4-a08d294bbab5'
const text = (value: string, marks?: EditorNode['marks']): EditorNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
})
const link = { type: 'link', attrs: { href: 'https://example.com/a' } }

const cell = (type: string, value: string, colwidth: number[] | null = null): EditorNode => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth, align: null },
  content: [{ type: 'paragraph', content: [text(value)] }],
})
const table = (widths: (number[] | null)[]): EditorNode => ({
  type: 'table',
  content: [
    { type: 'tableRow', content: widths.map((width, index) => cell('tableHeader', `h${index}`, width)) },
    { type: 'tableRow', content: widths.map((width, index) => cell('tableCell', `c${index}`, width)) },
  ],
})

// Every fixture block plus what only ProseMirror's own rendering rules decide: kept spaces, a trailing break, an
// empty paragraph, a code block ending in a newline, one link across a bold word, nested lists, a long word. Not
// compared: the ragged fixture table (the editor squares it up on its first transaction; saved tables are square)
// and the flip card (the editor view draws its empty text content as a blank line above the card; static does not).
const EVERYTHING: EditorDocument = {
  type: 'doc',
  content: [
    ...Object.entries(FIXTURES)
      .filter(([name]) => name !== 'table' && name !== 'flipcard')
      .flatMap(([, fixture]) => fixture.content),
    table([null, null, null]),
    table([[120], [200]]),
    { type: 'paragraph', content: [text('two  spaces and a break'), { type: 'hardBreak' }] },
    { type: 'paragraph' },
    { type: 'codeBlock', attrs: { language: 'python' }, content: [text('print(1)\n')] },
    { type: 'paragraph', content: [text('a ', [link]), text('bold', [{ type: 'bold' }, link]), text(' link', [link])] },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [text('x')] }, FIXTURES['lists']?.content[1] ?? {}],
        },
      ],
    },
    { type: 'heading', attrs: { level: 4, id: 'h4' }, content: [text('Четвёртый уровень')] },
    { type: 'paragraph', content: [text('Ұзақ'.repeat(40))] },
  ],
}

function TiptapView({ doc }: { doc: EditorDocument }) {
  const editor = useDocumentEditor({ preset: 'view', content: doc })
  return editor ? <DocumentContent editor={editor} /> : null
}

const MEASURED = 'p,h1,h2,h3,h4,li,ul,ol,pre,table,th,td,hr,blockquote,img,iframe,video,button,a,strong,em,s,u,code,svg'

/** Every content element's box relative to its document root: the two renderings must match to the pixel. */
function layout(root: Element | null) {
  if (!root) return null
  const origin = root.getBoundingClientRect()
  // Hidden parts (a failed video's controls) have no box to compare.
  return [root, ...root.querySelectorAll(MEASURED)]
    .filter(element => element.getClientRects().length > 0)
    .map(element => {
      const box = element.getBoundingClientRect()
      return `${element === root ? 'ARTICLE' : element.tagName} ${Math.round(box.x - origin.x)},${Math.round(box.y - origin.y)} ${Math.round(box.width)}x${Math.round(box.height)}`
    })
}

const root = (id: string) => document.querySelector(`[data-testid=${id}] article, [data-testid=${id}] [role=article]`)

test.each([720, 358])(
  'B-EDT-34 a stored document reads without the editor, laid out exactly as the editor view draws it (%i px)',
  { timeout: 90_000 },
  async width => {
    // Both lazy media columns must be visible; compare their original content widths.
    await page.viewport(width * 2 + 40, 2400)
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    client.setQueryData(publicProfileByIdQueryKey({ path: { user_id: USER_ID } }), {
      id: USER_ID,
      username: 'aigerim',
      display_name: 'Айгерим Сапарова',
      bio: '',
      profile: { sections: [] },
    })
    await renderInRouter(
      <QueryClientProvider client={client}>
        <Suspense>
          <div className="flex gap-4">
            <div
              data-testid="static"
              style={{ '--viewer-width': `${width}px` } as CSSProperties & { '--viewer-width': string }}
              className="w-(--viewer-width) shrink-0"
            >
              <BlockViewer content={EVERYTHING} />
            </div>
            <div
              data-testid="editor"
              style={{ '--viewer-width': `${width}px` } as CSSProperties & { '--viewer-width': string }}
              className="w-(--viewer-width) shrink-0"
            >
              <TiptapView doc={EVERYTHING} />
            </div>
          </div>
        </Suspense>
      </QueryClientProvider>,
    )
    // KaTeX, shiki and the user card arrive on their own time in both.
    await expect.poll(() => document.querySelectorAll('.katex').length, { timeout: 45_000 }).toBe(2)
    await document.fonts.ready
    await expect.poll(() => [...document.querySelectorAll('img')].every(image => image.complete)).toBe(true)
    await expect
      .poll(() =>
        [...document.querySelectorAll('video')].every(
          video => video.error !== null || video.readyState >= HTMLMediaElement.HAVE_METADATA,
        ),
      )
      .toBe(true)
    // Re-read both sides each poll; a frozen expected box can predate a font or media event.
    await expect
      .poll(
        () => {
          const viewer = layout(root('static'))
          const editor = layout(root('editor'))
          return (
            viewer !== null &&
            editor !== null &&
            viewer.length === editor.length &&
            viewer.every((box, index) => box === editor[index])
          )
        },
        { timeout: 25_000 },
      )
      .toBe(true)
    expect(layout(root('static'))).toEqual(layout(root('editor')))
    expect(root('static')?.querySelector('[contenteditable=true], .ProseMirror')).toBeNull()
    expect(root('static')?.textContent).toBe(root('editor')?.textContent)
  },
)
