import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { beforeAll, describe, expect, test, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import type { EditorDocument } from '../model/document'
import { BlockEditor } from '../index'

const ACTIVITY = 'activity_0190a5d2'
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** A lesson page wide enough for the block handle beside the text column, under a 56 px bar like every page. */
async function edit(content: unknown) {
  await page.viewport(1200, 900)
  const onChange = vi.fn<(doc: EditorDocument) => void>()
  const screen = await renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <div className="pt-14">
        <Suspense>
          <BlockEditor activityId={ACTIVITY} content={content} onChange={onChange} />
        </Suspense>
      </div>
    </QueryClientProvider>,
  )
  await expect.element(screen.getByRole('textbox', { name: m.editor_label() })).toBeVisible()
  const saved = () => (onChange.mock.lastCall?.[0]?.content ?? []).map(node => node.type)
  const texts = () =>
    (onChange.mock.lastCall?.[0]?.content ?? []).map(node => (node.content ?? []).map(child => child.text).join(''))
  return { screen, saved, texts }
}

const page3 = { type: 'doc', content: [paragraph('one'), paragraph('two'), paragraph('three')] }

beforeAll(() => import('./block-editor'), 120_000)

describe('editing', () => {
  test('B-EDT-36 the handle beside a block moves it from its menu and adds a block below it', async () => {
    const { screen, texts, saved } = await edit(page3)
    await userEvent.hover(screen.getByText('two', { exact: true }))
    await screen.getByRole('button', { name: m.editor_block_actions() }).click()
    await screen.getByRole('menuitem', { name: m.editor_block_move_down() }).click()
    await expect.poll(texts).toEqual(['one', 'three', 'two'])
    await userEvent.hover(screen.getByText('one', { exact: true }))
    await screen.getByRole('button', { name: m.editor_block_add() }).click()
    await screen.getByRole('option', { name: m.editor_heading({ level: 2 }) }).click()
    await expect.poll(saved).toEqual(['paragraph', 'heading', 'paragraph', 'paragraph'])
  })

  test('B-EDT-36 a block dragged by its grip lands where it is dropped', async () => {
    const { screen, texts } = await edit(page3)
    await userEvent.hover(screen.getByText('three', { exact: true }))
    // The drag events a browser sends, onto the start of «one» (a pointer drag from the gutter crosses other blocks).
    const grip = screen.getByRole('button', { name: m.editor_block_actions() }).element()
    const target = screen.getByText('one', { exact: true }).element().getBoundingClientRect()
    const at = { clientX: target.left + 1, clientY: target.top + 2, bubbles: true, cancelable: true }
    const dataTransfer = new DataTransfer()
    grip.dispatchEvent(new DragEvent('dragstart', { ...at, dataTransfer }))
    const drop = document.elementFromPoint(at.clientX, at.clientY)
    drop?.dispatchEvent(new DragEvent('dragover', { ...at, dataTransfer }))
    drop?.dispatchEvent(new DragEvent('drop', { ...at, dataTransfer }))
    await expect.poll(texts).toEqual(['three', 'one', 'two'])
  })

  test('B-EDT-36 Ctrl+Shift+arrows move the block under the caret; the block menu duplicates', async () => {
    const { screen, texts } = await edit(page3)
    await screen.getByText('one', { exact: true }).click()
    await userEvent.keyboard('{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}')
    await expect.poll(texts).toEqual(['two', 'one', 'three'])
    await userEvent.hover(screen.getByText('three', { exact: true }))
    await screen.getByRole('button', { name: m.editor_block_actions() }).click()
    await screen.getByRole('menuitem', { name: m.editor_block_duplicate() }).click()
    await expect.poll(texts).toEqual(['two', 'one', 'three', 'three'])
  })

  test('B-EDT-37 B-EDT-39 Ctrl+K opens the link dialog; a link under the caret offers edit and remove', async () => {
    const link = { type: 'link', attrs: { href: 'https://example.com' } }
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'docs', marks: [link] }] }],
    }
    const { screen, saved } = await edit(content)
    await screen.getByText('docs').click()
    await expect.element(screen.getByRole('link', { name: 'https://example.com' })).toBeVisible()
    await userEvent.keyboard('{Control>}k{/Control}')
    await expect.element(screen.getByRole('dialog', { name: m.editor_link() })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await screen.getByRole('button', { name: m.editor_link_remove() }).click()
    await expect.poll(() => saved().length).toBe(1)
    await expect.element(screen.getByRole('link', { name: 'https://example.com' })).not.toBeInTheDocument()
  })

  test('B-EDT-38 B-EDT-40 the status bar counts the words; an empty heading says which one it is', async () => {
    const { screen } = await edit({
      type: 'doc',
      content: [paragraph('Intro'), { type: 'heading', attrs: { level: 2 } }],
    })
    await screen.getByText('Intro').click()
    await userEvent.keyboard('{ArrowDown}')
    await expect
      .poll(() => document.querySelector('.ProseMirror h2')?.getAttribute('data-placeholder'))
      .toBe(m.editor_heading({ level: 2 }))
    await userEvent.keyboard('Переменные в Python')
    await expect.element(screen.getByText(m.editor_words({ count: 4 }), { exact: false })).toBeVisible()
  })
})
