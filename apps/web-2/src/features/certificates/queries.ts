import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import { verifyCertificateOptions } from '#/shared/api/gen/@tanstack/react-query.gen'

export const verificationOptions = (code: string) => verifyCertificateOptions({ path: { code } })

/** Route loader: an unknown code (404) is the "not valid" state, drawn by the route's notFoundComponent. */
export async function ensureVerification(queryClient: QueryClient, code: string) {
  return queryClient.ensureQueryData(verificationOptions(code)).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) throw notFound()
    throw error
  })
}
