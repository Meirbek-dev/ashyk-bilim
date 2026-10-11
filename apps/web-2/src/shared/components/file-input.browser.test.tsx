import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as v from 'valibot'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { FinalizedUpload } from '#/shared/api/gen/types.gen'
import { FakeStorage, json, SLOT } from '#/shared/api/testing'
import { clipboardImage } from '#/shared/api/upload'
import { formatFileSize } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'

import { FileInput } from './file-input'
import { FileField } from './form/file-field'
import { useAppForm } from './form/use-app-form'
import { renderInRouter } from './testing'

const label = 'Cover'
const MB = 1024 * 1024

function stubNetwork() {
  const api = vi.fn<(request: Request) => Promise<Response>>(async request =>
    request.url.endsWith('/finalize') ? json({ id: SLOT.id, key: SLOT.key, size_bytes: 4 }) : json(SLOT),
  )
  vi.stubGlobal('fetch', api)
  vi.stubGlobal('XMLHttpRequest', FakeStorage)
  return api
}

const schema = v.object({ cover_upload_id: v.nullable(v.string()) })
const save = 'Save'

/** FileField inside a form: the field's value becomes the finalized upload id. */
function CoverForm({ submit }: { submit: (id: string | null) => void }) {
  const form = useAppForm(schema, {
    defaultValues: { cover_upload_id: null },
    onSubmit: body => submit(body.cover_upload_id),
  })
  return (
    <>
      <form.AppField name="cover_upload_id">
        {() => <FileField label={label} purpose="course-thumbnail" />}
      </form.AppField>
      <Button onClick={() => void form.handleSubmit()}>{save}</Button>
    </>
  )
}

async function renderInput() {
  const onUploaded = vi.fn<(upload: FinalizedUpload) => void>()
  const screen = await renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <FileInput label={label} purpose="course-thumbnail" onUploaded={onUploaded} />
    </QueryClientProvider>,
  )
  return { screen, onUploaded, input: screen.getByLabelText(label) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeStorage.gate = Promise.resolve()
})

describe('FileInput', () => {
  test('a picked file uploads with progress and hands over the finalized upload', async () => {
    stubNetwork()
    const held = Promise.withResolvers<null>()
    FakeStorage.gate = held.promise
    const { screen, onUploaded, input } = await renderInput()

    await userEvent.upload(input, new File(['abcd'], 'cover.png', { type: 'image/png' }))
    await expect.element(screen.getByRole('progressbar', { name: m.ui_file_uploading() })).toBeVisible()
    held.resolve(null)

    await expect.element(screen.getByText(m.ui_file_uploaded({ name: 'cover.png' }))).toBeVisible()
    expect(onUploaded).toHaveBeenCalledWith(
      { id: SLOT.id, key: SLOT.key, size_bytes: 4 },
      expect.objectContaining({ name: 'cover.png' }),
    )
    expect(screen.getByRole('progressbar').query()).toBeNull()
  })

  test('a file over the purpose cap is refused before any request', async () => {
    const api = stubNetwork()
    const { screen, onUploaded, input } = await renderInput()

    await userEvent.upload(input, new File([new Uint8Array(11 * MB)], 'big.png', { type: 'image/png' }))

    await expect.element(screen.getByText(m.ui_file_too_large({ size: formatFileSize(10 * MB) }))).toBeVisible()
    await expect.element(input).toHaveAttribute('aria-invalid', 'true')
    expect(api).not.toHaveBeenCalled()
    expect(onUploaded).not.toHaveBeenCalled()
  })

  test('a dropped file of the wrong type is refused; an API error shows its text', async () => {
    const api = stubNetwork()
    const { screen, input } = await renderInput()
    await expect.element(input).toBeInTheDocument()
    const zone = input.element().parentElement
    const transfer = new DataTransfer()
    transfer.items.add(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }))

    zone?.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
    await expect.element(screen.getByText(m.ui_file_wrong_type())).toBeVisible()
    expect(api).not.toHaveBeenCalled()

    api.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ type: 'about:blank', title: 'Too large', status: 413, code: 'payload-too-large' }),
        {
          status: 413,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )
    await userEvent.upload(input, new File(['abcd'], 'b.png', { type: 'image/png' }))
    await expect.element(screen.getByText(m.errors_payload_too_large())).toBeVisible()
  })

  test('FileField puts the finalized upload id into the form value', async () => {
    stubNetwork()
    const submit = vi.fn<(id: string | null) => void>()
    const screen = await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <CoverForm submit={submit} />
      </QueryClientProvider>,
    )
    await userEvent.upload(screen.getByLabelText(label), new File(['abcd'], 'c.png', { type: 'image/png' }))
    await expect.element(screen.getByText(m.ui_file_uploaded({ name: 'c.png' }))).toBeVisible()
    await screen.getByRole('button', { name: save }).click()
    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith(SLOT.id))
  })

  test('clipboardImage finds the pasted image and ignores text', () => {
    const transfer = new DataTransfer()
    transfer.items.add('just text', 'text/plain')
    expect(clipboardImage(transfer)).toBeNull()
    transfer.items.add(new File(['png'], 'shot.png', { type: 'image/png' }))
    expect(clipboardImage(transfer)?.name).toBe('shot.png')
    expect(clipboardImage(null)).toBeNull()
  })
})

const png = (name: string) => new File(['abcd'], name, { type: 'image/png' })

describe('FileInput with several files', () => {
  test('the picker is named by its label and the visible button words', async () => {
    const { input } = await renderInput()
    await expect.element(input).toHaveAccessibleName(`${label} ${m.ui_file_choose()}`)
  })

  test('with `multiple`, picked files upload in turn, each claim awaited; files over the cap are named', async () => {
    stubNetwork()
    const claim = Promise.withResolvers<null>()
    const onUploaded = vi.fn<(upload: FinalizedUpload, file: File) => Promise<unknown>>(async (_upload, file) =>
      file.name === 'a.png' ? claim.promise : null,
    )
    const screen = await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <FileInput label={label} purpose="course-thumbnail" multiple={2} onUploaded={onUploaded} />
      </QueryClientProvider>,
    )
    const input = screen.getByLabelText(label)
    await expect.element(input).toHaveAttribute('multiple')
    await userEvent.upload(input, [png('a.png'), png('b.png'), png('c.png')])

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    await expect.element(screen.getByText(m.ui_files_over({ count: 1 }))).toBeVisible()
    expect(onUploaded).toHaveBeenCalledTimes(1)
    claim.resolve(null)
    await expect.element(screen.getByText(m.ui_file_uploaded({ name: 'a.png, b.png' }))).toBeVisible()
    expect(onUploaded.mock.calls.map(([, file]) => file.name)).toEqual(['a.png', 'b.png'])
  })
})

describe('FileInput while uploading', () => {
  test('a running upload shows its size and can be cancelled; nothing is handed over', async () => {
    const api = stubNetwork()
    const held = Promise.withResolvers<null>()
    FakeStorage.gate = held.promise
    const { screen, onUploaded, input } = await renderInput()

    await userEvent.upload(input, new File(['abcd'], 'cover.png', { type: 'image/png' }))
    await expect
      .element(screen.getByText(m.ui_file_progress({ done: formatFileSize(2), total: formatFileSize(4) })))
      .toBeVisible()
    await screen.getByRole('button', { name: m.ui_file_cancel() }).click()
    await expect.element(screen.getByRole('progressbar')).not.toBeInTheDocument()
    held.resolve(null)
    expect(api).toHaveBeenCalledTimes(1)
    expect(onUploaded).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: m.ui_file_retry() }).query()).toBeNull()
  })

  test('an empty file is refused; a failed upload can be retried with the same file', async () => {
    const api = stubNetwork()
    const { screen, onUploaded, input } = await renderInput()
    await userEvent.upload(input, new File([], 'empty.png', { type: 'image/png' }))
    await expect.element(screen.getByText(m.ui_file_empty())).toBeVisible()
    expect(api).not.toHaveBeenCalled()

    FakeStorage.status = 503
    await userEvent.upload(input, new File(['abcd'], 'c.png', { type: 'image/png' }))
    await expect.element(screen.getByText(m.errors_network())).toBeVisible()
    FakeStorage.status = 200
    await screen.getByRole('button', { name: m.ui_file_retry() }).click()
    await expect.element(screen.getByText(m.ui_file_uploaded({ name: 'c.png' }))).toBeVisible()
    expect(onUploaded).toHaveBeenCalledTimes(1)
  })
})
