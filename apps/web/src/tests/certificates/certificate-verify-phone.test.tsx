/** @vitest-environment jsdom */
// UX-179: at 390 px the «Сертификат подтверждён» badge sat on one unwrappable
// row with the title and overflowed the card (ru 470, kk 481 px). The row
// wraps and the badge never grows past its card.
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import CertificateVerificationPage from '@components/Pages/Certificate/CertificateVerificationPage'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview', () => ({
  default: () => null,
}))
vi.mock('@/features/certifications/components/CertificatePdfDownloadButton', () => ({
  CertificatePdfDownloadButton: () => null,
}))
vi.mock('@/features/certifications/hooks/useCertifications', () => ({
  useCertificateByUuid: () => ({
    isPending: false,
    error: null,
    data: {
      data: {
        certificate_user: { user_certification_uuid: 'ABCD-EFGH-IJKL-MNOP', created_at: '2026-09-24T10:00:00Z' },
        certification: { config: { certification_name: 'Rust 101' } },
        course: { name: 'Rust 101', course_uuid: 'course_x', thumbnail_image: null, description: null },
        instructor_name: null,
      },
    },
  }),
}))

describe('certificate verify page on a phone (UX-179)', () => {
  it('wraps the status badge inside its card', async () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <CertificateVerificationPage certificateUuid="ABCD-EFGH-IJKL-MNOP" />
      </NextIntlClientProvider>,
    )
    const badge = await screen.findByTestId('verification-status')
    expect(badge).toHaveTextContent(ruMessages.Certificates.CertificateVerificationPage.certificateVerified)
    expect(badge.className).toContain('max-w-full')
    expect(badge.parentElement?.className).toContain('flex-wrap')
  })
})
