/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'

const mocks = vi.hoisted(() => ({
  linkPreview: vi.fn(),
  toastError: vi.fn(),
  editor: {
    storage: { blockWebPreview: { insertOpen: true } },
    commands: { closeWebPreviewDialog: vi.fn() },
    inserted: [] as unknown[],
  },
}))

vi.mock('@/lib/api/generated/utils/utils', () => ({ linkPreview: mocks.linkPreview }))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const t = (key: string) => `${namespace}.${key}`
    t.has = (key: string) => key === 'codes.link-preview-failed' || key === 'fields.unsafe'
    return t
  },
}))
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useTiptap: () => ({
    editor: {
      ...mocks.editor,
      chain: () => ({
        focus: () => ({
          insertWebPreview: (attrs: unknown) => ({
            run: () => {
              mocks.editor.inserted.push(attrs)
            },
          }),
        }),
      }),
    },
  }),
  useEditorState: ({ selector }: { selector: (ctx: { editor: typeof mocks.editor }) => boolean }) =>
    selector({ editor: mocks.editor }),
}))
vi.mock('@components/Contexts/Editor/EditorContext', () => ({ useEditorProvider: () => ({ isEditable: true }) }))
vi.mock('@/components/Objects/Elements/Modal/Modal', () => ({
  default: (props: { isDialogOpen?: boolean; dialogContent: ReactNode }) =>
    props.isDialogOpen ? <div role="dialog">{props.dialogContent}</div> : null,
}))
vi.mock('@components/ui/NextImage', () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }))

import WebPreviewComponent from '@/components/Objects/Editor/Extensions/WebPreview/WebPreviewComponent'
import { WebPreviewInsertDialog } from '@/components/Objects/Editor/Extensions/WebPreview/WebPreviewInsertDialog'
import {
  previewHostname,
  previewToAttrs,
  useLinkPreviewLookup,
} from '@/components/Objects/Editor/Extensions/WebPreview/link-preview'
import type { WebPreviewAttrs } from '@/components/Objects/Editor/Extensions/WebPreview/WebPreview'

const URL_UNDER_TEST = 'https://example.com/posts/1'

/** Verbatim `GET /utils/link-preview` answer from the Rust server. */
const wire = {
  url: 'https://example.com/posts/1',
  title: 'Rust & friends',
  description: 'A post about things.',
  image_url: 'https://example.com/cover.png',
  site_name: 'Example Blog',
}

function attrs(overrides: Partial<WebPreviewAttrs> = {}): WebPreviewAttrs {
  return {
    url: null,
    title: null,
    description: null,
    og_image: null,
    favicon: null,
    og_type: null,
    og_url: null,
    site_name: null,
    alignment: 'left',
    buttonLabel: '',
    showButton: false,
    openInPopup: false,
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderBlock(nodeAttrs: WebPreviewAttrs) {
  const updateAttributes = vi.fn()
  const deleteNode = vi.fn()
  // Only the node, the attribute setter and delete are read by the view.
  const props = { node: { attrs: nodeAttrs }, updateAttributes, deleteNode } as unknown as Parameters<
    typeof WebPreviewComponent
  >[0]
  render(<WebPreviewComponent {...props} />, { wrapper })
  return { updateAttributes, deleteNode }
}

describe('editor link block on `GET utils/link-preview`', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.editor.storage.blockWebPreview.insertOpen = true
    mocks.editor.inserted = []
  })

  it('maps the v2 preview onto the stored `og_*` attributes', () => {
    expect(previewToAttrs(URL_UNDER_TEST, wire)).toEqual({
      url: URL_UNDER_TEST,
      title: 'Rust & friends',
      description: 'A post about things.',
      og_image: 'https://example.com/cover.png',
      favicon: null,
      og_type: null,
      og_url: 'https://example.com/posts/1',
      site_name: 'Example Blog',
    })
    expect(previewToAttrs(URL_UNDER_TEST, null).title).toBeNull()
    expect(previewHostname(URL_UNDER_TEST)).toBe('example.com')
    expect(previewHostname('not a url')).toBe('not a url')
  })

  it('resolves a confirmed URL once and stores the card', async () => {
    mocks.linkPreview.mockResolvedValue(wire)
    const { result } = renderHook(() => useLinkPreviewLookup(), { wrapper })

    await expect(result.current.mutateAsync(URL_UNDER_TEST)).resolves.toEqual(previewToAttrs(URL_UNDER_TEST, wire))
    expect(mocks.linkPreview).toHaveBeenCalledWith({ url: URL_UNDER_TEST }, { retry: 0 })
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('keeps the link as the fallback card and toasts the localized code when the preview fails', async () => {
    mocks.linkPreview.mockRejectedValue(
      new APIError({ code: 'link-preview-failed', message: 'page answered 500', status: 502 }),
    )
    const { result } = renderHook(() => useLinkPreviewLookup(), { wrapper })

    await expect(result.current.mutateAsync(URL_UNDER_TEST)).resolves.toEqual(previewToAttrs(URL_UNDER_TEST, null))
    expect(String(mocks.toastError.mock.calls[0]?.[0])).toContain('codes.link-preview-failed')
    expect(String(mocks.toastError.mock.calls[0]?.[0])).not.toContain('page answered')
  })

  it('toasts the field message for a URL the server refuses', async () => {
    mocks.linkPreview.mockRejectedValue(
      new APIError({
        code: 'validation-failed',
        message: 'Validation failed',
        status: 422,
        fieldErrors: [{ field: 'url', code: 'unsafe', message: 'URL resolves to a non-public address' }],
      }),
    )
    const { result } = renderHook(() => useLinkPreviewLookup(), { wrapper })

    await result.current.mutateAsync('http://10.0.0.1/secret')
    expect(String(mocks.toastError.mock.calls[0]?.[0])).toBe('Errors.fields.unsafe')
  })

  it('renders a stored fallback card without refetching (UX-025)', () => {
    const REJECTED = 'http://10.255.255.1/private'
    renderBlock(attrs(previewToAttrs(REJECTED, null)))

    expect(screen.getByTestId('web-preview-fallback')).toHaveTextContent('10.255.255.1')
    expect(screen.getByText('Components.WebPreview.previewUnavailable')).toBeInTheDocument()
    expect(screen.getByTestId('web-preview-fallback').closest('a')).not.toBeNull()
    expect(mocks.linkPreview).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('renders the stored card with the site name without refetching', () => {
    renderBlock(attrs(previewToAttrs(URL_UNDER_TEST, wire)))

    expect(screen.getByText('Rust & friends')).toBeInTheDocument()
    expect(screen.getByText('Example Blog')).toBeInTheDocument()
    expect(mocks.linkPreview).not.toHaveBeenCalled()
  })

  it('opens no dialog for a stored block without a URL; cancelling its edit removes it', () => {
    const { deleteNode } = renderBlock(attrs())

    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('Components.WebPreview.enterWebsiteUrl'))
    fireEvent.click(screen.getByText('Components.WebPreview.cancel'))
    expect(deleteNode).toHaveBeenCalled()
  })

  // BUG-107: the block exists only after the URL dialog confirms.
  it('insert dialog: cancel inserts nothing, confirm inserts the resolved block', async () => {
    mocks.linkPreview.mockResolvedValue(wire)
    render(<WebPreviewInsertDialog />, { wrapper })

    fireEvent.click(screen.getByText('Components.WebPreview.cancel'))
    expect(mocks.editor.commands.closeWebPreviewDialog).toHaveBeenCalled()
    expect(mocks.editor.inserted).toEqual([])

    fireEvent.change(screen.getByLabelText('Components.WebPreview.websiteUrl'), { target: { value: 'not a url' } })
    fireEvent.click(screen.getByText('Components.WebPreview.save'))
    expect(screen.getByText('Components.WebPreview.urlMustBeHttp')).toBeInTheDocument()
    expect(mocks.editor.inserted).toEqual([])

    fireEvent.change(screen.getByLabelText('Components.WebPreview.websiteUrl'), { target: { value: URL_UNDER_TEST } })
    fireEvent.click(screen.getByText('Components.WebPreview.save'))
    await waitFor(() => expect(mocks.editor.inserted).toEqual([previewToAttrs(URL_UNDER_TEST, wire)]))
    expect(mocks.linkPreview).toHaveBeenCalledTimes(1)
  })
})
