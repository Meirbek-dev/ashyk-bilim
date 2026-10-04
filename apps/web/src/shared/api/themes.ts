import { queryOptions } from '@tanstack/react-query'
import * as v from 'valibot'

const vThemeManifest = v.array(
  v.object({
    slug: v.string(),
    name: v.string(),
    /** background, foreground, primary, accent of the light mode: the picker's swatch. */
    preview: v.tuple([v.string(), v.string(), v.string(), v.string()]),
  }),
)

export type ThemeManifest = v.InferOutput<typeof vThemeManifest>

/** The static theme list (public/themes/manifest.json, generated with the theme files; spec 7.10). */
export async function loadThemeManifest(): Promise<ThemeManifest> {
  const response = await fetch('/themes/manifest.json')
  if (!response.ok) throw new Error(`themes manifest: HTTP ${response.status}`)
  return v.parse(vThemeManifest, await response.json())
}

// A static file, not an API operation: there is no generated key. It changes only with a deploy.
const themeManifestKey = ['static', 'themes-manifest'] as const

/** Browser only (a relative URL): a route that loads it sets `ssr: false`. */
export const themeManifestOptions = () =>
  queryOptions({ queryKey: themeManifestKey, queryFn: loadThemeManifest, staleTime: Infinity })
