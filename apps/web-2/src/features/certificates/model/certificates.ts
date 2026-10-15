import { m } from '#/paraglide/messages'
import { client } from '#/shared/api/gen/client.gen'
import type {
  CertificatePdfData,
  CertificationConfig,
  CertificationPreviewPdfData,
  CertificationType,
  UiLanguage,
} from '#/shared/api/gen/types.gen'

/**
 * certificatePdf() is a browser download (the API answers `Content-Disposition: attachment`), not a fetch: the button
 * is a link to its URL, in the interface language (`?lang=`: a link cannot set `Accept-Language`). Relative, so it
 * stays same-origin (`vp dev` proxies /api/v2); the path comes from the client.
 */
export const certificatePdfHref = (code: string, lang: UiLanguage): string =>
  client.buildUrl<CertificatePdfData>({
    url: '/api/v2/certificates/{code}/pdf',
    path: { code },
    query: { lang },
    baseUrl: '',
  })

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

// The type keys the server prints on the PDF (certifications/pdf.rs `type_label`).
const typeLabels: Record<CertificationType, () => string> = {
  completion: m.certificates_type_completion,
  achievement: m.certificates_type_achievement,
  assessment: m.certificates_type_assessment,
  participation: m.certificates_type_participation,
  mastery: m.certificates_type_mastery,
  professional: m.certificates_type_professional,
  continuing: m.certificates_type_continuing,
  workshop: m.certificates_type_workshop,
  specialization: m.certificates_type_specialization,
}

/** The certificate as its PDF names it: the author's name and the type, each left out when unset. */
export function certificateKind(config: CertificationConfig): string {
  const name = config.certification_name?.trim()
  const type = config.certification_type ? typeLabels[config.certification_type]() : ''
  return [name, type].filter(Boolean).join(' · ')
}
