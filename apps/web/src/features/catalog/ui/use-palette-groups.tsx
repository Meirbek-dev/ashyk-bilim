import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Keyboard, Search } from 'lucide-react'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'

import { PALETTE_LIMIT, paletteSections } from '../model/catalog'
import { shortcuts } from '../model/shortcuts'
import { searchResultsOptions } from '../queries'
import { searchKindLabels } from './kind-labels'

/** One choice of the palette: arrows highlight it, Enter or a click runs `onSelect`. */
type CommandEntry = {
  /** Unique within the list: cmdk tracks the highlighted entry by it. */
  id: string
  label: string
  /** A lucide icon, `aria-hidden`. */
  icon?: ReactNode
  /** Quiet text on the right: a username, a shortcut. */
  hint?: string
  onSelect: () => void
}

type CommandGroup = { heading: string; entries: readonly CommandEntry[] }

type PaletteActions = { close: () => void; showHelp: () => void }

/**
 * The palette's entries for the typed text: the sections the user may open (access table), the `search` hits for
 * the settled query `q`, a link to the full search, and the shortcut help.
 */
export function usePaletteGroups(text: string, q: string, { close, showHelp }: PaletteActions): CommandGroup[] {
  const { data: session } = useSuspenseQuery(sessionOptions())
  const navigate = useNavigate()
  const found = useSuspenseQueries({
    queries: (q ? [q] : []).map(query => searchResultsOptions(query, PALETTE_LIMIT)),
  })[0]?.data
  // An entry closes the palette, then navigates.
  const go = (navigation: () => Promise<void>) => () => {
    close()
    void navigation()
  }
  const navigation = paletteSections(session, text).map(({ workspace, sections }) => ({
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
  const hits: CommandGroup[] = found
    ? [
        {
          heading: searchKindLabels.courses(),
          entries: found.courses.map(course => ({
            id: `course:${course.id}`,
            label: course.name,
            onSelect: go(() => navigate({ to: '/courses/$courseId', params: { courseId: course.id } })),
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
    : []
  const all: CommandEntry[] = q
    ? [
        {
          id: 'search:all',
          label: m.catalog_palette_all_results({ q }),
          icon: <Search aria-hidden />,
          onSelect: go(() => navigate({ to: '/search', search: { q } })),
        },
      ]
    : []
  const help: CommandEntry = {
    id: 'help',
    label: shortcuts.help.label(),
    icon: <Keyboard aria-hidden />,
    hint: shortcuts.help.hotkey,
    onSelect: showHelp,
  }
  const helpShown = help.label.toLowerCase().includes(text.trim().toLowerCase())
  return [
    ...navigation,
    ...hits,
    { heading: m.catalog_search_title(), entries: all },
    { heading: m.catalog_help_title(), entries: helpShown ? [help] : [] },
  ].filter(group => group.entries.length > 0)
}
