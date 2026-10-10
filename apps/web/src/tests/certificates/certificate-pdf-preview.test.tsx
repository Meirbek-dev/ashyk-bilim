/** @vitest-environment jsdom */
// The on-screen certificate (verify page, course end, teacher editor) is the server PDF - the university template
// learners download - not a look-alike drawn in the browser (DECISIONS «Automatic bilingual certificates»).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { CertificatePdfPreview } from '@/features/certifications/components/CertificatePdfPreview'

function renderPreview(load: () => Promise<Blob>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CertificatePdfPreview
        queryKey={['CODE', 'ru']}
        load={load}
        title="Сертификат"
        frame={node => <section data-testid="card">{node}</section>}
      />
    </QueryClientProvider>,
  )
}

describe('CertificatePdfPreview', () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:certificate')
  })
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'pdfViewerEnabled')
  })

  it('frames the PDF the server prints', async () => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true, configurable: true })
    const load = vi.fn(async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
    renderPreview(load)
    const frame = await screen.findByTestId('certificate-pdf-preview')
    expect(frame.getAttribute('src')).toMatch(/^blob:certificate#/)
    expect(frame).toHaveAttribute('title', 'Сертификат')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('renders nothing (not an empty frame) where the browser shows no PDF in a page', () => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false, configurable: true })
    const load = vi.fn()
    renderPreview(load)
    expect(screen.queryByTestId('card')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })
})
