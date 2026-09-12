/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'

const mocks = vi.hoisted(() => ({
  apiBody: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiBody: mocks.apiBody }))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }))
vi.mock('next-intl', () => ({
  useLocale: () => 'kk-KZ',
  useTranslations: (namespace: string) => {
    const t = (key: string) => `${namespace}.${key}`
    t.has = (key: string) => key === 'codes.not-found'
    return t
  },
}))

import { CertificatePdfDownloadButton } from '@/features/certifications/components/CertificatePdfDownloadButton'

const CODE = 'ABCD-EFGH-JKLM-NPQR'

describe('CertificatePdfDownloadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:certificate')
    globalThis.URL.revokeObjectURL = vi.fn()
    HTMLAnchorElement.prototype.click = vi.fn()
  })

  it('fetches `certificates/{code}/pdf` in the UI language and hands the Blob to the browser', async () => {
    mocks.apiBody.mockResolvedValue(new Blob(['%PDF-1.7'], { type: 'application/pdf' }))

    render(<CertificatePdfDownloadButton verifyCode={CODE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Certificates.Pdf.download' }))

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Certificates.Pdf.downloaded'))
    expect(mocks.apiBody).toHaveBeenCalledWith(`certificates/${CODE}/pdf`, {
      responseType: 'blob',
      headers: { 'Accept-Language': 'kk-KZ' },
    })
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:certificate')
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('toasts the localized problem code when the server refuses', async () => {
    mocks.apiBody.mockRejectedValue(new APIError({ code: 'not-found', message: 'certificate not found', status: 404 }))

    render(<CertificatePdfDownloadButton verifyCode={CODE} />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1))
    expect(String(mocks.toastError.mock.calls[0]?.[0])).toContain('codes.not-found')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })
})
