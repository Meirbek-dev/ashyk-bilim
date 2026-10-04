import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import { listEnrollmentsOptions, myCertificatesPageInfiniteQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import { myCertificatesPage } from '#/shared/api/gen/sdk.gen'
import type { IssuedCertificate, IssuedCertificatePage } from '#/shared/api/gen/types.gen'

const PAGE_SIZE = 20

export const trailOptions = () => listEnrollmentsOptions()

/**
 * The caller's certificates, keyset paged, read as one array. Composed by hand: the generated infinite options type
 * the queryFn as skippable, which useSuspenseInfiniteQuery rejects.
 */
export const certificatesOptions = () => {
  const query = { limit: PAGE_SIZE }
  return infiniteQueryOptions<
    IssuedCertificatePage,
    ApiError,
    IssuedCertificate[],
    ReturnType<typeof myCertificatesPageInfiniteQueryKey>,
    string | undefined
  >({
    queryKey: myCertificatesPageInfiniteQueryKey({ query }),
    queryFn: async ({ pageParam, signal }) => {
      const cursor = pageParam ? { cursor: pageParam } : {}
      const { data } = await myCertificatesPage({ query: { ...query, ...cursor }, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
    select: (data: InfiniteData<IssuedCertificatePage>) => data.pages.flatMap(page => page.items),
  })
}

/** Route loader of /learning: the caller's courses and certificates, side by side. */
export const ensureLearning = (queryClient: QueryClient) =>
  Promise.all([queryClient.ensureQueryData(trailOptions()), queryClient.ensureInfiniteQueryData(certificatesOptions())])
