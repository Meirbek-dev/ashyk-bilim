'use client'

import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { useApiError } from '@/hooks/useApiError'
import { linkPreview } from '@/lib/api/generated/utils/utils'
import type { LinkPreview } from '@/lib/api/generated/zod'
import { queryKeys } from '@/lib/react-query/queryKeys'
import type { WebPreviewAttrs } from './WebPreview'

/** `example.com` for the fallback card when the page gave no metadata. */
export function previewHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** Only an http(s) URL becomes an anchor; a rejected value («not a url») stays plain text. */
export function isHttpUrl(url: string | null | undefined): url is string {
  try {
    return Boolean(url) && /^https?:$/.test(new URL(url ?? '').protocol)
  } catch {
    return false
  }
}

/** The node's attributes for a server preview (`GET utils/link-preview`); `og_*` names are the stored schema. */
export function previewToAttrs(url: string, preview: LinkPreview | null): Partial<WebPreviewAttrs> {
  return {
    url,
    title: preview?.title ?? null,
    description: preview?.description ?? null,
    og_image: preview?.image_url ?? null,
    favicon: null,
    og_type: null,
    og_url: preview?.url ?? null,
    site_name: preview?.site_name ?? null,
  }
}

function urlPreviewQueryOptions(url: string) {
  return queryOptions({
    queryKey: queryKeys.activities.linkPreview(url),
    // A 502 means «the page did not answer» — that IS the preview result; never retry the probe.
    queryFn: () => linkPreview({ url }, { retry: 0 }),
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * One `GET utils/link-preview` per confirmed URL — only when the author types
 * it (insert dialog, edit dialog), never on load: a stored block already carries
 * its metadata or the fallback (BUG-107 / UX-025). A failure is toasted here,
 * inside the mutation, so an autosave remount of the caller cannot swallow it,
 * and resolves to the fallback attributes: the link is kept either way.
 */
export function useLinkPreviewLookup() {
  const t = useTranslations('Components.WebPreview')
  const tErrors = useTranslations('Errors')
  const { handleApiError } = useApiError()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (url: string): Promise<Partial<WebPreviewAttrs>> => {
      try {
        const data = await queryClient.fetchQuery(urlPreviewQueryOptions(url))
        if (!(data.title || data.description || data.image_url)) {
          toast.error(t('metadataIncomplete'), { duration: 4000 })
        }
        return previewToAttrs(url, data)
      } catch (failure: unknown) {
        const processed = handleApiError(failure, undefined, t('errorFetchingPreview'))
        // A rejected URL (422 on `url`) reads better as its field message than as "check the form".
        const field = processed.fieldErrors[0]
        const message =
          field && tErrors.has(`fields.${field.code}`) ? tErrors(`fields.${field.code}`) : processed.description
        toast.error(message, { duration: 4000 })
        return previewToAttrs(url, null)
      }
    },
  })
}
