import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Fragment, Suspense, type CSSProperties } from 'react'
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

const cell = (type: string, value: string, colwidth: number[] | null = null, more = {}): EditorNode => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth, align: null, ...more },
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
// empty paragraph, a code block ending in a newline, one link across a bold word, nested lists, a long word, every
// mark nested in every other. Not here: the ragged fixture table (the editor squares it up on its first transaction;
// saved tables are square; a square one spans and aligns cells below) and the flip card (CARD).
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
    {
      type: 'orderedList',
      attrs: { start: 1, type: 'a' },
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('letter')] }] }],
    },
    { type: 'heading', attrs: { level: 4, id: 'h4' }, content: [text('Четвёртый уровень')] },
    {
      type: 'paragraph',
      content: [
        text('italic ', [{ type: 'italic' }]),
        text('all of them', [
          { type: 'underline' },
          { type: 'strike' },
          { type: 'italic' },
          { type: 'code' },
          { type: 'bold' },
          link,
        ]),
        text(' bold italic', [{ type: 'italic' }, { type: 'bold' }]),
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [cell('tableHeader', 'left'), cell('tableHeader', 'center'), cell('tableHeader', 'right')],
        },
        {
          type: 'tableRow',
          content: [
            cell('tableCell', 'spans two, centred', null, { colspan: 2, colwidth: null, align: 'center' }),
            cell('tableCell', 'right', null, { align: 'right' }),
          ],
        },
        {
          type: 'tableRow',
          content: [
            cell('tableCell', 'left', null, { align: 'left' }),
            cell('tableCell', 'two rows', null, { rowspan: 2 }),
            cell('tableCell', 'c'),
          ],
        },
        { type: 'tableRow', content: [cell('tableCell', 'a'), cell('tableCell', 'b')] },
      ],
    },
    // Last, a paragraph: the editor appends an empty one after any other last block (StarterKit's TrailingNode).
    { type: 'paragraph', content: [text('Ұзақ'.repeat(40))] },
  ],
}

// The flip card alone: the editor view draws its empty text content as a blank line above the card (an editor
// artifact, B-EDT-34), so the card is compared from its own box down.
const CARD: EditorDocument = FIXTURES['flipcard'] ?? { type: 'doc', content: [] }

const pixel = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="30"/%3E'
// A post (the post schema): rich text, an image and an old embed (a link, B-EDT-14).
const POST: EditorDocument = {
  type: 'doc',
  content: [
    ...['paragraph', 'marks', 'heading', 'lists', 'quoteRuleBreak', 'codeBlock'].flatMap(
      name => FIXTURES[name]?.content ?? [],
    ),
    { type: 'image', attrs: { src: pixel, alt: 'a picture', title: 'A picture', width: 120, height: 90 } },
    { type: 'image', attrs: { src: pixel, alt: null, title: null, width: null, height: null } },
    {
      type: 'embedBlock',
      attrs: { type: 'url', url: 'https://www.figma.com/file/x', width: '100%', height: 300 },
    },
    { type: 'paragraph', content: [text('after', [{ type: 'italic' }])] },
  ],
}

function TiptapView({ doc, discussion = false }: { doc: EditorDocument; discussion?: boolean }) {
  const editor = useDocumentEditor({ preset: discussion ? 'discussion-view' : 'view', content: doc })
  return editor ? <DocumentContent editor={editor} /> : null
}

const MEASURED = 'p,h1,h2,h3,h4,li,ul,ol,pre,table,th,td,hr,blockquote,img,iframe,video,button,a,strong,em,s,u,code,svg'

/** Every content element's box relative to the measured root: the two renderings must match to the pixel. */
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

// Each document through both renderers, side by side; `scope`: the element the comparison measures from.
const PAIRS = [
  { id: 'page', doc: EVERYTHING, discussion: false, scope: null },
  {
    id: 'card',
    doc: CARD,
    discussion: false,
    scope: '.node-flipcard > [data-node-view-wrapper]:not([data-node-view-content-react])',
  },
  { id: 'post', doc: POST, discussion: true, scope: null },
] as const

const root = (id: string) => document.querySelector(`[data-testid=${id}] article, [data-testid=${id}] [role=article]`)
const measured = (id: string, scope: string | null) => (scope ? (root(id)?.querySelector(scope) ?? null) : root(id))
const same = (a: string[] | null, b: string[] | null) =>
  a !== null && b !== null && a.length === b.length && a.every((box, index) => box === b[index])

test.each([720, 358])(
  'B-EDT-34 a stored document reads without the editor, laid out exactly as the editor view draws it (%i px)',
  { timeout: 90_000 },
  async width => {
    // Every column must be visible (lazy media); each keeps the original content width.
    await page.viewport(width * PAIRS.length * 2 + 120, 2400)
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
          <div
            style={{ '--viewer-width': `${width}px` } as CSSProperties & { '--viewer-width': string }}
            className="flex gap-4"
          >
            {PAIRS.map(pair => (
              <Fragment key={pair.id}>
                <div data-testid={`static-${pair.id}`} className="w-(--viewer-width) shrink-0">
                  <BlockViewer content={pair.doc} discussion={pair.discussion} />
                </div>
                <div data-testid={`editor-${pair.id}`} className="w-(--viewer-width) shrink-0">
                  <TiptapView doc={pair.doc} discussion={pair.discussion} />
                </div>
              </Fragment>
            ))}
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
    for (const { id, scope } of PAIRS) {
      // Re-read both sides each poll; a frozen expected box can predate a font or media event.
      await expect
        .poll(() => same(layout(measured(`static-${id}`, scope)), layout(measured(`editor-${id}`, scope))), {
          timeout: 25_000,
        })
        .toBe(true)
      expect(layout(measured(`static-${id}`, scope))).toEqual(layout(measured(`editor-${id}`, scope)))
      expect(root(`static-${id}`)?.querySelector('[contenteditable=true], .ProseMirror')).toBeNull()
      expect(root(`static-${id}`)?.textContent).toBe(root(`editor-${id}`)?.textContent)
    }
  },
)
