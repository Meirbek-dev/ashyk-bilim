import { Suspense, useState } from 'react'
import { beforeAll, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'
import { Button } from '#/shared/ui/button'

import { MarkdownView } from '../index'
import { loadLanguage } from './languages'

// The renderer chunk (the Tiptap parser) and the grammar compile on first request under the dev server: warm both.
beforeAll(() => Promise.all([loadLanguage('python'), import('./markdown-view')]), 120_000)

const FENCE = '```'
const START = `Ответ:\n\n${FENCE}python\nx = 1`
const CHUNKS = [START, `${START}\nprint(x)\n${FENCE}\n\nГотово **всё**.`]
const tokens = () => [...document.querySelectorAll('.ab-code code span[class]')]

/** An answer arriving in chunks: each press appends the next one. */
function Stream() {
  const [index, setIndex] = useState(0)
  return (
    <>
      <Button onClick={() => setIndex(index + 1)}>{m.markdown_redo()}</Button>
      <MarkdownView content={CHUNKS[index] ?? ''} live />
    </>
  )
}

test('B-MD-09 a streamed answer re-renders per chunk, its code highlighted as it grows', async () => {
  const screen = await renderInRouter(
    <Suspense>
      <Stream />
    </Suspense>,
  )
  // The renderer and grammar chunks are warm, but a full parallel suite can still delay the first render.
  await expect.poll(() => tokens().length > 0, { timeout: 15_000 }).toBe(true)
  // The open fence is already a code block: the first chunk shows code, not a stray paragraph.
  expect(document.querySelector('.ab-code code')?.textContent).toBe('x = 1')
  await screen.getByRole('button', { name: m.markdown_redo() }).click()
  await expect.element(screen.getByText('всё')).toBeVisible()
  expect(document.querySelector('.ab-code code')?.textContent).toBe('x = 1\nprint(x)')
  expect(tokens().map(token => token.textContent)).toContain('print')
})
