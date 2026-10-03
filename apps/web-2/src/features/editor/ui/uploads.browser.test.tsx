import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { FakeStorage, json, SLOT } from '#/shared/api/testing'
import { renderInRouter } from '#/shared/components/testing'

import type { EditorDocument, EditorNode } from '../model/document'
import { BlockEditor } from '../index'

const ACTIVITY = '0190a5d2-0000-7000-8000-0000000000a1'
const BLOCK = '0190a5d2-0000-7000-8000-0000000000b1'
const last = (spy: { mock: { lastCall?: [EditorDocument] | undefined } }) => spy.mock.lastCall?.[0]
const find = (node: EditorNode | undefined, type: string): EditorNode | undefined =>
  node?.type === type ? node : (node?.content ?? []).map(child => find(child, type)).find(Boolean)

/** The upload path (create -> PUT -> finalize) and the claim, with a held PUT to see the progress. */
function stubNetwork(claim: () => Response = () => blockResponse()) {
  const api = vi.fn<(request: Request) => Promise<Response>>(async request => {
    if (request.url.endsWith('/finalize')) return json({ id: SLOT.id, key: SLOT.key, size_bytes: 4 })
    if (request.url.endsWith(`/activities/${ACTIVITY}/blocks`)) return claim()
    return json(SLOT)
  })
  vi.stubGlobal('fetch', api)
  vi.stubGlobal('XMLHttpRequest', FakeStorage)
  const held = Promise.withResolvers<null>()
  FakeStorage.gate = held.promise
  return { api, release: () => held.resolve(null) }
}
const blockResponse = () =>
  json({
    id: BLOCK,
    activity_id: ACTIVITY,
    block_type: 'image',
    content: { file_key: SLOT.key, file_name: 'Photo.PNG', file_size: 4, file_type: 'image/png' },
    created_at_unix: 1,
  })

/** A file dropped at the top-left corner of `target` (+2 px), as the browser dispatches it. */
function dropFile(target: Element, file: File) {
  const transfer = new DataTransfer()
  transfer.items.add(file)
  const box = target.getBoundingClientRect()
  const at = { clientX: box.left + 2, clientY: box.top + 2, bubbles: true, cancelable: true }
  target.dispatchEvent(new DragEvent('drop', { ...at, dataTransfer: transfer }))
}

const forbidden = () =>
  new Response(JSON.stringify({ type: 'about:blank', title: 'Forbidden', status: 403, code: 'forbidden' }), {
    status: 403,
    headers: { 'content-type': 'application/problem+json' },
  })

async function renderEditor() {
  const onChange = vi.fn<(doc: EditorDocument) => void>()
  const screen = await renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <Suspense>
        <BlockEditor activityId={ACTIVITY} content={null} onChange={onChange} />
      </Suspense>
    </QueryClientProvider>,
  )
  const textbox = screen.getByRole('textbox', { name: m.editor_label() })
  await expect.element(textbox).toBeVisible()
  return { screen, onChange, textbox: textbox.element() }
}

// The lazy editor chunk (Tiptap, shiki, KaTeX) compiles on first import: warm it outside the 15 s test timeout.
beforeAll(() => import('./block-editor'), 120_000)

afterEach(() => {
  vi.unstubAllGlobals()
  FakeStorage.gate = Promise.resolve()
})

describe('file blocks', () => {
  test('B-EDT-17 an image block from the toolbar uploads with progress and stores the claimed key', async () => {
    const { release, api } = stubNetwork()
    const { screen, onChange } = await renderEditor()
    await screen.getByRole('button', { name: m.editor_insert() }).click()
    await screen.getByRole('option', { name: m.editor_block_image() }).click()
    await userEvent.upload(
      screen.getByLabelText(m.editor_block_image()),
      new File(['abcd'], 'Photo.PNG', { type: 'image/png' }),
    )
    await expect.element(screen.getByRole('progressbar', { name: m.ui_file_uploading() })).toBeVisible()
    expect(find(last(onChange), 'blockImage')).toBeUndefined()
    release()

    await expect
      .element(screen.getByRole('img', { name: m.editor_image_alt() }))
      .toHaveAttribute('src', `/content/${SLOT.key}`)
    const claim = api.mock.calls.map(([request]) => request).find(request => request.url.endsWith('/blocks'))
    expect(await claim?.json()).toEqual({ block_type: 'image', upload_id: SLOT.id, file_name: 'Photo.PNG' })
    expect(find(last(onChange), 'blockImage')?.attrs?.['blockObject']).toEqual({
      block_uuid: BLOCK,
      content: { file_id: SLOT.id, file_key: SLOT.key, file_format: 'png', file_name: 'Photo.PNG' },
    })
  })

  test('B-EDT-17 a refused claim shows its error inside the block', async () => {
    const { release } = stubNetwork(forbidden)
    const { screen, onChange } = await renderEditor()
    await screen.getByRole('button', { name: m.editor_insert() }).click()
    await screen.getByRole('option', { name: m.editor_block_video() }).click()
    release()
    await userEvent.upload(
      screen.getByLabelText(m.editor_block_video()),
      new File(['abcd'], 'intro.mp4', { type: 'video/mp4' }),
    )
    await expect.element(screen.getByText(m.errors_forbidden())).toBeVisible()
    expect(find(last(onChange), 'blockVideo')).toBeUndefined()
  })
})

describe('paste and drop', () => {
  test('B-EDT-18 a pasted image becomes an image block that uploads in place', async () => {
    const { release } = stubNetwork()
    const { screen, textbox } = await renderEditor()
    await userEvent.click(textbox)
    const clipboard = new DataTransfer()
    clipboard.items.add(new File(['png'], 'shot.png', { type: 'image/png' }))
    textbox.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }))

    await expect.element(screen.getByRole('progressbar', { name: m.ui_file_uploading() })).toBeVisible()
    release()
    await expect
      .element(screen.getByRole('img', { name: m.editor_image_alt() }))
      .toHaveAttribute('src', `/content/${SLOT.key}`)
  })

  test('B-EDT-18 a PDF dropped onto the page becomes a PDF block; other files are left to the editor', async () => {
    const { release, api } = stubNetwork()
    const { screen, textbox } = await renderEditor()
    dropFile(textbox, new File(['zip'], 'notes.zip', { type: 'application/zip' }))
    expect(api).not.toHaveBeenCalled()

    release()
    dropFile(textbox, new File(['%PDF'], 'handout.pdf', { type: 'application/pdf' }))
    await expect.element(screen.getByTitle(m.editor_pdf_title())).toHaveAttribute('src', `/content/${SLOT.key}`)
    expect(screen.getByTitle(m.editor_pdf_title()).element().hasAttribute('sandbox')).toBe(false)
  })

  test('B-EDT-18 a file dropped on an empty block uploads into that block, not a new one', async () => {
    const { release } = stubNetwork()
    const { screen } = await renderEditor()
    await screen.getByRole('button', { name: m.editor_insert() }).click()
    await screen.getByRole('option', { name: m.editor_block_image() }).click()
    release()
    dropFile(screen.getByText(m.ui_file_drop()).element(), new File(['png'], 'drop.png', { type: 'image/png' }))

    await expect.element(screen.getByRole('img', { name: m.editor_image_alt() })).toBeVisible()
    expect(document.querySelectorAll('.ProseMirror img, .ProseMirror input[type=file]')).toHaveLength(1)
  })
})
