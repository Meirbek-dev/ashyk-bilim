/** @vitest-environment jsdom */
// UX-149: submission stamps follow the route locale, not the browser's — kk shows «қыр.», never «Sep».

import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vite-plus/test'

import FileSubmissionReceipt from '@/features/file-submissions/student/FileSubmissionReceipt'
import type { FileSubmissionAttempt } from '@/features/file-submissions/services/file-submissions'
import kkMessages from '@/messages/kk-KZ.json'

const attempt = {
  id: 'att-1',
  attempt_number: 1,
  is_late: false,
  submitted_at_unix: Math.floor(Date.UTC(2026, 8, 20, 10, 3) / 1000),
  files: [],
} as unknown as FileSubmissionAttempt

describe('UX-149 receipt date locale', () => {
  it('formats the submitted stamp in the kk month token', () => {
    render(
      <NextIntlClientProvider locale="kk" messages={kkMessages}>
        <FileSubmissionReceipt attempt={attempt} />
      </NextIntlClientProvider>,
    )
    const stamp = screen.getByText(/қыр\./)
    expect(stamp).toHaveTextContent(/2026/)
    expect(stamp.textContent).not.toMatch(/Sep/)
  })
})
