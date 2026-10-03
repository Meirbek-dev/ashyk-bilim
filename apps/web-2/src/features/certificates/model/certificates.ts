import { client } from '#/shared/api/gen/client.gen'
import type { CertificatePdfData, CertificationPreviewPdfData, UiLanguage } from '#/shared/api/gen/types.gen'

/**
 * certificatePdf() is a browser download (the API answers `Content-Disposition: attachment`), not a fetch: the button
 * is a link to its URL. Relative, so it stays same-origin (`vp dev` proxies /api/v2); the path comes from the client.
 */
export const certificatePdfHref = (code: string): string =>
  client.buildUrl<CertificatePdfData>({ url: '/api/v2/certificates/{code}/pdf', path: { code }, baseUrl: '' })

/**
 * certificationPreviewPdf() is a sample of a course's template (the API answers `inline`): shown in a same-origin frame,
 * so the frame's `src` is its URL, in the interface language (`?lang=`, the browser's `Accept-Language` may differ).
 */
export const certificationPreviewHref = (certificationId: string, lang: UiLanguage): string =>
  client.buildUrl<CertificationPreviewPdfData>({
    url: '/api/v2/certifications/{certification_id}/preview.pdf',
    path: { certification_id: certificationId },
    query: { lang },
    baseUrl: '',
  })
