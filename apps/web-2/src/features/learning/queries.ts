import type { QueryClient } from '@tanstack/react-query'

import { listEnrollmentsOptions, myCertificatesOptions } from '#/shared/api/gen/@tanstack/react-query.gen'

export const trailOptions = () => listEnrollmentsOptions()
export const certificatesOptions = () => myCertificatesOptions()

/** Route loader of /learning: the caller's courses and certificates, side by side. */
export const ensureLearning = (queryClient: QueryClient) =>
  Promise.all([queryClient.ensureQueryData(trailOptions()), queryClient.ensureQueryData(certificatesOptions())])
