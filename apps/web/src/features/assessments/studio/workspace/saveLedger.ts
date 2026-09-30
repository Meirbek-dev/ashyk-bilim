import type { SaveState } from '@/features/assessments/shared/SaveStateBadge'

export interface SaveLedgerEntry {
  id: string
  label: string
  state: SaveState
  updatedAt: number
  retry?: () => void
}

export interface SaveLedgerSummary {
  entries: SaveLedgerEntry[]
  state: SaveState
  hasBlockingSaveState: boolean
  liveMessage: string
}

/** `Components.SaveStateBadge` key per non-idle state (the badge's own labels). */
export const SAVE_STATE_LABEL_KEY = {
  dirty: 'unsaved',
  saving: 'saving',
  saved: 'saved',
  error: 'saveFailed',
} as const satisfies Record<Exclude<SaveState, 'idle'>, string>

/**
 * `describeState` localizes the state for the aria-live text (BUG-209: the
 * raw enum — «Выбранный элемент: dirty» — was read out to screen readers).
 */
export function summarizeSaveLedger(
  entries: SaveLedgerEntry[],
  describeState: (state: Exclude<SaveState, 'idle'>) => string = state => state,
): SaveLedgerSummary {
  const activeEntries = entries.filter(entry => entry.state !== 'idle')
  const state = reduceSaveState(activeEntries.map(entry => entry.state))
  return {
    entries: activeEntries,
    state,
    hasBlockingSaveState: state === 'dirty' || state === 'saving' || state === 'error',
    liveMessage: activeEntries
      .map(entry => `${entry.label}: ${describeState(entry.state as Exclude<SaveState, 'idle'>)}`)
      .join(', '),
  }
}

function reduceSaveState(states: SaveState[]): SaveState {
  if (states.includes('error')) return 'error'
  if (states.includes('saving')) return 'saving'
  if (states.includes('dirty')) return 'dirty'
  if (states.includes('saved')) return 'saved'
  return 'idle'
}
