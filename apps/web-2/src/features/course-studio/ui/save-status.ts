import { createContext } from 'react'

/** What the studio's top bar says about the open activity's autosave. */
export type SaveState = 'dirty' | 'saving' | 'saved' | 'failed'

/**
 * The edit tab reports its autosave state to the studio's top bar. Keyed by activity: a state never carries over to
 * another activity opened in the same studio (BUG-282).
 */
export const SaveStatusContext = createContext<(activityId: string, state: SaveState) => void>(() => undefined)
