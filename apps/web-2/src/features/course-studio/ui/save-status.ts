import { createContext } from 'react'

/** What the studio's top bar says about the open activity's autosave. */
export type SaveState = 'dirty' | 'saving' | 'saved' | 'failed'
export type SaveStates = Record<string, Record<string, SaveState>>

/** Every editor of the activity must finish before its header can say "saved". */
export function activitySaveState(states: SaveStates, activityId: string): SaveState | null {
  const editors = Object.values(states[activityId] ?? {})
  return (['failed', 'dirty', 'saving', 'saved'] as const).find(state => editors.includes(state)) ?? null
}

/**
 * The edit tab reports its autosave state to the studio's top bar. Keyed by activity: a state never carries over to
 * another activity opened in the same studio (BUG-282).
 */
export const SaveStatusContext = createContext<(activityId: string, state: SaveState, editorId?: string) => void>(
  () => undefined,
)
