import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bell, Keyboard, Palette, Search, ShieldCheck, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { SearchResults } from '#/shared/api/gen/types.gen'
import { dashboardOptions } from '#/shared/api/gen/@tanstack/react-query.gen'
import { gamificationOn } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'

import {
  PALETTE_LIMIT,
  paletteCourseTarget,
  paletteSections,
  paletteSettings,
  type SettingsPage,
} from '../model/catalog'
import { shortcuts } from '../model/shortcuts'
import { searchResultsOptions } from '../queries'
import { searchKindLabels } from './kind-labels'

/** One choice of the palette: arrows highlight it, Enter or a click runs `onSelect`. */
export type PaletteEntry = {
  /** Unique within the list: the React key. */
  id: string
  label: string
  /** A lucide icon, `aria-hidden`. */
  icon?: ReactNode
  /** Quiet text on the right: a username, a shortcut. */
  hint?: string
  onSelect: () => void
}

type PaletteGroup = { heading: string; entries: readonly PaletteEntry[] }

const settingsIcons: Record<SettingsPage['to'], typeof Bell> = {
  '/settings/profile': UserRound,
  '/settings/security': ShieldCheck,
  '/settings/appearance': Palette,
  '/settings/notifications': Bell,
}

type PaletteActions = { close: () => void; showHelp: () => void }

type Go = (navigation: () => Promise<void>) => () => void

/** The `search` hits as palette groups, in the search page's order; each opens the object's page. */
function hitGroups(found: SearchResults, go: Go, navigate: ReturnType<typeof useNavigate>): PaletteGroup[] {
  return [
    {
      heading: searchKindLabels.courses(),
      entries: found.courses.map(course => ({
        id: `course:${course.id}`,
        label: course.name,
        onSelect: go(() => navigate({ to: paletteCourseTarget(course), params: { courseId: course.id } })),
      })),
    },
    {
      heading: searchKindLabels.lessons(),
      entries: (found.lessons ?? []).map(lesson => ({
        id: `lesson:${lesson.activity_id}`,
        label: lesson.title,
        hint: lesson.course_name,
        onSelect: go(() => navigate({ to: '/courses/$courseId', params: { courseId: lesson.course_id } })),
      })),
    },
    {
      heading: searchKindLabels.collections(),
      entries: found.collections.map(collection => ({
        id: `collection:${collection.id}`,
        label: collection.name,
        onSelect: go(() => navigate({ to: '/collections/$collectionId', params: { collectionId: collection.id } })),
      })),
    },
    {
      heading: searchKindLabels.users(),
      entries: found.users.map(user => ({
        id: `user:${user.id}`,
        label: user.display_name,
        hint: `@${user.username}`,
        onSelect: go(() => navigate({ to: '/users/$username', params: { username: user.username } })),
      })),
    },
  ]
}

/**
 * The palette's entries for the typed text: the sections the user may open (access table), the `search` hits for
 * the settled query `q`, a link to the full search, and the shortcut help.
 */
export function usePaletteGroups(text: string, q: string, { close, showHelp }: PaletteActions): PaletteGroup[] {
  const { data: session } = useSuspenseQuery(sessionOptions())
  const gamification = useSuspenseQueries({
    queries: (session ? [session] : []).map(() => ({ ...dashboardOptions(), select: gamificationOn })),
  })[0]?.data
  const navigate = useNavigate()
  const found = useSuspenseQueries({
    queries: (q ? [q] : []).map(query => searchResultsOptions(query, PALETTE_LIMIT)),
  })[0]?.data
  // An entry closes the palette, then navigates.
  const go = (navigation: () => Promise<void>) => () => {
    close()
    void navigation()
  }
  const navigation = paletteSections(session, text, gamification ?? true).map(({ workspace, sections }) => ({
    heading: workspace.label(),
    entries: sections.map(section => {
      const Icon = section.icon
      return {
        id: `nav:${section.to}`,
        label: section.label(),
        icon: <Icon aria-hidden />,
        onSelect: go(() => navigate({ to: section.to })),
      }
    }),
  }))
  const settings = {
    heading: m.platform_page_settings(),
    entries: paletteSettings(session, text).map(page => {
      const Icon = settingsIcons[page.to]
      return {
        id: `nav:${page.to}`,
        label: page.label(),
        icon: <Icon aria-hidden />,
        onSelect: go(() => navigate({ to: page.to })),
      }
    }),
  }
  const hits = found ? hitGroups(found, go, navigate) : []
  const all: PaletteEntry[] = q
    ? [
        {
          id: 'search:all',
          label: m.catalog_palette_all_results({ q }),
          icon: <Search aria-hidden />,
          onSelect: go(() => navigate({ to: '/search', search: { q } })),
        },
      ]
    : []
  const help: PaletteEntry = {
    id: 'help',
    label: shortcuts.help.label(),
    icon: <Keyboard aria-hidden />,
    hint: shortcuts.help.hotkey,
    onSelect: showHelp,
  }
  const helpShown = help.label.toLowerCase().includes(text.trim().toLowerCase())
  return [
    ...navigation,
    settings,
    ...hits,
    { heading: m.catalog_search_title(), entries: all },
    { heading: m.catalog_help_title(), entries: helpShown ? [help] : [] },
  ].filter(group => group.entries.length > 0)
}
