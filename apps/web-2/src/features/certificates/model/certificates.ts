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
export function certificateKind(config: CertificationConfig, courseName?: string): string {
  const own = config.certification_name?.trim()
  // Next to its course a name that only repeats the course's is left out ("Python · Python course" reads twice).
  const name = own && own.toLowerCase() === courseName?.trim().toLowerCase() ? '' : own
  const type = config.certification_type ? typeLabels[config.certification_type]() : ''
  return [name, type].filter(Boolean).join(' · ')
}

/** What the certificate is called where it travels alone (LinkedIn): its own name, else the course's. */
export const certificateTitle = (config: CertificationConfig, courseName: string): string =>
  config.certification_name?.trim() || courseName

/** The public verify page as an absolute URL: what a holder shares (B-CRT-09). */
export const verifyUrl = (origin: string, code: string): string =>
  `${origin}/certificates/${encodeURIComponent(code)}/verify`

/**
 * LinkedIn's "Add licence or certification" form, prefilled (B-CRT-09): name, issuer, issue month, credential id and
 * URL. The month is the issue date's in UTC; LinkedIn keeps only year and month.
 */
export function linkedInAddHref(input: {
  name: string
  issuer: string
  issuedAtUnix: number
  code: string
  url: string
}) {
  const issued = new Date(input.issuedAtUnix * 1000)
  const href = new URL('https://www.linkedin.com/profile/add')
  const fields = {
    startTask: 'CERTIFICATION_NAME',
    name: input.name,
    organizationName: input.issuer,
    issueYear: String(issued.getUTCFullYear()),
    issueMonth: String(issued.getUTCMonth() + 1),
    certId: input.code,
    certUrl: input.url,
  }
  for (const [key, value] of Object.entries(fields)) href.searchParams.set(key, value)
  return href.href
}
