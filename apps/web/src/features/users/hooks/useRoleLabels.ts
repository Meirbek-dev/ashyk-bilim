'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { Role } from '@/lib/api/generated/zod'

/**
 * Seeded roles carry i18n keys (`roles.<slug>.name` / `.description`) that the
 * catalogs own; custom roles carry raw text in `display_name` / `description`.
 * Text wins, then a catalog hit for the key, then the slug.
 */
export function useRoleLabels(roles: readonly Role[] | undefined) {
  const t = useTranslations()
  const resolve = useCallback(
    (text: string | null | undefined, key: string, fallback: string) => text || (t.has(key) ? t(key) : fallback),
    [t],
  )

  const roleName = useCallback(
    (roleOrSlug: Role | string) => {
      const role = typeof roleOrSlug === 'string' ? roles?.find(r => r.slug === roleOrSlug) : roleOrSlug
      const slug = typeof roleOrSlug === 'string' ? roleOrSlug : roleOrSlug.slug
      return role ? resolve(role.display_name, role.display_name_key, slug) : slug
    },
    [resolve, roles],
  )
  const roleDescription = useCallback((role: Role) => resolve(role.description, role.description_key, ''), [resolve])

  return { roleName, roleDescription }
}
