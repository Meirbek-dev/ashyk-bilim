'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { Role } from '@/lib/api/generated/zod'

/**
 * Seeded roles carry i18n keys (`roles.<slug>.name` / `.description`) that the
 * catalogs own; custom roles carry the raw text in the same fields. Resolve a
 * key when the catalog has it, otherwise show the text itself, otherwise the slug.
 */
export function useRoleLabels(roles: readonly Role[] | undefined) {
  const t = useTranslations()
  const resolve = useCallback((key: string, fallback: string) => (key && t.has(key) ? t(key) : key || fallback), [t])

  const roleName = useCallback(
    (roleOrSlug: Role | string) => {
      const role = typeof roleOrSlug === 'string' ? roles?.find(r => r.slug === roleOrSlug) : roleOrSlug
      const slug = typeof roleOrSlug === 'string' ? roleOrSlug : roleOrSlug.slug
      return role ? resolve(role.display_name_key, slug) : slug
    },
    [resolve, roles],
  )
  const roleDescription = useCallback((role: Role) => resolve(role.description_key, ''), [resolve])

  return { roleName, roleDescription }
}
