/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'

const mocks = vi.hoisted(() => ({
  linkPreview: vi.fn(),
  toastError: vi.fn(),
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
}))
vi.mock('@components/Contexts/Editor/EditorContext', () => ({ useEditorProvider: () => ({ isEditable: true }) }))
vi.mock('@/components/Objects/Elements/Modal/Modal', () => ({ default: () => null }))
vi.mock('@components/ui/NextImage', () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }))

import WebPreviewComponent, {
  previewHostname,
  previewToAttrs,
} from '@/components/Objects/Editor/Extensions/WebPreview/WebPreviewComponent'
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

function renderBlock(nodeAttrs: WebPreviewAttrs) {
  const updateAttributes = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Only the node, the attribute setter and delete are read by the view.
  const props = { node: { attrs: nodeAttrs }, updateAttributes, deleteNode: vi.fn() } as unknown as Parameters<
    typeof WebPreviewComponent
  >[0]
  render(
    <QueryClientProvider client={client}>
      <WebPreviewComponent {...props} />
    </QueryClientProvider>,
  )
  return updateAttributes
}

describe('editor link block on `GET utils/link-preview`', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('fetches the preview for a saved link and stores the card', async () => {
    mocks.linkPreview.mockResolvedValue(wire)

    const updateAttributes = renderBlock(attrs({ url: URL_UNDER_TEST }))

    await waitFor(() => expect(updateAttributes).toHaveBeenCalledWith(previewToAttrs(URL_UNDER_TEST, wire)))
    expect(mocks.linkPreview).toHaveBeenCalledWith({ url: URL_UNDER_TEST })
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('keeps the link and renders the localized fallback card when the preview fails', async () => {
    mocks.linkPreview.mockRejectedValue(
      new APIError({ code: 'link-preview-failed', message: 'page answered 500', status: 502 }),
    )

    const updateAttributes = renderBlock(attrs({ url: URL_UNDER_TEST }))

    await waitFor(() => expect(updateAttributes).toHaveBeenCalledWith(previewToAttrs(URL_UNDER_TEST, null)))
    expect(String(mocks.toastError.mock.calls[0]?.[0])).toContain('codes.link-preview-failed')
    expect(screen.getByTestId('web-preview-fallback')).toHaveTextContent('example.com')
    expect(screen.getByText('Components.WebPreview.previewUnavailable')).toBeInTheDocument()
    expect(screen.queryByText(/page answered/u)).not.toBeInTheDocument()
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

    const updateAttributes = renderBlock(attrs({ url: 'http://10.0.0.1/secret' }))

    await waitFor(() => expect(updateAttributes).toHaveBeenCalledWith(previewToAttrs('http://10.0.0.1/secret', null)))
    expect(String(mocks.toastError.mock.calls[0]?.[0])).toBe('Errors.fields.unsafe')
  })

  it('renders the stored card with the site name without refetching', () => {
    renderBlock(attrs(previewToAttrs(URL_UNDER_TEST, wire)))

    expect(screen.getByText('Rust & friends')).toBeInTheDocument()
    expect(screen.getByText('Example Blog')).toBeInTheDocument()
    expect(mocks.linkPreview).not.toHaveBeenCalled()
  })
})
