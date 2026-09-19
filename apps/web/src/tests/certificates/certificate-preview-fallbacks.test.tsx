/** @vitest-environment jsdom */
// UX-131: an issued certificate whose config lacks `certification_type` /
// `certificate_instructor` never shows the editor's sample data or a raw
// i18n key — the type falls back to «completion», the instructor to what
// the server resolved (the course creator, as the PDF prints it).
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/components/Contexts/PlatformContext', () => ({ usePlatform: () => null }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => '') } }))

const SAMPLE_INSTRUCTOR = ruMessages.Certificates.CertificatePreview.instructorName
const COMPLETION = ruMessages.Certificates.EditCourseCertification.certificationTypes.completion

function renderPreview(props: Partial<React.ComponentProps<typeof CertificatePreview>>) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <CertificatePreview certificationName="Rust 101" certificationDescription="" certificatePattern="" {...props} />
    </NextIntlClientProvider>,
  )
}

describe('CertificatePreview fallbacks (UX-131)', () => {
  it('issued certificate: default type, server instructor, no sample data', () => {
    renderPreview({ certificateInstructor: 'Асель Нурланова', certificateId: 'ABCD-EFGH-IJKL-MNOP' })
    expect(screen.getByText(COMPLETION)).toBeInTheDocument()
    expect(screen.getByText('Асель Нурланова')).toBeInTheDocument()
    expect(screen.queryByText(SAMPLE_INSTRUCTOR)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('certificationTypes')
  })

  it('issued certificate without any instructor shows a dash, not the sample', () => {
    renderPreview({ certificateId: 'ABCD-EFGH-IJKL-MNOP' })
    expect(screen.queryByText(SAMPLE_INSTRUCTOR)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('OU-2025-001')
  })

  it('editor preview keeps its sample data', () => {
    renderPreview({ sample: true })
    expect(screen.getByText(SAMPLE_INSTRUCTOR)).toBeInTheDocument()
    expect(document.body.textContent).toContain('OU-2025-001')
  })
})
