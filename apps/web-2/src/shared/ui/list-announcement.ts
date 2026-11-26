import { m } from '#/paraglide/messages'

type ListAnnouncement =
  | { type: 'results'; count: number; query: string; loading: boolean }
  | { type: 'removed'; label: string }

/** What a searchable list says to screen readers after typing pauses or a chip goes: ui-sdk's default is English. */
export function listAnnouncement(change: ListAnnouncement) {
  if (change.type === 'removed') return m.ui_option_removed({ label: change.label })
  if (change.loading) return m.ui_loading()
  return change.count === 0 ? m.ui_options_empty() : m.ui_results({ count: change.count })
}
