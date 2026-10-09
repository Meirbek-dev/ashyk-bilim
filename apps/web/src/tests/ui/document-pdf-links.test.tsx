/** @vitest-environment jsdom */
// Phone browsers draw no PDF inside an iframe: the document lesson offers open / download links.
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import DocumentPdfActivity from '@components/Objects/Activities/DocumentPdf/DocumentPdf'
import ruMessages from '@/messages/ru-RU.json'

afterEach(() => vi.unstubAllGlobals())

describe('document lesson', () => {
  it('links the PDF for opening and saving next to the viewer', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <DocumentPdfActivity
          activity={{ activity_uuid: 'a1', name: 'Лекция 1', content: { filename: 'block-pdf/abc' } } as never}
          course={{ course_uuid: 'c1' } as never}
        />
      </NextIntlClientProvider>,
    )
    const open = screen.getByRole('link', { name: 'Открыть в новой вкладке' })
    const save = screen.getByRole('link', { name: 'Скачать' })
    expect(open.getAttribute('href')).toContain('block-pdf/abc')
    expect(open.getAttribute('target')).toBe('_blank')
    expect(save.getAttribute('download')).toBe('Лекция 1.pdf')
    expect(screen.getByTitle(ruMessages.Activities.DocumentPdf.viewerTitle)).toBeTruthy()
  })
})
