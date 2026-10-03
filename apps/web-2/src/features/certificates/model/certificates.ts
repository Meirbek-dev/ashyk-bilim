import { client } from '#/shared/api/gen/client.gen'
import type { CertificatePdfData } from '#/shared/api/gen/types.gen'

/**
 * certificatePdf() is a browser download (the API answers `Content-Disposition: attachment`), not a fetch: the button
 * is a link to its URL. Relative, so it stays same-origin (`vp dev` proxies /api/v2); the path comes from the client.
 */
export const certificatePdfHref = (code: string): string =>
  client.buildUrl<CertificatePdfData>({ url: '/api/v2/certificates/{code}/pdf', path: { code }, baseUrl: '' })
